#!/usr/bin/env node
/**
 * Decide START sau PAUSE dupa data/ora Europe/Bucharest.
 *
 * === REGULI (editeaza aici) ===
 *
 * Decizia e pe orice minut din Europe/Bucharest, nu doar la minutele din cron.
 * Aceeasi fereastra intoarce mereu aceeasi actiune, deci o rulare intarziata
 * sau repetata este idempotenta: nu inverseaza starea.
 *
 * Din 2026-11-16 (inclusiv), in fiecare zi, program continuu:
 *   START in [08:00, 24:00) si [00:00, 01:00); PAUSE in [01:00, 08:00).
 *   Nu mai exista pauza la 14:00.
 *
 * Hold de buget (PAUSE_UNTIL_EVENING): daca holdDate este ziua curenta din
 * Bucuresti si ora este inainte de 18:30, rezultatul este PAUSE chiar daca
 * programul ar fi START. La 18:30 hold-ul expira si programul reia (START
 * pana la 01:00). Hold-ul nu trece de miezul noptii: data de ieri nu blocheaza
 * ziua noua. Exceptia Black Friday are prioritate fata de hold.
 *
 * Inainte de 2026-11-16 (neschimbat):
 *   Fereastra larga 2026-11-02..05 si 2026-11-07..15:
 *     START in [11:00, 14:00) si [19:00, 01:00); PAUSE in rest.
 *   Black Friday [2026-11-05 18:30, 2026-11-07 01:00): mereu START.
 *   In rest: START in [18:30, 01:00); PAUSE in rest.
 *
 * Weekend: pentru alta ora de start, decomenteaza WEEKEND_START de mai jos.
 * Fus: Europe/Bucharest prin Intl (noiembrie = UTC+2, vara = UTC+3). Nu se
 * foloseste un offset fix.
 */

'use strict';

// --- configurare usoara ---
const DEFAULT_START_MIN = 18 * 60 + 30; // inainte de 16 nov 2026: 18:30 inclusiv
const CONTINUOUS_START_MIN = 8 * 60;    // din 16 nov 2026: 08:00 inclusiv
const EVENING_RESUME_MIN = 18 * 60 + 30; // hold-ul de buget expira la 18:30
// Fereastra larga (doar pana la 15 nov 2026): [11:00, 14:00) si [19:00, 01:00)
const WIDE_AM_START_MIN = 11 * 60;
const WIDE_AM_END_MIN = 14 * 60;
const WIDE_PM_START_MIN = 19 * 60;
const PAUSE_AT_MIN = 1 * 60;            // [00:00, 01:00) inca pornit; 01:00 opreste

const WIDE_RANGES = [
  { y: 2026, m: 11, from: 2, to: 5 },
  { y: 2026, m: 11, from: 7, to: 15 },
];

const BF_START = stamp(2026, 11, 5, 18, 30);
const BF_END = stamp(2026, 11, 7, 1, 0);

// Pentru alta ora in weekend, decomenteaza:
// const WEEKEND_START_MIN = 17 * 60; // 17:00 sambata/duminica
const WEEKEND_START_MIN = null;

const MODES = ['AUTO', 'START', 'PAUSE', 'PAUSE_UNTIL_EVENING'];
// --- sfarsit configurare ---

function stamp(y, m, d, H, M) {
  return ((((y * 100 + m) * 100 + d) * 100 + H) * 100 + M);
}

