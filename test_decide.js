#!/usr/bin/env node
/**
 * Test local: afiseaza actiunea decidata pentru o lista de date/ore Bucuresti.
 * Rulare: node test_decide.js
 */
'use strict';

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
};

let failed = 0;
console.log('Decizie AUTO (Europe/Bucharest):\n');
for (const s of SAMPLES) {
  const got = decide(bucharestParts(s));
  const exp = EXPECTED[s];
  const ok = got === exp;
  if (!ok) failed++;
  console.log(
    `${s.padEnd(16)} → ${got.padEnd(5)}  ${ok ? 'OK' : 'FAIL (asteptat ' + exp + ')'}`
  );
}

console.log('');
if (failed) {
  console.error('TEST ESUAT: ' + failed + ' cazuri gresite');
  process.exit(1);
}
console.log('TEST OK: toate cazurile trec.');
