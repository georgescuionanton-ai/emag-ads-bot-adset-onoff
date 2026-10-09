const puppeteer = require('puppeteer');

const EMAIL = process.env.EMAG_USER || 'anton.georgescu@stick-carrot.com';
const PASSWORD = process.env.EMAG_PASS || 'mSz8sFHUJv9kwHc';
const TARGET_URL = 'https://advertising.emag.net/campaign-manager/632815?pageSize=10&sortField=id&sortDirection=desc&page=1&status=all&dateStart=2026-09-09&dateEnd=2026-10-09';
const TARGET_ADSET = 'Imprimante_oct26-ian27';

const ACTION = process.argv[2] || 'PAUSE';

(async () => {
    console.log(`[${new Date().toISOString()}] Executare acțiune eMAG Ads: ${ACTION}`);
    
    const browser = await puppeteer.launch({ 
        headless: "new", 
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });
    
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000);

    try {
        await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });

        if (page.url().includes('login') || await page.$('input[type="email"], input[name="username"]')) {
            console.log("Se efectuează autentificarea...");
            await page.type('input[type="email"], input[name="username"]', EMAIL);
            await page.type('input[type="password"], input[name="password"]', PASSWORD);
            
            await Promise.all([
                page.click('button[type="submit"], input[type="submit"]'),
                page.waitForNavigation({ waitUntil: 'networkidle2' })
            ]);

            await page.goto(TARGET_URL, { waitUntil: 'networkidle2' });
        }

        await page.waitForSelector('.mdc-switch, tr', { timeout: 15000 });

        const result = await page.evaluate((adSetName, action) => {
            const rows = Array.from(document.querySelectorAll('tr, div[role="row"]'));
            const targetRow = rows.find(r => r.innerText.includes(adSetName));
            
            if (!targetRow) return `Ad set-ul ${adSetName} nu a fost găsit.`;

            const switchInput = targetRow.querySelector('input.mdc-switch__native-control, input[type="checkbox"]');
            const switchBtn = targetRow.querySelector('button.mdc-switch, .mdc-switch');

            if (!switchInput && !switchBtn) return "Nu s-a găsit comutatorul de status.";

            const isChecked = switchInput ? switchInput.checked : switchBtn.classList.contains('mdc-switch--checked');

            if (action === 'START' && !isChecked) {
                (switchBtn || switchInput).click();
                return "Ad Set PORNI
T cu succes.";
            } else if (action === 'PAUSE' && isChecked) {
                (switchBtn || switchInput).click();
                return "Ad Set OPRI
T cu succes.";
            }

            return `Ad set-ul este deja în starea cerută (${isChecked ? 'ACTIV' : 'INACTIV'}).`;
        }, TARGET_ADSET, ACTION);

        console.log(`Rezultat: ${result}`);

    } catch (err) {
        console.error("Eroare la executare:", err.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
