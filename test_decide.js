#!/usr/bin/env node
/**
 * Verifica decide() pentru orice minut, hold-ul pana la 18:30, si ca
 * cron-urile din schedule.yml (timezone Europe/Bucharest) acopera
 * 08:00 / 18:30 / 01:00 chiar daca GitHub intarzie ~55 min.
 * 08:00 Europe/Bucharest = 06:00 UTC iarna (EET, UTC+2).
 * Rulare: node test_decide.js
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  decide,
  bucharestParts,
  resolveDispatch,
  parseHoldDocument,
} = require('./decide_action');
const { isStartAllowed, isBlockedFromStart, START_ALLOWLIST } = require('./targets');

const SAMPLES = [
  // 3 nov — fereastra larga: doar 11:00–14:00 si 19:00–01:00
  '2026-11-03 10:30',
  '2026-11-03 11:10',
  '2026-11-03 13:59',
  '2026-11-03 14:05',
  '2026-11-03 18:45',
  '2026-11-03 19:05',
  '2026-11-03 00:30',
  '2026-11-03 01:10',

  // 6 nov — Black Friday, mereu START
  '2026-11-06 00:30',
  '2026-11-06 01:10',
  '2026-11-06 10:30',
  '2026-11-06 14:05',
  '2026-11-06 18:45',
  '2026-11-06 19:05',

  // 16 nov incolo — continuu 08:00–01:00, fara pauza la 14:00
  '2026-11-16 07:59',
  '2026-11-16 08:00',
  '2026-11-16 10:59',
  '2026-11-16 11:00',
  '2026-11-16 14:00',
  '2026-11-16 18:00',
  '2026-11-16 18:29',
  '2026-11-16 18:30',
  '2026-11-17 12:00',
  '2026-11-17 18:00',
  '2026-11-17 18:35',

  // Margini BF si trecerea la programul nou
  '2026-11-05 14:05',
  '2026-11-05 18:30',
  '2026-11-07 01:00',
  '2026-11-07 11:10',
  '2026-11-16 18:35',
  '2026-11-17 01:05',

  '2026-11-02 00:00',
  '2026-11-02 00:59',
  '2026-11-02 01:00',
  '2026-11-02 10:59',
  '2026-11-02 11:00',
  '2026-11-02 13:59',
  '2026-11-02 14:00',
  '2026-11-02 18:59',
  '2026-11-02 19:00',
  '2026-11-04 13:59',
  '2026-11-04 14:00',
  '2026-11-04 14:59',
  '2026-11-05 18:29',
  '2026-11-05 18:31',
  '2026-11-06 01:00',
  '2026-11-06 23:59',
  '2026-11-07 00:00',
  '2026-11-07 00:59',
  '2026-11-07 01:01',
  '2026-11-15 23:59',
  '2026-11-16 00:00',
  '2026-11-16 00:59',
  '2026-11-16 01:00',

  // Inainte de 16 nov programul vechi ramane 18:30; dupa, 08:00 inclusiv vara
  '2026-07-15 11:00',
  '2026-07-15 18:29',
  '2026-07-15 18:30',
  '2026-12-01 07:59',
  '2026-12-01 08:00',
  '2026-12-01 10:59',
  '2026-12-01 11:00',
  '2027-07-15 07:59',
  '2027-07-15 08:00',
  '2027-07-15 10:59',
  '2027-07-15 11:00',
  '2027-07-15 14:00',
];

const EXPECTED = {
  '2026-11-03 10:30': 'PAUSE',
  '2026-11-03 11:10': 'START',
  '2026-11-03 13:59': 'START',
  '2026-11-03 14:05': 'PAUSE',
  '2026-11-03 18:45': 'PAUSE',
  '2026-11-03 19:05': 'START',
  '2026-11-03 00:30': 'START',
  '2026-11-03 01:10': 'PAUSE',

  '2026-11-06 00:30': 'START',
  '2026-11-06 01:10': 'START',
  '2026-11-06 10:30': 'START',
  '2026-11-06 14:05': 'START',
  '2026-11-06 18:45': 'START',
  '2026-11-06 19:05': 'START',

  '2026-11-16 07:59': 'PAUSE',
  '2026-11-16 08:00': 'START',
  '2026-11-16 10:59': 'START',
  '2026-11-16 11:00': 'START',
  '2026-11-16 14:00': 'START',
  '2026-11-16 18:00': 'START',
  '2026-11-16 18:29': 'START',
  '2026-11-16 18:30': 'START',
  '2026-11-17 12:00': 'START',
  '2026-11-17 18:00': 'START',
  '2026-11-17 18:35': 'START',

  '2026-11-05 14:05': 'PAUSE',
  '2026-11-05 18:30': 'START',
  '2026-11-07 01:00': 'PAUSE',
  '2026-11-07 11:10': 'START',
  '2026-11-16 18:35': 'START',
  '2026-11-17 01:05': 'PAUSE',

  '2026-11-02 00:00': 'START',
  '2026-11-02 00:59': 'START',
  '2026-11-02 01:00': 'PAUSE',
  '2026-11-02 10:59': 'PAUSE',
  '2026-11-02 11:00': 'START',
  '2026-11-02 13:59': 'START',
  '2026-11-02 14:00': 'PAUSE',
  '2026-11-02 18:59': 'PAUSE',
  '2026-11-02 19:00': 'START',
  '2026-11-04 13:59': 'START',
  '2026-11-04 14:00': 'PAUSE',
  '2026-11-04 14:59': 'PAUSE',
  '2026-11-05 18:29': 'PAUSE',
  '2026-11-05 18:31': 'START',
  '2026-11-06 01:00': 'START',
  '2026-11-06 23:59': 'START',
  '2026-11-07 00:00': 'START',
  '2026-11-07 00:59': 'START',
  '2026-11-07 01:01': 'PAUSE',
  '2026-11-15 23:59': 'START',
  '2026-11-16 00:00': 'START',
  '2026-11-16 00:59': 'START',
  '2026-11-16 01:00': 'PAUSE',

  '2026-07-15 11:00': 'PAUSE',
  '2026-07-15 18:29': 'PAUSE',
  '2026-07-15 18:30': 'START',
  '2026-12-01 07:59': 'PAUSE',
  '2026-12-01 08:00': 'START',
  '2026-12-01 10:59': 'START',
  '2026-12-01 11:00': 'START',
  '2027-07-15 07:59': 'PAUSE',
  '2027-07-15 08:00': 'START',
  '2027-07-15 10:59': 'START',
  '2027-07-15 11:00': 'START',
  '2027-07-15 14:00': 'START',
};

function stamp(y, m, d, H, M) {
  return ((((y * 100 + m) * 100 + d) * 100 + H) * 100 + M);
}

const BF_START = stamp(2026, 11, 5, 18, 30);
const BF_END = stamp(2026, 11, 7, 1, 0);

function isNewScheduleDay(y, m, d) {
  if (y > 2026) return true;
  if (y < 2026) return false;
  if (m > 11) return true;
  if (m < 11) return false;
  return d >= 16;
}

/** Specificatie independenta: acelasi program, pe orice minut, fara hold. */
function spec(y, m, d, H, M) {
  const ts = stamp(y, m, d, H, M);
  if (ts >= BF_START && ts < BF_END) return 'START';
  const mins = H * 60 + M;
  const wide = y === 2026 && m === 11 && ((d >= 2 && d <= 5) || (d >= 7 && d <= 15));
  if (wide) {
    if ((mins >= 11 * 60 && mins < 14 * 60) || mins >= 19 * 60 || mins < 60) return 'START';
    return 'PAUSE';
  }
  if (isNewScheduleDay(y, m, d)) {
    if (mins >= 8 * 60 || mins < 60) return 'START';
    return 'PAUSE';
  }
  if (mins >= 18 * 60 + 30 || mins < 60) return 'START';
  return 'PAUSE';
}

