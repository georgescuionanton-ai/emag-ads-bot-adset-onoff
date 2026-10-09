const puppeteer = require('puppeteer');

const EMAIL = process.env.EMAG_USER || 'anton.georgescu@stick-carrot.com';
const PASSWORD = process.env.EMAG_PASS || 'mSz8sFHUJv9kwHc';
const TARGET_URL = 'https://advertising.emag.net/campaign-manager/632815';
const TARGET_ADSET = 'Imprimante_oct26-ian27';
const ACTION = process.argv[2] || 'START';

(async () => {
    console.log(`[${new Date().toISOString()}] Pornire script eMAG Ads (${ACTION})...`);
    
    let browser;
    try {
        browser = await puppeteer.launch({ 
            headless: "new", 
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,800'] 
        });
        
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        page.setDefaultNavigationTimeout(60000);

        console.log(`1. Accesez URL: ${TARGET_URL}`);
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });
        await new Promise(r => setTimeout(r, 3000));

        console.log(`2. URL curent dupa incarcare: ${page.url()}`);

        // Verificam daca am fost redirectionati la pagina de Login
        if (page.url().includes('auth.emag.net') || page.url().includes('login')) {
            console.log("3. Pagina de login detectata pe auth.emag.net. Autentificare...");

            // Asteptam campul de email/username
            const emailSelector = 'input[type="email"], input[name="email"], input[name="_username"], #username, #email, input[name="username"]';
            await page.waitForSelector(emailSelector, { timeout: 15000 });
            await page.type(emailSelector, EMAIL);

            // Asteptam campul de parola
            const passSelector = 'input[type="password"], input[name="password"], input[name="_password"], #password';
            await page.waitForSelector(passSelector, { timeout: 15000 });
            await page.type(passSelector, PASSWORD);

            // Apasam butonul de submit
            const submitBtnSelector = 'button[type="submit"], input[type="submit"], .btn-primary, button';
            await Promise.all([
                page.click(submitBtnSelector),
                page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => {})
            ]);

            console.log("4. Autentificare trimisa. Asteptare redirectionare...");
            await new Promise(r => setTimeout(r, 5000));
        }

        // Navigare explicita catre campanie dupa login
        if (!page.url().includes('632815')) {
            console.log("5. Navighez catre pagina campaniei...");
            await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });
            await new Promise(r => setTimeout(r, 5000));
        }

        console.log(`6. URL final campanie: ${page.url()}`);

        console.log("7. Caut ad set-ul in pagina...");
        const result = await page.evaluate((adSetName, action) => {
            const bodyText = document.body.innerText;
            if (!bodyText.includes(adSetName)) {
                return { success: false, reason: `Ad set-ul "${adSetName}" nu a fost gasit in textul paginii.` };
            }

            const rows = Array.from(document.querySelectorAll('tr, div[role="row"], .table-row'));
            const targetRow = rows.find(r => r.innerText && r.innerText.includes(adSetName));

            if (!targetRow) {
                return { success: false, reason: `Randul pentru "${adSetName}" nu a putut fi izolat.` };
            }

            const switchElem = targetRow.querySelector('.mdc-switch, input[type="checkbox"], button[role="switch"]');
            if (!switchElem) {
                return { success: false, reason: 'Butonul de comutare nu a fost gasit.' };
            }

            const input = targetRow.querySelector('input');
            const isChecked = input ? input.checked : switchElem.classList.contains('mdc-switch--checked');

            if ((action === 'START' && !isChecked) || (action === 'PAUSE' && isChecked)) {
                switchElem.click();
                return { success: true, message: `Status modificat cu succes la ${action}.` };
            }

            return { success: true, message: `Ad set-ul este deja in starea ceruta (${isChecked ? 'Activ' : 'Inactiv'}).` };
        }, TARGET_ADSET, ACTION);

        console.log(`8. REZULTAT: ${result.message || result.reason}`);
        
        if (!result.success) {
            await page.screenshot({ path: 'error.png', fullPage: true });
            process.exit(1);
        }

    } catch (err) {
        console.error("EROARE CRITICA:", err.message);
        if (browser) {
            const pages = await browser.pages();
            if (pages.length > 0) {
                await pages[0].screenshot({ path: 'error.png', fullPage: true }).catch(() => {});
            }
        }
        process.exit(1);
    } finally {
        if (browser) await browser.close();
    }
})();
