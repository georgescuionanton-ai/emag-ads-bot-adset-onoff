const puppeteer = require('puppeteer');

const EMAIL = process.env.EMAG_USER;
const PASSWORD = process.env.EMAG_PASS;
const TARGET_URL = 'https://advertising.emag.net/campaign-manager/632815';
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
    console.log('1. URL dupa login:', page.url());

    await page.screenshot({ path: 'a_lista_campanii.png', fullPage: true });

    // Click pe campanie ca sa vedem ad set-urile
    const clicked = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('a, span, div, td'))
        .find(e => e.children.length === 0 && (e.innerText || '').trim() === 'NOD_Canon_auto_imprimante_oct26-ian27');
      if (el) { el.click(); return true; }
      return false;
    });
    console.log('2. Click pe campanie:', clicked);
    await sleep(6000);
    console.log('3. URL:', page.url());
    await page.screenshot({ path: 'b_in_campanie.png', fullPage: true });

    const info = await page.evaluate(() => {
      const t = document.body.innerText;
      const i = t.indexOf('Imprimante_oct26-ian27');
      const sw = Array.from(document.querySelectorAll('.mdc-switch, [role="switch"], input[type="checkbox"]'))
        .slice(0, 10).map(s => ({
          tag: s.tagName, cls: s.className, role: s.getAttribute('role'),
          aria: s.getAttribute('aria-checked'), checked: s.checked,
        }));
      return { gasit: i >= 0, text: t.slice(0, 1500), switches: sw };
    });
    console.log(JSON.stringify(info, null, 2));
  } catch (e) {
    console.error('EROARE:', e.message);
    const pages = await browser.pages();
    if (pages[0]) await pages[0].screenshot({ path: 'error.png', fullPage: true }).catch(() => {});
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
