const puppeteer = require('puppeteer');
const TARGETS = require('./targets');
const { isStartAllowed, isBlockedFromStart, START_ALLOWLIST } = TARGETS;

const EMAIL = process.env.EMAG_USER;
const PASSWORD = process.env.EMAG_PASS;
const ACTION = process.argv[2]; // START sau PAUSE
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!['START', 'PAUSE'].includes(ACTION)) {
  console.error('Actiune invalida:', ACTION);
  process.exit(1);
}

function campaignIdFromUrl(url) {
  const m = String(url).match(/campaign-manager\/(\d+)/);
  return m ? m[1] : 'unknown';
}

function isFirstAdSet(adSet) {
  const v = (adSet == null ? '' : String(adSet)).trim().toLowerCase();
  return v === '' || v === 'first' || v === 'only';
}

async function loginIfNeeded(page) {
  if (!page.url().includes('auth.emag.net')) return;
  await page.waitForSelector('#_username', { visible: true, timeout: 20000 });
  await page.type('#_username', EMAIL, { delay: 60 });
  const nextBtn = await page.evaluateHandle(() =>
    Array.from(document.querySelectorAll('button, a, input[type=button]'))
      .find(b => (b.innerText || b.value || '').trim() === 'Next'));
  if (nextBtn.asElement()) await nextBtn.asElement().click();
  else await page.keyboard.press('Enter');
  await sleep(3000);
  await page.waitForSelector('#_password', { visible: true, timeout: 20000 });
  await page.type('#_password', PASSWORD, { delay: 60 });
  await page.keyboard.press('Enter');
  await sleep(8000);
}

/**
 * Comutatorul din randul care are EXACT un switch si numele cerut.
 * Nu urca pana la un stramos care cuprinde toate randurile: acolo primul
 * switch este alt ad set (ex. "Imprimante others") si l-ar porni din greseala.
 */
async function findSwitchByName(page, name) {
  await page.waitForFunction(
    n => document.body.innerText.includes(n), { timeout: 30000 }, name);
  await sleep(1500);

  const handle = await page.evaluateHandle(n => {
    const links = Array.from(document.querySelectorAll('a, span, td, div'))
      .filter(e => e.children.length === 0 && (e.innerText || '').replace(/\s+/g, ' ').trim() === n);
    for (const el of links) {
      let row = el;
      for (let i = 0; i < 8 && row; i++, row = row.parentElement) {
        const switches = row.querySelectorAll ? row.querySelectorAll('button[role="switch"]') : [];
        if (switches.length === 1) return switches[0];
      }
    }
    return null;
  }, name);

  return handle.asElement();
}

/** Primul / singurul ad set: primul comutator de pe pagina. */
async function findFirstSwitch(page) {
  await page.waitForSelector('button[role="switch"]', { timeout: 30000 });
  await sleep(2000);
  const switches = await page.$$('button[role="switch"]');
  return switches[0] || null;
}

async function readAriaChecked(page, sw) {
  return (await page.evaluate(e => e.getAttribute('aria-checked'), sw)) === 'true';
}

async function confirmIfNeeded(page) {
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('button'))
      .find(x => /^(confirma|da|ok|salveaza)$/i.test((x.innerText || '').trim()));
    if (b) b.click();
  });
}

async function readStatusAfterReload(page, target) {
  if (isFirstAdSet(target.adSet)) {
    await page.waitForSelector('button[role="switch"]', { timeout: 30000 });
    return page.evaluate(() => {
      const sw = document.querySelector('button[role="switch"]');
      return sw ? sw.getAttribute('aria-checked') : null;
    });
  }
  const name = target.adSet;
  await page.waitForFunction(
    n => document.body.innerText.includes(n), { timeout: 30000 }, name);
  return page.evaluate(n => {
    const leaves = Array.from(document.querySelectorAll('a, span, td, div'))
      .filter(e => e.children.length === 0 && (e.innerText || '').replace(/\s+/g, ' ').trim() === n);
    for (const el of leaves) {
      let row = el;
      for (let i = 0; i < 8 && row; i++, row = row.parentElement) {
        const switches = row.querySelectorAll ? row.querySelectorAll('button[role="switch"]') : [];
        if (switches.length === 1) return switches[0].getAttribute('aria-checked');
      }
    }
    return null;
  }, name);
}

