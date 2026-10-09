const puppeteer = require('puppeteer');

const EMAIL = process.env.EMAG_USER;
const PASSWORD = process.env.EMAG_PASS;
const TARGET_URL = 'https://advertising.emag.net/campaign-manager/632815';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(3000);
    console.log('1. URL:', page.url());

    // Pasul 1: username + Next
    await page.waitForSelector('#_username', { visible: true, timeout: 20000 });
    await page.type('#_username', EMAIL, { delay: 60 });
    await page.screenshot({ path: 'step1.png' });

    const nextBtn = await page.evaluateHandle(() =>
      Array.from(document.querySelectorAll('button, a, input[type=button]'))
        .find(b => (b.innerText || b.value || '').trim() === 'Next'));
    if (nextBtn.asElement()) await nextBtn.asElement().click();
    else await page.keyboard.press('Enter');
    await sleep(3000);

    // Pasul 2: parola
    await page.waitForSelector('#_password', { visible: true, timeout: 20000 });
    await page.type('#_password', PASSWORD, { delay: 60 });
    await page.screenshot({ path: 'step2.png' });
    await page.keyboard.press('Enter');
    await sleep(8000);

    console.log('2. URL dupa login:', page.url());
    console.log('3. Titlu:', await page.title());
    console.log('4. Text pagina:', (await page.evaluate(() => document.body.innerText)).slice(0, 600));
    await page.screenshot({ path: 'step3_dupa_login.png', fullPage: true });
  } catch (e) {
    console.error('EROARE:', e.message);
    const pages = await browser.pages();
    if (pages[0]) await pages[0].screenshot({ path: 'error.png', fullPage: true }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
