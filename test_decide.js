#!/usr/bin/env node
/**
 * Verifica decide() pentru orice minut (nu doar pragurile) si ca cron-urile
 * din schedule.yml acopera fiecare tranzitie chiar daca GitHub intarzie.
 * Rulare: node test_decide.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { decide, bucharestParts } = require('./decide_action');

const SAMPLES = [
  // 3 nov — fereastra larga: doar 11:00–14:00 si 19:00–01:00
  '2026-11-03 10:30', // inainte de 11:00 → PAUSE
  '2026-11-03 11:10', // 11:00–14:00 → START
  '2026-11-03 13:59', // inca in 11:00–14:00 → START
  '2026-11-03 14:05', // 14:00–19:00 → PAUSE
  '2026-11-03 18:45', // inca in pauza de dupa-amiaza → PAUSE
  '2026-11-03 19:05', // de la 19:00 → START
  '2026-11-03 00:30', // inainte de 01:00 → START
  '2026-11-03 01:10', // dupa 01:00 → PAUSE

  // 6 nov — Black Friday, mereu START (toata ziua)
  '2026-11-06 00:30',
  '2026-11-06 01:10',
  '2026-11-06 10:30',
  '2026-11-06 14:05',
  '2026-11-06 18:45',
  '2026-11-06 19:05',

  // 17 nov — program normal 18:30–01:00
  '2026-11-17 18:00', // inainte de 18:30 → PAUSE
  '2026-11-17 18:35', // de la 18:30 → START

  // Neschimbat: margini BF si programul normal
  '2026-11-05 14:05', // fereastra larga, BF nu a inceput → PAUSE
  '2026-11-05 18:30', // BF incepe, prioritar fata de pauza 14–19 → START
  '2026-11-07 01:00', // BF se termina la 01:00 (exclusiv) → PAUSE
  '2026-11-07 11:10', // fereastra larga reluata → START
  '2026-11-16 18:00', // prima zi program normal, inainte de 18:30 → PAUSE
  '2026-11-16 18:35', // program normal → START
  '2026-11-17 01:05', // dupa 01:00 → PAUSE

  // Margini pe minut, inclusiv incidentul 14:59 si miezul noptii
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
  '2026-11-16 18:29',
  '2026-11-16 18:30',
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

  '2026-11-17 18:00': 'PAUSE',
  '2026-11-17 18:35': 'START',

  '2026-11-05 14:05': 'PAUSE',
  '2026-11-05 18:30': 'START',
  '2026-11-07 01:00': 'PAUSE',
  '2026-11-07 11:10': 'START',
  '2026-11-16 18:00': 'PAUSE',
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
  '2026-11-16 18:29': 'PAUSE',
  '2026-11-16 18:30': 'START',
};

function stamp(y, m, d, H, M) {
  return ((((y * 100 + m) * 100 + d) * 100 + H) * 100 + M);
}

const BF_START = stamp(2026, 11, 5, 18, 30);
const BF_END = stamp(2026, 11, 7, 1, 0);

/** Specificatie independenta: acelasi program, pe orice minut. */
function spec(y, m, d, H, M) {
  const ts = stamp(y, m, d, H, M);
  if (ts >= BF_START && ts < BF_END) return 'START';
  const mins = H * 60 + M;
  const wide = y === 2026 && m === 11 && ((d >= 2 && d <= 5) || (d >= 7 && d <= 15));
  if (wide) {
    if ((mins >= 11 * 60 && mins < 14 * 60) || mins >= 19 * 60 || mins < 60) return 'START';
    return 'PAUSE';
  }
  if (mins >= 18 * 60 + 30 || mins < 60) return 'START';
  return 'PAUSE';
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function labelOf(y, m, d, H, M) {
  return `${y}-${pad(m)}-${pad(d)} ${pad(H)}:${pad(M)}`;
}

function loadCrons() {
  const yml = fs.readFileSync(path.join(__dirname, '.github/workflows/schedule.yml'), 'utf8');
  const crons = [...yml.matchAll(/^\s*- cron:\s*'([^']+)'/gm)].map(m => m[1]);
  if (crons.length < 8) throw new Error('Prea putine cron-uri in schedule.yml: ' + crons.length);
  return crons;
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

/** Instantaneu UTC care cade pe data/ora civila Bucuresti, la offsetul dat. */
function roInstant(y, m, d, H, M, offsetHours) {
  return new Date(Date.UTC(y, m - 1, d, H - offsetHours, M, 0, 0));
}

let failed = 0;
function fail(msg) {
  failed++;
  console.error('FAIL: ' + msg);
}

console.log('Decizie AUTO (Europe/Bucharest):\n');
for (const s of SAMPLES) {
  const got = decide(bucharestParts(s));
  const exp = EXPECTED[s];
  const ok = got === exp;
  if (!ok) fail(s + ' → ' + got + ' (asteptat ' + exp + ')');
  console.log(`${s.padEnd(16)} → ${got.padEnd(5)}  ${ok ? 'OK' : 'FAIL (asteptat ' + exp + ')'}`);
}

// Specificatia scrisa de mana trebuie sa fie de acord cu EXPECTED.
for (const s of SAMPLES) {
  const [date, hm] = s.split(' ');
  const [y, m, d] = date.split('-').map(Number);
  const [H, M] = hm.split(':').map(Number);
  if (spec(y, m, d, H, M) !== EXPECTED[s]) {
    fail('spec != EXPECTED la ' + s);
  }
}

// Fiecare minut din zilele relevante.
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

// Intl Europe/Bucharest: iarna +2, vara +3, inclusiv schimbarea de ora.
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
assertParts('2026-07-15T15:29:00Z', { year: 2026, month: 7, day: 15, hour: 18, minute: 29 });
assertParts('2026-07-15T15:30:00Z', { year: 2026, month: 7, day: 15, hour: 18, minute: 30 });
assertParts('2026-07-15T21:59:00Z', { year: 2026, month: 7, day: 16, hour: 0, minute: 59 });
assertParts('2026-07-15T22:00:00Z', { year: 2026, month: 7, day: 16, hour: 1, minute: 0 });
assertParts('2026-01-10T23:00:00Z', { year: 2026, month: 1, day: 11, hour: 1, minute: 0 });
assertParts('2026-03-29T00:30:00Z', { year: 2026, month: 3, day: 29, hour: 2, minute: 30 });
assertParts('2026-03-29T01:30:00Z', { year: 2026, month: 3, day: 29, hour: 4, minute: 30 });
assertParts('2026-10-25T00:30:00Z', { year: 2026, month: 10, day: 25, hour: 3, minute: 30 });
assertParts('2026-10-25T01:30:00Z', { year: 2026, month: 10, day: 25, hour: 3, minute: 30 });

// String wall-clock si Intl trebuie sa cada pe aceeasi ora civila.
const liveBf = bucharestParts(new Date('2026-11-05T16:30:00Z'));
const wallBf = bucharestParts('2026-11-05 18:30');
if (liveBf.hour !== wallBf.hour || liveBf.minute !== wallBf.minute || liveBf.day !== wallBf.day) {
  fail('Intl si peretele Bucuresti nu coincid la inceputul BF');
}

// Cron: fiecare declansare, pe zilele critice, decide ca specificatia.
const crons = loadCrons();
const slots = crons.flatMap(expandCron);
const seen = new Set();
for (const s of slots) {
  const key = s.h + ':' + s.m;
  if (seen.has(key)) fail('Cron UTC duplicat: ' + key);
  seen.add(key);
}

const cronDates = [];
for (let d = 1; d <= 17; d++) cronDates.push([2026, 11, d]);
cronDates.push([2026, 1, 10], [2026, 3, 29], [2026, 7, 15], [2026, 10, 25], [2026, 12, 1]);

for (const [y, m, d] of cronDates) {
  for (const slot of slots) {
    const when = new Date(Date.UTC(y, m - 1, d, slot.h, slot.m, 0, 0));
    const p = bucharestParts(when);
    const got = decide(p);
    const exp = spec(p.year, p.month, p.day, p.hour, p.minute);
    if (got !== exp) {
      fail(
        `cron ${pad(slot.h)}:${pad(slot.m)}Z pe ${y}-${pad(m)}-${pad(d)} → ` +
        `${labelOf(p.year, p.month, p.day, p.hour, p.minute)} ${got} (spec ${exp})`
      );
    }
  }
}

// Nicio rulare programata in ziua civila 6 nov nu are voie sa opreasca.
for (const utcDay of [5, 6, 7]) {
  for (const slot of slots) {
    const when = new Date(Date.UTC(2026, 10, utcDay, slot.h, slot.m, 0, 0));
    const p = bucharestParts(when);
    if (p.year === 2026 && p.month === 11 && p.day === 6 && decide(p) !== 'START') {
      fail(`BF 6 nov ar fi oprit de ${pad(slot.h)}:${pad(slot.m)}Z (${p.hour}:${pad(p.minute)} RO)`);
    }
  }
}

// 7 nov 01:07 RO (23:07Z pe 6 nov) opreste; 6 nov 01:07 RO (23:07Z pe 5 nov) ramane pornit.
function actionAtUtc(iso) {
  const p = bucharestParts(new Date(iso));
  return { p, action: decide(p) };
}
const nov6pauseCandidate = actionAtUtc('2026-11-05T23:07:00Z');
if (nov6pauseCandidate.action !== 'START' || nov6pauseCandidate.p.day !== 6) {
  fail('23:07Z pe 5 nov trebuie sa fie 6 nov START, este ' + JSON.stringify(nov6pauseCandidate));
}
const nov7pause = actionAtUtc('2026-11-06T23:07:00Z');
if (nov7pause.action !== 'PAUSE' || nov7pause.p.day !== 7 || nov7pause.p.hour !== 1) {
  fail('23:07Z pe 6 nov trebuie sa fie 7 nov 01:07 PAUSE, este ' + JSON.stringify(nov7pause));
}

/**
 * Pentru o intarziere D, exista un cron a carui sosire (programat+D) cade in
 * [prag, prag+maxLate] si aplica actiunea noua.
 */
function assertDelayCoverage(name, y, m, d, H, M, offsetHours, maxLateMin) {
  const target = roInstant(y, m, d, H, M, offsetHours);
  const targetParts = bucharestParts(target);
  if (targetParts.hour !== H || targetParts.minute !== M || targetParts.day !== d) {
    fail(
      `${name}: offsetul UTC+${offsetHours} nu cade pe ${labelOf(y, m, d, H, M)} ` +
      `(Intl ${labelOf(targetParts.year, targetParts.month, targetParts.day, targetParts.hour, targetParts.minute)})`
    );
    return;
  }
  const delays = [0, 10, 20, 30, 40, 50, 55];
  for (const delay of delays) {
    let bestMin = null;
    const utcDays = [d - 1, d, d + 1];
    for (const ud of utcDays) {
      for (const slot of slots) {
        const scheduled = new Date(Date.UTC(y, m - 1, ud, slot.h, slot.m, 0, 0));
        const effective = new Date(scheduled.getTime() + delay * 60 * 1000);
        const late = (effective.getTime() - target.getTime()) / 60000;
        if (late < 0 || late > maxLateMin) continue;
        const p = bucharestParts(effective);
        const got = decide(p);
        const exp = spec(p.year, p.month, p.day, p.hour, p.minute);
        if (got !== exp) {
          fail(`${name} delay ${delay}: decide != spec la +${late} min`);
        }
        if (bestMin === null || late < bestMin) bestMin = late;
      }
    }
    if (bestMin === null) {
      fail(`${name}: nicio rulare in +${maxLateMin} min pentru intarziere GitHub de ${delay} min`);
    }
  }
}

const MAX_LATE = 20;
// Fereastra larga, iarna (UTC+2): 11:00, 14:00, 19:00 si capatul 01:00.
assertDelayCoverage('11:00 START 4 nov', 2026, 11, 4, 11, 0, 2, MAX_LATE);
assertDelayCoverage('14:00 PAUSE 4 nov', 2026, 11, 4, 14, 0, 2, MAX_LATE);
assertDelayCoverage('19:00 START 4 nov', 2026, 11, 4, 19, 0, 2, MAX_LATE);
assertDelayCoverage('01:00 PAUSE 5 nov', 2026, 11, 5, 1, 0, 2, MAX_LATE);
assertDelayCoverage('14:00 PAUSE 5 nov (inainte de BF)', 2026, 11, 5, 14, 0, 2, MAX_LATE);
assertDelayCoverage('18:30 START BF 5 nov', 2026, 11, 5, 18, 30, 2, MAX_LATE);
assertDelayCoverage('01:00 PAUSE final BF 7 nov', 2026, 11, 7, 1, 0, 2, MAX_LATE);
assertDelayCoverage('11:00 START 7 nov', 2026, 11, 7, 11, 0, 2, MAX_LATE);
assertDelayCoverage('19:00 START 15 nov', 2026, 11, 15, 19, 0, 2, MAX_LATE);
assertDelayCoverage('01:00 PAUSE 16 nov', 2026, 11, 16, 1, 0, 2, MAX_LATE);
assertDelayCoverage('18:30 START 16 nov', 2026, 11, 16, 18, 30, 2, MAX_LATE);
// Vara, program normal (UTC+3).
assertDelayCoverage('18:30 START vara', 2026, 7, 15, 18, 30, 3, MAX_LATE);
assertDelayCoverage('01:00 PAUSE vara', 2026, 7, 16, 1, 0, 3, MAX_LATE);

// Tabel pentru verificare umana: ora UTC → Bucuresti iarna / vara.
console.log('\nCron UTC → Bucuresti (zi de referinta, nu actiunea):');
const winterDay = new Date(Date.UTC(2026, 10, 10, 12, 0, 0));
const summerDay = new Date(Date.UTC(2026, 6, 15, 12, 0, 0));
function roClock(base, h, m) {
  const when = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), h, m, 0, 0));
  // Dupa 22:00 UTC iarna / 21:00 UTC vara cade in ziua urmatoare. Afisam ora locala.
  const p = bucharestParts(when);
  const next = p.day !== base.getUTCDate() ? '+' : ' ';
  return `${next}${pad(p.hour)}:${pad(p.minute)}`;
}
const uniqueSlots = slots.slice().sort((a, b) => a.h - b.h || a.m - b.m);
for (const s of uniqueSlots) {
  console.log(
    `  ${pad(s.h)}:${pad(s.m)}Z   iarna ${roClock(winterDay, s.h, s.m)}   vara ${roClock(summerDay, s.h, s.m)}`
  );
}
console.log(`\n${uniqueSlots.length} declansari UTC / zi, ${crons.length} expresii cron.`);

console.log('');
if (failed) {
  console.error('TEST ESUAT: ' + failed + ' cazuri gresite');
  process.exit(1);
}
console.log('TEST OK: toate cazurile trec.');
