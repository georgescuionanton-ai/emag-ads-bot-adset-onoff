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
 * Implicit (din 2026-11-16 incolo, si in afara ferestrelor de mai jos):
 *   START in [18:30, 24:00) si [00:00, 01:00); PAUSE in rest.
 *
 * Fereastra larga — pornit doar in doua intervale (date Bucuresti):
 *   2026-11-02 .. 2026-11-05  si  2026-11-07 .. 2026-11-15
 *   START in [11:00, 14:00) si in [19:00, 01:00)
 *     (seara trece de miezul noptii: [19:00, 24:00) U [00:00, 01:00));
 *   PAUSE in rest (inainte de 11:00, [14:00, 19:00), si de la 01:00).
 *
 * Exceptie Black Friday — mereu START (are prioritate fata de fereastra larga):
 *   [2026-11-05 18:30, 2026-11-07 01:00) Europe/Bucharest
 *   (toata ziua de 6 nov ramane pornita, inclusiv 01:00–18:30;
 *    pe 5 nov, de la 18:30, BF acopera pauza 14:00–19:00;
 *    pe 7 nov, 00:00–00:59 inca e BF, iar 01:00 opreste)
 *
 * Weekend: pentru alta ora de start, decomenteaza WEEKEND_START de mai jos
 *   (ex. 17:00 sambata/duminica).
 */

'use strict';

// --- configurare usoara ---
const DEFAULT_START_MIN = 18 * 60 + 30; // 18:30 inclusiv
// Fereastra larga: [11:00, 14:00) si [19:00, 01:00)
const WIDE_AM_START_MIN = 11 * 60;      // 11:00 inclusiv
const WIDE_AM_END_MIN = 14 * 60;        // 14:00 exclusiv
const WIDE_PM_START_MIN = 19 * 60;      // 19:00 inclusiv
const PAUSE_AT_MIN = 1 * 60;            // [00:00, 01:00) inca pornit; 01:00 opreste

// Fereastra larga (an, luna, zi) — date calendaristice Bucuresti
const WIDE_RANGES = [
  { y: 2026, m: 11, from: 2, to: 5 },
  { y: 2026, m: 11, from: 7, to: 15 },
];

// Black Friday: [start, end) in minute-stamp YYYYMMDDHHmm
const BF_START = stamp(2026, 11, 5, 18, 30);
const BF_END = stamp(2026, 11, 7, 1, 0);

// Pentru alta ora in weekend, decomenteaza:
// const WEEKEND_START_MIN = 17 * 60; // 17:00 sambata/duminica
const WEEKEND_START_MIN = null;
// --- sfarsit configurare ---

function stamp(y, m, d, H, M) {
  return ((((y * 100 + m) * 100 + d) * 100 + H) * 100 + M);
}

function isWideDay(y, m, d) {
  return WIDE_RANGES.some(r => r.y === y && r.m === m && d >= r.from && d <= r.to);
}

/**
 * @param {{ year:number, month:number, day:number, hour:number, minute:number, weekday:number }} p
 *   weekday: 1=luni ... 7=duminica
 * @returns {'START'|'PAUSE'}
 */
function decide(p) {
  const { year: y, month: m, day: d, minute: M, weekday: D } = p;
  const H = p.hour;
  const NOW = H * 60 + M;
  const ts = stamp(y, m, d, H, M);

  // 1) Exceptie Black Friday — mereu START
  if (ts >= BF_START && ts < BF_END) return 'START';

  // Weekend (optional): inlocuieste ora de start, inclusiv in fereastra larga
  const weekendOverride = WEEKEND_START_MIN != null && D >= 6;

  // 2) Fereastra larga: [11:00, 14:00) U [19:00, 24:00) U [00:00, 01:00)
  // Comparatia e pe minutul din zi, deci 13:59 != 14:00 si 00:59 != 01:00.
  if (isWideDay(y, m, d) && !weekendOverride) {
    const inMorning = NOW >= WIDE_AM_START_MIN && NOW < WIDE_AM_END_MIN;
    const inEvening = NOW >= WIDE_PM_START_MIN || NOW < PAUSE_AT_MIN;
    if (inMorning || inEvening) return 'START';
    return 'PAUSE';
  }

  // 3) Implicit (sau weekend, daca e setat): [startMin, 24:00) U [00:00, 01:00)
  const startMin = weekendOverride ? WEEKEND_START_MIN : DEFAULT_START_MIN;
  if (NOW >= startMin || NOW < PAUSE_AT_MIN) return 'START';
  return 'PAUSE';
}

/** Parts for "now" in Europe/Bucharest, or for a wall-clock "YYYY-MM-DD HH:mm" as Bucuresti. */
function bucharestParts(when) {
  if (typeof when === 'string') {
    const m = when.trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})$/);
    if (!m) throw new Error('Format asteptat: YYYY-MM-DD HH:mm, primit: ' + when);
    const year = +m[1], month = +m[2], day = +m[3], hour = +m[4], minute = +m[5];
    // Ziua saptamanii pentru data civila (independenta de TZ)
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
  // en-GB + hour12:false poate raporta 24:xx la miezul noptii in unele enginese
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

function decideFor(when) {
  return decide(bucharestParts(when));
}

module.exports = { decide, decideFor, bucharestParts };

if (require.main === module) {
  const arg = process.argv[2];
  const action = arg ? decideFor(arg) : decideFor(new Date());
  process.stdout.write(action + '\n');
}
