// Campaniile raman aceleasi. START (inclusiv reluarea de la 18:30) porneste
// DOAR ad set-urile din START_ALLOWLIST. PAUSE / STOP le opreste pe acestea
// si poate opri si grupurile excluse ("Imprimante others", "Cartus_*"),
// dar nu le porneste niciodata.
//
// adSet: numele exact al ad set-ului (nu 'first' — primul comutator din
// campania 632815 este "Imprimante others", care trebuie sa ramana oprit).
//
'use strict';

const START_ALLOWLIST = [
  'Imprimante_oct26-ian27',
  'Imprimante_exact_nov26-ian27', // ad group 726571
  'Cartuse_Canon_auto_nov26-ian27', // ad group 731421
  'Canon printere vs competitori',
];

function normName(name) {
  return String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
}

/**
 * Grupuri care nu se pornesc niciodata.
 * "Cartus ..." / "Cartus_*" din Product & Category. Nu prinde
 * "Cartuse_Canon_auto_nov26-ian27" (are 'e' dupa Cartus).
 */
function isBlockedFromStart(name) {
  const n = normName(name);
  if (!n) return false;
  if (n.toLowerCase() === 'imprimante others') return true;
  if (/^cartus(?=_|\s)/i.test(n)) return true;
  return false;
}

/** START poate porni doar un nume din allowlist, niciodata un grup exclus. */
function isStartAllowed(name) {
  const n = normName(name);
  if (!n || isBlockedFromStart(n)) return false;
  return START_ALLOWLIST.indexOf(n) !== -1;
}

const TARGETS = [
  {
    url: 'https://advertising.emag.net/campaign-manager/632815',
    adSet: 'Imprimante_oct26-ian27',
  },
  {
    url: 'https://advertising.emag.net/campaign-manager/648722',
    adSet: 'Imprimante_exact_nov26-ian27', // ad group 726571; start 2026-11-01
  },
  {
    url: 'https://advertising.emag.net/campaign-manager/652949',
    adSet: 'Cartuse_Canon_auto_nov26-ian27', // ad group 731421; campanie NOD_Canon_auto_cartuse_nov26-ian27
  },
  {
    // Product & Category (NOD_Canon_manual_product_category_nov26); 2026-11-01 .. 2026-11-30
    // Pe aceeasi pagina sunt ad set-uri "Cartus_*" / "Cartus ...", istorice, pauzate.
    // START nu le porneste. PAUSE le poate opri daca sunt cumva active.
    url: 'https://advertising.emag.net/campaign-manager/634320',
    adSet: 'Canon printere vs competitori',
  },
];

TARGETS.START_ALLOWLIST = START_ALLOWLIST;
TARGETS.isStartAllowed = isStartAllowed;
TARGETS.isBlockedFromStart = isBlockedFromStart;
TARGETS.normName = normName;

module.exports = TARGETS;
