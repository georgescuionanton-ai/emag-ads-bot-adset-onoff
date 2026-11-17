#!/usr/bin/env node
/**
 * Citeste hold-ul de buget (artifactul GitHub "emag-hold"), decide actiunea
 * si, daca e cazul, scrie hold-out/hold.json ca workflow-ul sa-l incarce.
 *
 * Hold-ul NU este o variabila de repo: GITHUB_TOKEN nu poate scrie variabile,
 * iar un commit pe main poate fi blocat de branch protection. Artifactul
 * emag-hold e scris cu acelasi mecanism ca screenshot-urile.
 *
 * Test local, fara API:
 *   HOLD_JSON=none WHEN="2026-11-16 14:00" MODE=AUTO node persist_hold.js
 *   HOLD_JSON='{"holdDate":"2026-11-16"}' MODE=PAUSE_UNTIL_EVENING ...
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  bucharestParts,
  resolveDispatch,
  parseHoldDocument,
  isoDate,
} = require('./decide_action');

const ARTIFACT = 'emag-hold';

function log(msg) {
  process.stderr.write(msg + '\n');
}

function writeOutput(key, value) {
  const line = key + '=' + value + '\n';
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, line);
  else process.stdout.write(line);
}

function gh(args) {
  try {
    return execFileSync('gh', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString() : '';
    const err = new Error((stderr || e.message || 'gh a esuat').trim());
    err.status = e.status;
    throw err;
  }
}

function newestHoldArtifact(repo) {
  let best = null;
  for (let page = 1; page <= 20; page++) {
    const raw = gh([
      'api',
      `/repos/${repo}/actions/artifacts?name=${encodeURIComponent(ARTIFACT)}&per_page=100&page=${page}`,
    ]);
    const data = JSON.parse(raw);
    const arts = data.artifacts || [];
    for (const a of arts) {
      if (a.name !== ARTIFACT || a.expired) continue;
      if (!best || String(a.created_at) > String(best.created_at) ||
          (String(a.created_at) === String(best.created_at) && a.id > best.id)) {
        best = a;
      }
    }
    if (arts.length < 100) break;
  }
  return best;
}

function holdDateFromZip(repo, artifactId) {
  const zipPath = path.join(os.tmpdir(), `emag-hold-${artifactId}.zip`);
  const fd = fs.openSync(zipPath, 'w');
  try {
    execFileSync('gh', ['api', `/repos/${repo}/actions/artifacts/${artifactId}/zip`], {
      stdio: ['ignore', fd, 'pipe'],
    });
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString() : '';
    throw new Error((stderr || e.message || 'descarcare artifact esuata').trim());
  } finally {
    fs.closeSync(fd);
  }

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'emag-hold-'));
  try {
    execFileSync('unzip', ['-o', '-q', zipPath, '-d', dir], { stdio: 'pipe' });
    const found = [];
    const walk = current => {
      for (const ent of fs.readdirSync(current, { withFileTypes: true })) {
        const p = path.join(current, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (ent.name === 'hold.json') found.push(p);
      }
    };
    walk(dir);
    if (found.length !== 1) {
      throw new Error('artifactul emag-hold nu contine un singur hold.json');
    }
    return parseHoldDocument(fs.readFileSync(found[0], 'utf8'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(zipPath, { force: true });
  }
}

function loadHoldDate() {
  if (process.env.HOLD_JSON != null && process.env.HOLD_JSON !== '') {
    if (process.env.HOLD_JSON === 'none') return null;
    return parseHoldDocument(process.env.HOLD_JSON);
  }
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) throw new Error('GITHUB_REPOSITORY lipseste');
  const art = newestHoldArtifact(repo);
  if (!art) return null;
  log(`Hold gasit: artifact ${art.id} creat ${art.created_at}`);
  return holdDateFromZip(repo, art.id);
}

function writeHoldFile(storedHoldDate) {
  const dir = process.env.HOLD_OUT_DIR || 'hold-out';
  fs.mkdirSync(dir, { recursive: true });
  const doc = {
    holdDate: storedHoldDate,
    until: '18:30',
    timezone: 'Europe/Bucharest',
    setAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir, 'hold.json'), JSON.stringify(doc, null, 2) + '\n');
}

function main() {
  const mode = process.env.MODE || 'AUTO';
  const eventName = process.env.EVENT || '';
  const when = process.env.WHEN;
  const parts = when ? bucharestParts(when) : bucharestParts(new Date());
  let holdDate;
  try {
    holdDate = loadHoldDate();
  } catch (e) {
    log('Nu am putut citi hold-ul (artifact emag-hold). Oprire, ca sa nu repornesc anunturile peste o pauza de buget.');
    log(e.message);
    process.exit(1);
  }

  let result;
  try {
    result = resolveDispatch(mode, parts, holdDate, eventName);
  } catch (e) {
    log(e.message);
    process.exit(1);
  }

  const clock = `${isoDate(parts)} ${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
  log(`Bucuresti ${clock}  mod=${mode}  hold=${holdDate || '-'}  → ${result.action}`);
  if (result.note) log(result.note);

  if (result.persist) writeHoldFile(result.storedHoldDate);

  writeOutput('action', result.action);
  writeOutput('persist', result.persist ? 'true' : 'false');
  writeOutput('persist_required', result.persistRequired ? 'true' : 'false');
  writeOutput('skip', result.skip ? 'true' : 'false');
}

if (require.main === module) main();