function specWithHold(y, m, d, H, M, holdDate) {
  const base = spec(y, m, d, H, M);
  const ts = stamp(y, m, d, H, M);
  if (ts >= BF_START && ts < BF_END) return 'START';
  if (!holdDate) return base;
  const today = `${y}-${pad(m)}-${pad(d)}`;
  if (holdDate !== today) return base;
  if (H * 60 + M < 18 * 60 + 30) return 'PAUSE';
  return base;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function labelOf(y, m, d, H, M) {
  return `${y}-${pad(m)}-${pad(d)} ${pad(H)}:${pad(M)}`;
}

function loadSchedule() {
  const yml = fs.readFileSync(path.join(__dirname, '.github/workflows/schedule.yml'), 'utf8');
  const lines = yml.split(/\n/);
  const crons = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*- cron:\s*'([^']+)'\s*$/);
    if (!m) continue;
    const tzLine = lines[i + 1] || '';
    const tz = tzLine.match(/^\s*timezone:\s*'([^']+)'\s*$/);
    if (!tz) throw new Error('cron fara timezone pe linia urmatoare: ' + m[1]);
    if (tz[1] !== 'Europe/Bucharest') throw new Error('timezone gresit pentru ' + m[1] + ': ' + tz[1]);
    crons.push(m[1]);
  }
  if (crons.length < 8) throw new Error('Prea putine cron-uri in schedule.yml: ' + crons.length);
  return { yml, crons };
}

function expandField(field, lo, hi) {
  if (field === '*') {
    const all = [];
    for (let i = lo; i <= hi; i++) all.push(i);
    return all;
  }
  const out = [];
  for (const part of field.split(',')) {
    if (part.includes('/')) throw new Error('Stepping cron nesuportat in test: ' + part);
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number);
      for (let i = a; i <= b; i++) out.push(i);
    } else {
      out.push(Number(part));
    }
  }
  for (const n of out) {
    if (!Number.isInteger(n) || n < lo || n > hi) throw new Error('Camp cron invalid: ' + field);
  }
  return out;
}

function expandCron(expr) {
  const bits = expr.trim().split(/\s+/);
  if (bits.length !== 5) throw new Error('Cron trebuie sa aiba 5 campuri: ' + expr);
  const mins = expandField(bits[0], 0, 59);
  const hours = expandField(bits[1], 0, 23);
  const slots = [];
  for (const h of hours) for (const m of mins) slots.push({ h, m });
  return slots;
}

