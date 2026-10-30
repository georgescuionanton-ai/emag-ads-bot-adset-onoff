#!/usr/bin/env node
/**
 * Test local: afiseaza actiunea decidata pentru o lista de date/ore Bucuresti.
 * Rulare: node test_decide.js
 */
'use strict';

const { decideFor } = require('./decide_action');

const SAMPLES = [
  '2026-11-03 10:10', // fereastra larga → START
  '2026-11-05 19:00', // BF incepe 18:30 → START
  '2026-11-06 03:05', // BF toata ziua → START
  '2026-11-06 14:00', // BF diurn → START
  '2026-11-07 01:05', // BF s-a terminat la 01:00 → PAUSE
  '2026-11-07 10:10', // fereastra larga → START
  '2026-11-16 10:10', // program normal, inainte de 18:30 → PAUSE
  '2026-11-16 18:40', // program normal → START
  '2026-11-17 01:05', // dupa 01:00 → PAUSE
];

const EXPECTED = {
  '2026-11-03 10:10': 'START',
  '2026-11-05 19:00': 'START',
  '2026-11-06 03:05': 'START',
  '2026-11-06 14:00': 'START',
  '2026-11-07 01:05': 'PAUSE',
  '2026-11-07 10:10': 'START',
  '2026-11-16 10:10': 'PAUSE',
  '2026-11-16 18:40': 'START',
  '2026-11-17 01:05': 'PAUSE',
};

let failed = 0;
console.log('Decizie AUTO (Europe/Bucharest):\n');
for (const s of SAMPLES) {
  const got = decideFor(s);
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