function isoDate(p) {
  const pad = n => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

function minutesOf(p) {
  return p.hour * 60 + p.minute;
}

function isWideDay(y, m, d) {
  return WIDE_RANGES.some(r => r.y === y && r.m === m && d >= r.from && d <= r.to);
}

/** Programul continuu 08:00–01:00 incepe luni 16 nov 2026 si ramane. */
function isNewScheduleDay(y, m, d) {
  if (y > 2026) return true;
  if (y < 2026) return false;
  if (m > 11) return true;
  if (m < 11) return false;
  return d >= 16;
}

function isBlackFriday(p) {
  return stamp(p.year, p.month, p.day, p.hour, p.minute) >= BF_START
    && stamp(p.year, p.month, p.day, p.hour, p.minute) < BF_END;
}

/**
 * Actiunea din program, fara hold.
 * @returns {'START'|'PAUSE'}
 */
function scheduleAction(p) {
  const { year: y, month: m, day: d, weekday: D } = p;
  const NOW = minutesOf(p);

  if (isBlackFriday(p)) return 'START';

  const weekendOverride = WEEKEND_START_MIN != null && D >= 6;

  if (isWideDay(y, m, d) && !weekendOverride) {
    const inMorning = NOW >= WIDE_AM_START_MIN && NOW < WIDE_AM_END_MIN;
    const inEvening = NOW >= WIDE_PM_START_MIN || NOW < PAUSE_AT_MIN;
    if (inMorning || inEvening) return 'START';
    return 'PAUSE';
  }

  if (isNewScheduleDay(y, m, d) && !weekendOverride) {
    if (NOW >= CONTINUOUS_START_MIN || NOW < PAUSE_AT_MIN) return 'START';
    return 'PAUSE';
  }

  const startMin = weekendOverride ? WEEKEND_START_MIN : DEFAULT_START_MIN;
  if (NOW >= startMin || NOW < PAUSE_AT_MIN) return 'START';
  return 'PAUSE';
}

/**
 * Hold-ul de buget forteaza PAUSE inainte de 18:30 in ziua lui.
 * Dupa 18:30, sau in alta zi, nu schimba actiunea.
 */
function applyHold(action, p, holdDate) {
  if (!holdDate) return action;
  if (holdDate !== isoDate(p)) return action;
  if (minutesOf(p) < EVENING_RESUME_MIN) return 'PAUSE';
  return action;
}

/**
 * @param {{ year:number, month:number, day:number, hour:number, minute:number, weekday:number }} p
 * @param {string|null} [holdDate] YYYY-MM-DD, sau null
 * @returns {'START'|'PAUSE'}
 */
function decide(p, holdDate) {
  const action = scheduleAction(p);
  if (isBlackFriday(p)) return action;
  return applyHold(action, p, holdDate || null);
}

/**
 * Ce face o rulare (cron sau workflow_dispatch) cu hold-ul existent.
 *
 * persist=true inseamna ca trebuie scris un artifact nou:
 *   storedHoldDate = 'YYYY-MM-DD'  → hold pana la 18:30 in ziua aceea
 *   storedHoldDate = null           → hold sters
 * persistRequired=true: daca scrierea esueaza, NU se comuta anunturile
 *   (START trebuie sa stearga hold-ul, PAUSE_UNTIL_EVENING trebuie sa-l puna).
 * La 18:30 stergerea din AUTO e best-effort: anunturile pornesc oricum.
 *
 * @returns {{
 *   action: 'START'|'PAUSE',
 *   persist: boolean,
 *   persistRequired: boolean,
 *   storedHoldDate: string|null,
 *   note: string|null
 * }}
 */
function resolveDispatch(mode, parts, holdDate) {
  if (!MODES.includes(mode)) throw new Error('Mod invalid: ' + mode);

  const today = isoDate(parts);
  const beforeEvening = minutesOf(parts) < EVENING_RESUME_MIN;
  const current = holdDate || null;

  if (mode === 'START') {
    return {
      action: 'START',
      persist: current !== null,
      persistRequired: current !== null,
      storedHoldDate: null,
      note: current
        ? 'START manual: sterg hold-ul, ca cron-urile urmatoare sa nu opreasca din nou.'
        : null,
    };
  }

  if (mode === 'PAUSE') {
    return {
      action: 'PAUSE',
      persist: false,
      persistRequired: false,
      storedHoldDate: current,
      note: null,
    };
  }

  if (mode === 'PAUSE_UNTIL_EVENING') {
    if (!beforeEvening) {
      return {
        action: 'PAUSE',
        persist: false,
        persistRequired: false,
        storedHoldDate: current,
        note: 'Dupa 18:30, PAUSE_UNTIL_EVENING este o oprire punctuala: hold-ul de azi nu se seteaza, iar urmatorul AUTO poate reporni.',
      };
    }
    const already = current === today;
    return {
      action: 'PAUSE',
      persist: !already,
      persistRequired: !already,
      storedHoldDate: today,
      note: already
        ? 'Hold-ul pentru azi este deja setat. Opresc (idempotent).'
        : 'Hold pana la 18:30 Europe/Bucharest in ' + today + '. Cron-urile de dinainte de 18:30 nu repornesc.',
    };
  }

  const action = decide(parts, current);
  const stale = !!(current && (current < today || (current === today && !beforeEvening)));
  return {
    action,
    persist: stale,
    persistRequired: false,
    storedHoldDate: null,
    note: stale ? 'Hold-ul a expirat. Il sterg si aplic programul.' : null,
  };
}

/**
 * Citeste un document de hold. holdDate null inseamna "sters".
 * @param {string|object} value
 * @returns {string|null}
 */
function parseHoldDocument(value) {
  const obj = typeof value === 'string' ? JSON.parse(value) : value;
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('hold json invalid');
  }
  if (!Object.prototype.hasOwnProperty.call(obj, 'holdDate')) {
    throw new Error('hold json fara holdDate');
  }
  if (obj.holdDate == null || obj.holdDate === '') return null;
  if (typeof obj.holdDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(obj.holdDate)) {
    throw new Error('holdDate invalid: ' + obj.holdDate);
  }
  return obj.holdDate;
}

/** Parts for "now" in Europe/Bucharest, or for a wall-clock "YYYY-MM-DD HH:mm" as Bucuresti. */
function bucharestParts(when) {
  if (typeof when === 'string') {
    const m = when.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/);
    if (!m) throw new Error('Format asteptat: YYYY-MM-DD HH:mm, primit: ' + when);
    const year = +m[1], month = +m[2], day = +m[3], hour = +m[4], minute = +m[5];
    const wdSun0 = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const weekday = wdSun0 === 0 ? 7 : wdSun0;
    return { year, month, day, hour, minute, weekday };
  }

  const date = when instanceof Date ? when : new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Bucharest',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(date);

  const get = t => parts.find(p => p.type === t).value;
  const wdMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  let hour = parseInt(get('hour'), 10);
  if (hour === 24) hour = 0;

  return {
    year: parseInt(get('year'), 10),
    month: parseInt(get('month'), 10),
    day: parseInt(get('day'), 10),
    hour,
    minute: parseInt(get('minute'), 10),
    weekday: wdMap[get('weekday')],
  };
}

function decideFor(when, holdDate) {
  return decide(bucharestParts(when), holdDate || null);
}

module.exports = {
  decide,
  decideFor,
  bucharestParts,
  resolveDispatch,
  parseHoldDocument,
  scheduleAction,
  applyHold,
  isoDate,
  EVENING_RESUME_MIN,
  MODES,
};

if (require.main === module) {
  const arg = process.argv[2];
  const action = arg ? decideFor(arg) : decideFor(new Date());
  process.stdout.write(action + '\n');
}