let failed = 0;
function fail(msg) {
  failed++;
  console.error('FAIL: ' + msg);
}

console.log('Decizie AUTO fara hold (Europe/Bucharest):\n');
for (const s of SAMPLES) {
  const got = decide(bucharestParts(s));
  const exp = EXPECTED[s];
  const ok = got === exp;
  if (!ok) fail(s + ' → ' + got + ' (asteptat ' + exp + ')');
  console.log(`${s.padEnd(16)} → ${got.padEnd(5)}  ${ok ? 'OK' : 'FAIL (asteptat ' + exp + ')'}`);
}

for (const s of SAMPLES) {
  const [date, hm] = s.split(' ');
  const [y, m, d] = date.split('-').map(Number);
  const [H, M] = hm.split(':').map(Number);
  if (spec(y, m, d, H, M) !== EXPECTED[s]) fail('spec != EXPECTED la ' + s);
}

const sweepDays = [];
for (let d = 1; d <= 30; d++) sweepDays.push([2026, 11, d]);
sweepDays.push(
  [2026, 1, 11],
  [2026, 3, 29],
  [2026, 7, 15],
  [2026, 10, 25],
  [2026, 12, 1],
  [2027, 1, 15],
  [2027, 3, 28],
  [2027, 7, 15]
);
let swept = 0;
for (const [y, m, d] of sweepDays) {
  for (let mins = 0; mins < 24 * 60; mins++) {
    const H = Math.floor(mins / 60);
    const M = mins % 60;
    const got = decide(bucharestParts(labelOf(y, m, d, H, M)));
    const exp = spec(y, m, d, H, M);
    swept++;
    if (got !== exp) fail(labelOf(y, m, d, H, M) + ' → ' + got + ' (spec ' + exp + ')');
  }
}
console.log(`\nSweep minute: ${swept} verificari.`);

// Hold: inainte de 18:30 in ziua hold-ului forteaza PAUSE, mai putin in BF.
const holdSweep = [
  [2026, 11, 16, '2026-11-16'],
  [2026, 11, 17, '2026-11-16'], // hold-ul de ieri nu tine
  [2026, 11, 6, '2026-11-06'],  // BF castiga
  [2027, 7, 15, '2027-07-15'],
];
for (const [y, m, d, holdDate] of holdSweep) {
  for (let mins = 0; mins < 24 * 60; mins++) {
    const H = Math.floor(mins / 60);
    const M = mins % 60;
    const label = labelOf(y, m, d, H, M);
    const got = decide(bucharestParts(label), holdDate);
    const exp = specWithHold(y, m, d, H, M, holdDate);
    swept++;
    if (got !== exp) fail('hold ' + holdDate + ' ' + label + ' → ' + got + ' (spec ' + exp + ')');
  }
}
console.log(`Sweep cu hold: total ${swept} verificari.`);

function assertParts(iso, expect) {
  const p = bucharestParts(new Date(iso));
  const keys = Object.keys(expect);
  const mismatches = keys.filter(k => p[k] !== expect[k]);
  if (mismatches.length) {
    fail(iso + ' → ' + JSON.stringify(p) + ' (asteptat ' + JSON.stringify(expect) + ')');
  }
  if (decide(p) !== spec(p.year, p.month, p.day, p.hour, p.minute)) {
    fail(iso + ' decide != spec');
  }
}

