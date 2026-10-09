const puppeteer = require('puppeteer');

const TARGET_URL = 'https://advertising.emag.net/campaign-manager/632815';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(TARGET_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 5000));

    console.log('URL:', page.url());
    console.log('TITLU:', await page.title());

    await page.screenshot({ path: 'login_screen.png', fullPage: true });

    const info = await page.evaluate(() => ({
      inputs: Array.from(document.querySelectorAll('input')).map(i => ({
        type: i.type, name: i.name, id: i.id, placeholder: i.placeholder,
      })),
      buttons: Array.from(document.querySelectorAll('button, a.btn')).map(b => (b.innerText || '').trim()).slice(0, 15),
      iframes: document.querySelectorAll('iframe').length,
      textPagina: document.body.innerText.slice(0, 600),
    }));
    console.log(JSON.stringify(info, null, 2));
  } catch (e) {
    console.error('EROARE:', e.message);
  } finally {
    await browser.close();
  }
})();
