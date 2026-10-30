#!/usr/bin/env node
/**
 * Decide START sau PAUSE dupa data/ora Europe/Bucharest.
 *
 * === REGULI (editeaza aici) ===
 *
 * Implicit (din 2026-11-16 incolo, si in afara ferestrelor de mai jos):
 *   START de la 18:30, PAUSE dupa 01:00 (in fiecare zi).
 *
 * Fereastra larga — START de la 10:00 in loc de 18:30 (PAUSE tot dupa 01:00):
 *   2026-11-01 .. 2026-11-05  si  2026-11-07 .. 2026-11-15  (date Bucuresti)
 *
 * Exceptie Black Friday — mereu START:
 *   de la 2026-11-05 18:30 pana la 2026-11-07 01:00 (Europe/Bucharest)
 *   (toata ziua de 6 nov ramane pornita, inclusiv rulari diurne)
 *
 * Weekend: pentru alta ora de start, decomenteaza WEEKEND_START de mai jos
 *   (ex. 17:00 sambata/duminica).
 */

'use strict';

// --- configurare usoara ---
const DEFAULT_START_MIN = 18 * 60 + 30; // 18:30
const WIDE_START_MIN = 10 * 60;         // 10:00 in fereastra larga
const PAUSE_AFTER_HOUR = 1;             // PAUSE de la 01:00 incolo (H >= 1, in afara ferestrei de start)

// Fereastra larga (an, luna, zi) — date calendaristice Bucuresti
const WIDE_RANGES = [
  { y: 2026, m: 11, from: 1, to: 5 },
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
  const { year: y, month: m, day: d, hour: H, minute: M, weekday: D } = p;
  const NOW = H * 60 + M;
  const ts = stamp(y, m, d, H, M);

  // 1) Exceptie Black Friday — mereu START
  if (ts >= BF_START && ts < BF_END) return 'START';

  // 2) Ora de start: fereastra larga sau default
  let startMin = isWideDay(y, m, d) ? WIDE_START_MIN : DEFAULT_START_MIN;

  // Weekend (optional)
  if (WEEKEND_START_MIN != null && D >= 6) startMin = WEEKEND_START_MIN;

  // 3) Fereastra zilnica: [startMin, 24:00) U [00:00, PAUSE_AFTER_HOUR:00)
  if (NOW >= startMin || H < PAUSE_AFTER_HOUR) return 'START';
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