// Noiembrie 2026 este UTC+2. Vara este UTC+3. Schimbarea de ora e in martie/octombrie.
assertParts('2026-11-04T09:00:00Z', { year: 2026, month: 11, day: 4, hour: 11, minute: 0 });
assertParts('2026-11-04T12:00:00Z', { year: 2026, month: 11, day: 4, hour: 14, minute: 0 });
assertParts('2026-11-04T10:59:00Z', { year: 2026, month: 11, day: 4, hour: 12, minute: 59 });
assertParts('2026-11-04T22:00:00Z', { year: 2026, month: 11, day: 5, hour: 0, minute: 0 });
assertParts('2026-11-05T16:29:00Z', { year: 2026, month: 11, day: 5, hour: 18, minute: 29 });
assertParts('2026-11-05T16:30:00Z', { year: 2026, month: 11, day: 5, hour: 18, minute: 30 });
assertParts('2026-11-05T23:08:00Z', { year: 2026, month: 11, day: 6, hour: 1, minute: 8 });
assertParts('2026-11-06T22:52:00Z', { year: 2026, month: 11, day: 7, hour: 0, minute: 52 });
assertParts('2026-11-06T23:00:00Z', { year: 2026, month: 11, day: 7, hour: 1, minute: 0 });
assertParts('2026-11-06T23:08:00Z', { year: 2026, month: 11, day: 7, hour: 1, minute: 8 });
assertParts('2026-11-15T22:30:00Z', { year: 2026, month: 11, day: 16, hour: 0, minute: 30 });
assertParts('2026-11-15T23:00:00Z', { year: 2026, month: 11, day: 16, hour: 1, minute: 0 });
assertParts('2026-11-16T05:59:00Z', { year: 2026, month: 11, day: 16, hour: 7, minute: 59 });
assertParts('2026-11-16T06:00:00Z', { year: 2026, month: 11, day: 16, hour: 8, minute: 0 });
assertParts('2026-11-16T09:00:00Z', { year: 2026, month: 11, day: 16, hour: 11, minute: 0 });
assertParts('2027-07-15T04:59:00Z', { year: 2027, month: 7, day: 15, hour: 7, minute: 59 });
assertParts('2027-07-15T05:00:00Z', { year: 2027, month: 7, day: 15, hour: 8, minute: 0 });
assertParts('2026-11-16T16:30:00Z', { year: 2026, month: 11, day: 16, hour: 18, minute: 30 });
assertParts('2026-07-15T15:29:00Z', { year: 2026, month: 7, day: 15, hour: 18, minute: 29 });
assertParts('2026-07-15T15:30:00Z', { year: 2026, month: 7, day: 15, hour: 18, minute: 30 });
assertParts('2026-07-15T08:00:00Z', { year: 2026, month: 7, day: 15, hour: 11, minute: 0 });
assertParts('2026-07-15T21:59:00Z', { year: 2026, month: 7, day: 16, hour: 0, minute: 59 });
assertParts('2026-07-15T22:00:00Z', { year: 2026, month: 7, day: 16, hour: 1, minute: 0 });
assertParts('2027-07-15T08:00:00Z', { year: 2027, month: 7, day: 15, hour: 11, minute: 0 });
assertParts('2027-07-15T15:30:00Z', { year: 2027, month: 7, day: 15, hour: 18, minute: 30 });
assertParts('2027-07-15T22:00:00Z', { year: 2027, month: 7, day: 16, hour: 1, minute: 0 });
assertParts('2026-01-10T23:00:00Z', { year: 2026, month: 1, day: 11, hour: 1, minute: 0 });
assertParts('2026-03-29T00:30:00Z', { year: 2026, month: 3, day: 29, hour: 2, minute: 30 });
assertParts('2026-03-29T01:30:00Z', { year: 2026, month: 3, day: 29, hour: 4, minute: 30 });
assertParts('2026-10-25T00:30:00Z', { year: 2026, month: 10, day: 25, hour: 3, minute: 30 });
assertParts('2026-10-25T01:30:00Z', { year: 2026, month: 10, day: 25, hour: 3, minute: 30 });

const liveBf = bucharestParts(new Date('2026-11-05T16:30:00Z'));
const wallBf = bucharestParts('2026-11-05 18:30');
if (liveBf.hour !== wallBf.hour || liveBf.minute !== wallBf.minute || liveBf.day !== wallBf.day) {
  fail('Intl si peretele Bucuresti nu coincid la inceputul BF');
}

const { yml, crons } = loadSchedule();
const slots = crons.flatMap(expandCron);
const seen = new Set();
for (const s of slots) {
  const key = s.h + ':' + s.m;
  if (seen.has(key)) fail('Cron local duplicat: ' + key);
  seen.add(key);
}

const times = slots.map(s => s.h * 60 + s.m).sort((a, b) => a - b);
for (let i = 1; i < times.length; i++) {
  if (times[i] - times[i - 1] < 5) {
    fail('Cronuri la mai putin de 5 minute: ' + times[i - 1] + ' si ' + times[i]);
  }
}
const wrap = times[0] + 1440 - times[times.length - 1];
if (wrap < 5) fail('Cronurile de peste miezul noptii sunt la mai putin de 5 minute');

for (const s of slots) {
  if (s.h === 3) fail('Ora 03 e evitata (gaura de ora la trecerea la ora de vara): ' + s.h + ':' + s.m);
}

// Cronurile sunt in ora locala. Pe zilele critice, decide == spec.
const cronDates = [];
for (let d = 1; d <= 20; d++) cronDates.push([2026, 11, d]);
cronDates.push([2026, 1, 10], [2026, 3, 29], [2026, 7, 15], [2026, 10, 25], [2026, 12, 1], [2027, 7, 15]);
for (const [y, m, d] of cronDates) {
  for (const slot of slots) {
    const label = labelOf(y, m, d, slot.h, slot.m);
    const got = decide(bucharestParts(label));
    const exp = spec(y, m, d, slot.h, slot.m);
    if (got !== exp) fail(`cron local ${label} → ${got} (spec ${exp})`);
  }
}

for (const slot of slots) {
  const label = labelOf(2026, 11, 6, slot.h, slot.m);
  if (decide(bucharestParts(label)) !== 'START') {
    fail(`BF 6 nov ar fi oprit la ${pad(slot.h)}:${pad(slot.m)} RO`);
  }
}

if (decide(bucharestParts('2026-11-06 01:07')) !== 'START') fail('6 nov 01:07 trebuie START (BF)');
if (decide(bucharestParts('2026-11-07 01:07')) !== 'PAUSE') fail('7 nov 01:07 trebuie PAUSE');

/**
 * Pentru o intarziere D exista un cron a carui sosire (ora locala + D) cade
 * in [prag, prag+maxLate] si decide ca specificatia (cu sau fara hold).
 */
