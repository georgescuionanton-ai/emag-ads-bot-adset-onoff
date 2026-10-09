const puppeteer = require('puppeteer');

const EMAIL = process.env.EMAG_USER;
const PASSWORD = process.env.EMAG_PASS;
const TARGET_URL = 'https://advertising.emag.net/campaign-manager/632815';
const ADSET = 'Imprimante_oct26-ian27';
const ACTION = process.argv[2]; // START sau PAUSE
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!['START', 'PAUSE'].includes(ACTION)) {
  console.error('Actiune invalida:', ACTION);
  process.exit(1);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900 });
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(3000);

    // Login (doar daca suntem redirectionati)
    if (page.url().includes('auth.emag.net')) {
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
    console.log('1. URL:', page.url());

    // Asteptam tabelul cu ad set-uri
    await page.waitForFunction(
      name => document.body.innerText.includes(name), { timeout: 30000 }, ADSET);
    await sleep(2000);

    // Gasim randul exact si comutatorul lui
    const handle = await page.evaluateHandle(name => {
      const links = Array.from(document.querySelectorAll('a, span, td, div'))
        .filter(e => e.children.length === 0 && (e.innerText || '').trim() === name);
      for (const el of links) {
        let row = el;
        for (let i = 0; i < 8 && row; i++, row = row.parentElement) {
          const sw = row.querySelector && row.querySelector('button[role="switch"]');
          if (sw) return sw;
        }
      }
      return null;
    }, ADSET);

    const sw = handle.asElement();
    if (!sw) throw new Error('Nu am gasit comutatorul pentru ' + ADSET);

    const readState = async () =>
      (await page.evaluate(e => e.getAttribute('aria-checked'), sw)) === 'true';

    const wantOn = ACTION === 'START';
    const before = await readState();
    console.log('2. Stare inainte:', before ? 'ACTIV' : 'OPRIT');

    if (before !== wantOn) {
      await sw.click();
      await sleep(4000);
      // unele interfete cer confirmare intr-un dialog
      await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('button'))
          .find(x => /^(confirma|da|ok|salveaza)$/i.test((x.innerText || '').trim()));
        if (b) b.click();
      });
      await sleep(3000);
    }

    // Verificare dupa reincarcare
    await page.reload({ waitUntil: 'networkidle2' });
    await sleep(4000);
    const status = await page.evaluate(name => {
      const el = Array.from(document.querySelectorAll('a, span, td, div'))
        .find(e => e.children.length === 0 && (e.innerText || '').trim() === name);
      let row = el;
      for (let i = 0; i < 8 && row; i++, row = row.parentElement) {
        const sw = row.querySelector && row.querySelector('button[role="switch"]');
        if (sw) return sw.getAttribute('aria-checked');
      }
      return null;
    }, ADSET);

    console.log('3. Stare dupa reincarcare:', status === 'true' ? 'ACTIV' : 'OPRIT');
    await page.screenshot({ path: 'rezultat.png', fullPage: true });

    if ((status === 'true') !== wantOn) throw new Error('Starea nu s-a schimbat.');
    console.log('OK: ' + ACTION + ' executat.');
  } catch (e) {
    console.error('EROARE:', e.message);
    const pages = await browser.pages();
    if (pages[0]) await pages[0].screenshot({ path: 'error.png', fullPage: true }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
