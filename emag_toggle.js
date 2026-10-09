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

        if (page.url().includes('auth.emag.net') || page.url().includes('login')) {
            console.log("2. Pagina de login detectata. Incepem autentificarea pas cu pas...");

            // Pasul 1: Introducere Email
            const emailInput = await page.waitForSelector('input[type="email"], input[name="email"], input[name="username"], #username, #email', { timeout: 15000 });
            await emailInput.click({ clickCount: 3 });
            await emailInput.type(EMAIL, { delay: 50 });
            await new Promise(r => setTimeout(r, 1000));

            // Apasam Enter sau butonul de Next/Submit pentru pasul 1
            await page.keyboard.press('Enter');
            await new Promise(r => setTimeout(r, 2500));

            // Pasul 2: Introducere Parola (daca exista campul de parola)
            const passInput = await page.$('input[type="password"], input[name="password"], #password');
            if (passInput) {
                console.log("3. Introducere parola...");
                await passInput.click({ clickCount: 3 });
                await passInput.type(PASSWORD, { delay: 50 });
                await new Promise(r => setTimeout(r, 1000));
                await page.keyboard.press('Enter');
            } else {
                console.log("3. Cautam butonul de continuare/login...");
                const submitBtn = await page.$('button[type="submit"], input[type="submit"], button.btn-primary, button');
                if (submitBtn) await submitBtn.click();
            }

            console.log("4. Asteptare autentificare si redirectionare...");
            await new Promise(r => setTimeout(r, 7000));
        }

        if (!page.url().includes('632815')) {
            console.log("5. Re-navighez catre pagina campaniei...");
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