function assertLocalDelayCoverage(name, y, m, d, H, M, maxLateMin, holdDate) {
  const targetAbs = Date.UTC(y, m - 1, d, H, M);
  const delays = [0, 10, 20, 30, 40, 50, 55];
  for (const delay of delays) {
    let bestLate = null;
    for (const dayShift of [-1, 0, 1]) {
      for (const slot of slots) {
        const scheduled = Date.UTC(y, m - 1, d + dayShift, slot.h, slot.m);
        const effective = scheduled + delay * 60000;
        const late = (effective - targetAbs) / 60000;
        if (late < 0 || late > maxLateMin) continue;
        const eff = new Date(effective);
        const ey = eff.getUTCFullYear();
        const em = eff.getUTCMonth() + 1;
        const ed = eff.getUTCDate();
        const eH = eff.getUTCHours();
        const eM = eff.getUTCMinutes();
        const got = decide(bucharestParts(labelOf(ey, em, ed, eH, eM)), holdDate || null);
        const exp = specWithHold(ey, em, ed, eH, eM, holdDate || null);
        if (got !== exp) {
          fail(`${name} delay ${delay}: ${labelOf(ey, em, ed, eH, eM)} ${got} != ${exp}`);
        }
        if (bestLate === null || late < bestLate) bestLate = late;
      }
    }
    if (bestLate === null) {
      fail(`${name}: nicio rulare in +${maxLateMin} min pentru intarziere de ${delay} min`);
    }
  }
}

const MAX_LATE = 20;
assertLocalDelayCoverage('08:00 START 16 nov', 2026, 11, 16, 8, 0, MAX_LATE, null);
assertLocalDelayCoverage('08:00 cu hold 16 nov', 2026, 11, 16, 8, 0, MAX_LATE, '2026-11-16');
assertLocalDelayCoverage('18:30 reluare 16 nov', 2026, 11, 16, 18, 30, MAX_LATE, null);
assertLocalDelayCoverage('18:30 cu hold 16 nov', 2026, 11, 16, 18, 30, MAX_LATE, '2026-11-16');
assertLocalDelayCoverage('01:00 PAUSE 17 nov', 2026, 11, 17, 1, 0, MAX_LATE, null);
assertLocalDelayCoverage('01:00 PAUSE 7 nov (dupa BF)', 2026, 11, 7, 1, 0, MAX_LATE, null);
assertLocalDelayCoverage('18:30 START BF 5 nov', 2026, 11, 5, 18, 30, MAX_LATE, null);
assertLocalDelayCoverage('08:00 START vara 2027', 2027, 7, 15, 8, 0, MAX_LATE, null);
assertLocalDelayCoverage('18:30 vara 2027', 2027, 7, 15, 18, 30, MAX_LATE, '2027-07-15');
assertLocalDelayCoverage('01:00 PAUSE vara 2027', 2027, 7, 16, 1, 0, MAX_LATE, null);

// Daca GitHub sarea tot ce e inainte de 17:00 RO (cum s-a intamplat in 10–15 nov),
// rularea de la 17:xx inca prinde fereastra, iar hold-ul tine pauza pana la 18:30.
const afternoon = slots.filter(s => s.h * 60 + s.m >= 17 * 60);
if (!afternoon.some(s => s.h * 60 + s.m < 18 * 60 + 30)) {
  fail('nu exista rezerva intre 17:00 si 18:30');
}
if (!afternoon.some(s => s.h * 60 + s.m >= 18 * 60 + 30 && s.h * 60 + s.m <= 19 * 60 + 30)) {
  fail('nu exista rezerva intre 18:30 si 19:30');
}
for (const s of afternoon) {
  const label = labelOf(2026, 11, 16, s.h, s.m);
  const mins = s.h * 60 + s.m;
  const plain = decide(bucharestParts(label));
  const held = decide(bucharestParts(label), '2026-11-16');
  if (plain !== 'START') fail(label + ' fara hold ar trebui START, este ' + plain);
  if (mins < 18 * 60 + 30) {
    if (held !== 'PAUSE') fail(label + ' cu hold ar trebui PAUSE, este ' + held);
  } else if (held !== 'START') {
    fail(label + ' cu hold, dupa 18:30, ar trebui START, este ' + held);
  }
}

function matchesOffset(y, m, d, H, M, off) {
  const when = new Date(Date.UTC(y, m - 1, d, H - off, M, 0, 0));
  const p = bucharestParts(when);
  return p.year === y && p.month === m && p.day === d && p.hour === H && p.minute === M;
}

function lastSunday(y, month1) {
  const last = new Date(Date.UTC(y, month1, 0));
  return last.getUTCDate() - last.getUTCDay();
}