/** Nume de ad set vazute ca text frunza pe pagina curenta. */
async function leafTexts(page) {
  return page.evaluate(() => {
    const leaves = Array.from(document.querySelectorAll('a, span, td, div'))
      .filter(e => e.children.length === 0)
      .map(e => (e.innerText || '').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    return Array.from(new Set(leaves));
  });
}

/**
 * Daca un grup exclus ("Imprimante others", "Cartus_*") este pornit,
 * il opreste. Nu il porneste niciodata. START si PAUSE apeleaza asta.
 */
async function turnOffBlocked(page) {
  const names = (await leafTexts(page)).filter(isBlockedFromStart);
  for (const name of names) {
    const sw = await findSwitchByName(page, name);
    if (!sw) {
      console.log('Fara comutator, las neschimbat: ' + name);
      continue;
    }
    const on = await readAriaChecked(page, sw);
    if (!on) {
      console.log('Ramas oprit (exclus de la START): ' + name);
      continue;
    }
    console.log('Opresc grup exclus de la START: ' + name);
    await sw.click();
    await sleep(4000);
    await confirmIfNeeded(page);
    await sleep(3000);
  }
  return names;
}

async function toggleTarget(page, target, action) {
  const id = campaignIdFromUrl(target.url);
  const label = isFirstAdSet(target.adSet)
    ? `campanie ${id} (primul ad set)`
    : `campanie ${id} / ${target.adSet}`;
  const wantOn = action === 'START';

  if (wantOn && !isStartAllowed(target.adSet)) {
    throw new Error('START refuza ' + label + '. Allowlist: ' + START_ALLOWLIST.join(', '));
  }

  console.log(`\n=== Tinta: ${label} ===`);
  await page.goto(target.url, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(3000);
  await loginIfNeeded(page);
  console.log('1. URL:', page.url());

  const sw = isFirstAdSet(target.adSet)
    ? await findFirstSwitch(page)
    : await findSwitchByName(page, target.adSet);

  if (!sw) throw new Error('Nu am gasit comutatorul pentru ' + label);

  const before = await readAriaChecked(page, sw);
  console.log('2. Stare inainte:', before ? 'ACTIV' : 'OPRIT');

  if (before !== wantOn) {
    if (wantOn && isBlockedFromStart(target.adSet)) {
      throw new Error('Refuz sa pornesc grupul exclus ' + label);
    }
    await sw.click();
    await sleep(4000);
    await confirmIfNeeded(page);
    await sleep(3000);
  }

  const blocked = await turnOffBlocked(page);
  if (blocked.length) console.log('Grupuri excluse vazute:', blocked.join(' | '));

  await page.reload({ waitUntil: 'networkidle2' });
  await sleep(4000);
  const status = await readStatusAfterReload(page, target);
  console.log('3. Stare dupa reincarcare:', status === 'true' ? 'ACTIV' : 'OPRIT');
  await page.screenshot({ path: `rezultat-${id}.png`, fullPage: true });

  if ((status === 'true') !== wantOn) throw new Error('Starea nu s-a schimbat pentru ' + label);

  const stillOn = [];
  for (const name of (await leafTexts(page)).filter(isBlockedFromStart)) {
    const blockedSw = await findSwitchByName(page, name);
    if (blockedSw && await readAriaChecked(page, blockedSw)) stillOn.push(name);
  }
  if (stillOn.length) {
    throw new Error('Au ramas pornite grupuri excluse de la START: ' + stillOn.join(', '));
  }

  console.log('OK: ' + action + ' executat pentru ' + label);
}

(async () => {
  if (!Array.isArray(TARGETS) || TARGETS.length === 0) {
    console.error('Lista de tinte (targets.js) este goala.');
    process.exit(1);
  }
  if (ACTION === 'START') {
    const denied = TARGETS.filter(t => !isStartAllowed(t.adSet));
    if (denied.length) {
      console.error('START are tinte in afara allowlist-ului:', denied.map(t => t.adSet).join(', '));
      console.error('Allowlist:', START_ALLOWLIST.join(', '));
      process.exit(1);
    }
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900'],
  });

  const failures = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });

    // Login o singura data pe prima tinta, apoi refolosim sesiunea
    await page.goto(TARGETS[0].url, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(3000);
    await loginIfNeeded(page);
    console.log('Sesiune autentificata. URL:', page.url());

    for (const target of TARGETS) {
      const id = campaignIdFromUrl(target.url);
      try {
        await toggleTarget(page, target, ACTION);
      } catch (e) {
        console.error('EROARE [' + id + ']:', e.message);
        failures.push({ id, message: e.message });
        await page.screenshot({ path: `error-${id}.png`, fullPage: true }).catch(() => {});
      }
    }
  } catch (e) {
    console.error('EROARE (sesiune):', e.message);
    failures.push({ id: 'session', message: e.message });
    try {
      const pages = await browser.pages();
      if (pages[0]) await pages[0].screenshot({ path: 'error-session.png', fullPage: true }).catch(() => {});
    } catch (_) { /* ignore */ }
  } finally {
    await browser.close();
  }

  if (failures.length) {
    console.error('\nEsecuri (' + failures.length + '/' + TARGETS.length + '):');
    for (const f of failures) console.error(' - ' + f.id + ': ' + f.message);
    process.exitCode = 1;
  } else {
    console.log('\nOK: toate tintele au fost procesate (' + ACTION + ').');
  }
})();