const spring2027 = lastSunday(2027, 3);
const autumn2027 = lastSunday(2027, 10);
if (spring2027 !== 28) fail('ultima duminica din martie 2027 ar trebui 28, este ' + spring2027);
if (autumn2027 !== 31) fail('ultima duminica din octombrie 2027 ar trebui 31, este ' + autumn2027);
if (matchesOffset(2027, 3, spring2027, 3, 30, 2) || matchesOffset(2027, 3, spring2027, 3, 30, 3)) {
  fail('ora 03:30 de primavara nu ar trebui sa existe');
}
if (!matchesOffset(2027, 10, autumn2027, 3, 30, 3) || !matchesOffset(2027, 10, autumn2027, 3, 30, 2)) {
  fail('ora 03:30 de toamna ar trebui sa fie ambigua (UTC+3 si UTC+2)');
}
// Pragurile noastre exista si iarna, si vara, si in ziua schimbarii.
for (const [y, m, d, off] of [
  [2026, 11, 16, 2],
  [2027, 7, 15, 3],
  [2027, 3, spring2027, 3],
]) {
  for (const [H, M] of [[8, 0], [18, 30]]) {
    if (!matchesOffset(y, m, d, H, M, off)) {
      fail(`${labelOf(y, m, d, H, M)} nu cade pe UTC+${off}`);
    }
  }
}
if (!matchesOffset(2026, 11, 17, 1, 0, 2)) fail('01:00 RO 17 nov 2026 nu e UTC+2');
if (!matchesOffset(2027, 7, 16, 1, 0, 3)) fail('01:00 RO 16 iul 2027 nu e UTC+3');
// In dimineata schimbarii la ora de vara, 01:00 inca e UTC+2, 08:00 e deja UTC+3.
if (!matchesOffset(2027, 3, spring2027, 1, 0, 2)) fail('01:00 in dimineata de primavara ar trebui UTC+2');
if (!matchesOffset(2027, 3, spring2027, 8, 0, 3)) fail('08:00 in dimineata de primavara ar trebui UTC+3');
if (!matchesOffset(2026, 11, 18, 8, 0, 2)) fail('08:00 RO 18 nov 2026 nu e 06:00 UTC');

function utcForLocal(y, m, d, H, M) {
  for (const off of [2, 3]) {
    if (matchesOffset(y, m, d, H, M, off)) return off;
  }
  return null;
}

// resolveDispatch: UI-ul manual si cron-ul AUTO.
function at(label) {
  return bucharestParts(label);
}

function expectDispatch(name, mode, label, hold, fields) {
  let result;
  try {
    result = resolveDispatch(mode, at(label), hold);
  } catch (e) {
    fail(name + ' a aruncat: ' + e.message);
    return;
  }
  if (result.action !== 'START' && result.action !== 'PAUSE') {
    fail(name + ' actiune invalida pentru toggle: ' + result.action);
  }
  for (const key of Object.keys(fields)) {
    if (result[key] !== fields[key]) {
      fail(name + ' ' + key + '=' + result[key] + ' (asteptat ' + fields[key] + ')');
    }
  }
}

expectDispatch('AUTO 14:00 fara hold', 'AUTO', '2026-11-16 14:00', null, {
  action: 'START', persist: false, persistRequired: false,
});
expectDispatch('AUTO 07:59', 'AUTO', '2026-11-16 07:59', null, { action: 'PAUSE', persist: false });
expectDispatch('AUTO 08:00', 'AUTO', '2026-11-16 08:00', null, { action: 'START', persist: false });
expectDispatch('AUTO 11:00 inca in fereastra', 'AUTO', '2026-11-16 11:00', null, { action: 'START', persist: false });
expectDispatch('AUTO 01:00', 'AUTO', '2026-11-17 01:00', null, { action: 'PAUSE', persist: false });
expectDispatch('AUTO 00:59', 'AUTO', '2026-11-17 00:59', null, { action: 'START', persist: false });
expectDispatch('hold tine 14:00', 'AUTO', '2026-11-16 14:00', '2026-11-16', {
  action: 'PAUSE', persist: false, persistRequired: false,
});
expectDispatch('hold tine 08:00', 'AUTO', '2026-11-16 08:00', '2026-11-16', { action: 'PAUSE', persist: false });
expectDispatch('hold tine 11:00', 'AUTO', '2026-11-16 11:00', '2026-11-16', { action: 'PAUSE', persist: false });
expectDispatch('hold tine 18:29', 'AUTO', '2026-11-16 18:29', '2026-11-16', { action: 'PAUSE', persist: false });
expectDispatch('hold expira 18:30', 'AUTO', '2026-11-16 18:30', '2026-11-16', {
  action: 'START', persist: true, persistRequired: false, storedHoldDate: null,
});
expectDispatch('hold de ieri la 14:00', 'AUTO', '2026-11-17 14:00', '2026-11-16', {
  action: 'START', persist: true, persistRequired: false, storedHoldDate: null,
});
expectDispatch('hold de ieri la 00:30', 'AUTO', '2026-11-17 00:30', '2026-11-16', {
  action: 'START', persist: true, persistRequired: false,
});
expectDispatch('BF ignora hold', 'AUTO', '2026-11-06 12:00', '2026-11-06', { action: 'START', persist: false });
expectDispatch('PAUSE nu pune hold', 'PAUSE', '2026-11-16 14:00', null, {
  action: 'PAUSE', persist: false, persistRequired: false,
});
expectDispatch('PAUSE pastreaza hold-ul existent', 'PAUSE', '2026-11-16 14:00', '2026-11-16', {
  action: 'PAUSE', persist: false, storedHoldDate: '2026-11-16',
});
expectDispatch('START sterge hold', 'START', '2026-11-16 14:00', '2026-11-16', {
  action: 'START', persist: true, persistRequired: true, storedHoldDate: null,
});
expectDispatch('START fara hold', 'START', '2026-11-16 14:00', null, {
  action: 'START', persist: false, persistRequired: false,
});
expectDispatch('PAUSE_UNTIL_EVENING 14:05', 'PAUSE_UNTIL_EVENING', '2026-11-16 14:05', null, {
  action: 'PAUSE', persist: true, persistRequired: true, storedHoldDate: '2026-11-16',
});
expectDispatch('PAUSE_UNTIL_EVENING 10:30', 'PAUSE_UNTIL_EVENING', '2026-11-16 10:30', null, {
  action: 'PAUSE', persist: true, persistRequired: true, storedHoldDate: '2026-11-16',
});
expectDispatch('PAUSE_UNTIL_EVENING deja setat', 'PAUSE_UNTIL_EVENING', '2026-11-16 15:00', '2026-11-16', {
  action: 'PAUSE', persist: false, persistRequired: false,
});
expectDispatch('PAUSE_UNTIL_EVENING dupa 18:30', 'PAUSE_UNTIL_EVENING', '2026-11-16 19:10', null, {
  action: 'PAUSE', persist: false, persistRequired: false,
});
expectDispatch('fereastra larga + hold', 'AUTO', '2026-11-04 11:30', '2026-11-04', { action: 'PAUSE' });

let threw = false;
try { resolveDispatch('NOPE', at('2026-11-16 12:00'), null); } catch (e) { threw = true; }
if (!threw) fail('modul invalid trebuie sa arunce');

if (parseHoldDocument({ holdDate: '2026-11-16' }) !== '2026-11-16') fail('parse hold');
if (parseHoldDocument('{"holdDate":null}') !== null) fail('parse hold null');
let bad = false;
try { parseHoldDocument('{"nope":1}'); } catch (e) { bad = true; }
if (!bad) fail('hold fara holdDate trebuie respins');

// persist_hold.js: fara retea, prin HOLD_JSON.
function runPersist(env) {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ghout-'));
  const outFile = path.join(outDir, 'output');
  const holdDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holdout-'));
  fs.writeFileSync(outFile, '');
  const r = spawnSync(process.execPath, [path.join(__dirname, 'persist_hold.js')], {
    cwd: __dirname,
    env: Object.assign({}, process.env, {
      GITHUB_OUTPUT: outFile,
      HOLD_OUT_DIR: holdDir,
      GITHUB_REPOSITORY: '',
      GH_TOKEN: '',
    }, env),
    encoding: 'utf8',
  });
  const output = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
  const holdPath = path.join(holdDir, 'hold.json');
  const doc = fs.existsSync(holdPath) ? JSON.parse(fs.readFileSync(holdPath, 'utf8')) : null;
  return { status: r.status, output, stderr: r.stderr || '', doc };
}

function outputsOf(text) {
  const o = {};
  for (const line of text.split('\n')) {
    const i = line.indexOf('=');
    if (i > 0) o[line.slice(0, i)] = line.slice(i + 1);
  }
  return o;
}

function expectRun(name, env, fields, docHold) {
  const r = runPersist(env);
  if (r.status !== 0) {
    fail(name + ' exit ' + r.status + ' ' + r.stderr);
    return;
  }
  const o = outputsOf(r.output);
  for (const key of Object.keys(fields)) {
    if (o[key] !== fields[key]) fail(name + ' output ' + key + '=' + o[key] + ' (asteptat ' + fields[key] + ')');
  }
  if (docHold === undefined) {
    if (r.doc) fail(name + ' nu trebuia sa scrie hold.json');
  } else if (!r.doc) {
    fail(name + ' nu a scris hold.json');
  } else if (r.doc.holdDate !== docHold) {
    fail(name + ' holdDate=' + r.doc.holdDate + ' (asteptat ' + docHold + ')');
  } else if (r.doc.until !== '18:30' || r.doc.timezone !== 'Europe/Bucharest') {
    fail(name + ' document hold incomplet: ' + JSON.stringify(r.doc));
  }
}

const holdToday = JSON.stringify({ holdDate: '2026-11-16', until: '18:30', timezone: 'Europe/Bucharest' });
expectRun('script AUTO pornit', {
  MODE: 'AUTO', WHEN: '2026-11-16 14:00', HOLD_JSON: 'none',
}, { action: 'START', persist: 'false', persist_required: 'false' }, undefined);
expectRun('script AUTO sub hold', {
  MODE: 'AUTO', WHEN: '2026-11-16 14:00', HOLD_JSON: holdToday,
}, { action: 'PAUSE', persist: 'false', persist_required: 'false' }, undefined);
expectRun('script 18:30 sterge hold', {
  MODE: 'AUTO', WHEN: '2026-11-16 18:30', HOLD_JSON: holdToday,
}, { action: 'START', persist: 'true', persist_required: 'false' }, null);
expectRun('script PAUSE_UNTIL_EVENING', {
  MODE: 'PAUSE_UNTIL_EVENING', WHEN: '2026-11-16 14:05', HOLD_JSON: 'none',
}, { action: 'PAUSE', persist: 'true', persist_required: 'true' }, '2026-11-16');
expectRun('script START sterge', {
  MODE: 'START', WHEN: '2026-11-16 14:00', HOLD_JSON: holdToday,
}, { action: 'START', persist: 'true', persist_required: 'true' }, null);
expectRun('script PAUSE nu scrie', {
  MODE: 'PAUSE', WHEN: '2026-11-16 14:00', HOLD_JSON: 'none',
}, { action: 'PAUSE', persist: 'false', persist_required: 'false' }, undefined);
expectRun('script dupa 18:30 nu tine', {
  MODE: 'PAUSE_UNTIL_EVENING', WHEN: '2026-11-16 19:00', HOLD_JSON: 'none',
}, { action: 'PAUSE', persist: 'false' }, undefined);

const badMode = runPersist({ MODE: 'NOPE', WHEN: '2026-11-16 12:00', HOLD_JSON: 'none' });
if (badMode.status === 0) fail('modul invalid trebuie sa iasa cu eroare');
const badJson = runPersist({ MODE: 'AUTO', WHEN: '2026-11-16 12:00', HOLD_JSON: '{nu' });
if (badJson.status === 0) fail('hold json stricat trebuie sa opreasca rularea');

// Workflow-ul manual ramane un singur input, iar toggle-ul primeste doar START/PAUSE.
if (!yml.includes('PAUSE_UNTIL_EVENING')) fail('schedule.yml nu ofera PAUSE_UNTIL_EVENING');
for (const opt of ['AUTO', 'START', 'PAUSE', 'PAUSE_UNTIL_EVENING']) {
  if (!yml.includes('- ' + opt) && !yml.includes(opt)) fail('optiunea lipseste: ' + opt);
}
if (!yml.includes('node emag_toggle.js ${{ steps.act.outputs.action }}')) {
  fail('emag_toggle.js nu primeste actiunea decisa');
}
if (!yml.includes('name: emag-hold')) fail('artifactul de hold lipseste');
if (!yml.includes('actions: write')) fail('workflow-ul nu cere actions: write');
if (!yml.includes('node persist_hold.js')) fail('workflow-ul nu ruleaza persist_hold.js');
if (yml.includes('emag_toggle.js ${{ inputs.action }}')) fail('inputs.action nu trebuie sa ajunga direct la toggle');

console.log('\nCron Europe/Bucharest → UTC (zi de referinta):');
const winter = [2026, 11, 16];
const summer = [2027, 7, 15];
const uniqueSlots = slots.slice().sort((a, b) => a.h - b.h || a.m - b.m);
for (const s of uniqueSlots) {
  const w = utcForLocal(winter[0], winter[1], winter[2], s.h, s.m);
  const u = utcForLocal(summer[0], summer[1], summer[2], s.h, s.m);
  if (w == null || u == null) fail(`ora locala ${pad(s.h)}:${pad(s.m)} nu exista iarna sau vara`);
  const wH = (s.h - w + 24) % 24;
  const uH = (s.h - u + 24) % 24;
  console.log(`  ${pad(s.h)}:${pad(s.m)} RO   iarna ${pad(wH)}:${pad(s.m)}Z (UTC+${w})   vara ${pad(uH)}:${pad(s.m)}Z (UTC+${u})`);
}
console.log(`\n${uniqueSlots.length} declansari locale / zi, ${crons.length} expresii cron.`);

const targets = require('./targets');
const allow = new Set(START_ALLOWLIST);
for (const name of [
  'Imprimante_oct26-ian27',
  'Imprimante_exact_nov26-ian27',
  'Cartuse_Canon_auto_nov26-ian27',
  'Canon printere vs competitori',
]) {
  if (!isStartAllowed(name)) fail('allowlist nu porneste ' + name);
}
if (isStartAllowed('Imprimante others')) fail('Imprimante others nu trebuie pornit');
if (isStartAllowed('first')) fail('START nu porneste first');
if (isStartAllowed('Cartus PG-585 / CL-586_Printers TS6550i')) fail('Cartus * nu trebuie pornit');
if (isStartAllowed('Cartus_vechi')) fail('Cartus_ nu trebuie pornit');
if (!isBlockedFromStart('Imprimante others')) fail('Imprimante others trebuie blocat');
if (!isBlockedFromStart('Cartus GI-45_Printer GX1040')) fail('Cartus cu spatiu trebuie blocat');
if (!isBlockedFromStart('Cartus_PG')) fail('Cartus_ trebuie blocat');
if (isBlockedFromStart('Cartuse_Canon_auto_nov26-ian27')) fail('Cartuse_Canon nu e Cartus_*');
if (allow.size !== 4) fail('allowlist trebuie sa aiba 4 nume');
for (const t of targets) {
  if (!isStartAllowed(t.adSet)) fail('tinta configurata nu e in allowlist: ' + t.adSet);
  if (!/campaign-manager\/(632815|648722|652949|634320)/.test(t.url)) {
    fail('campanie schimbata: ' + t.url);
  }
}
if (targets.some(t => String(t.adSet).toLowerCase() === 'first')) {
  fail('o tinta inca foloseste first');
}

console.log('');
if (failed) {
  console.error('TEST ESUAT: ' + failed + ' cazuri gresite');
  process.exit(1);
}
console.log('TEST OK: toate cazurile trec.');
