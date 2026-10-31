// Lista campaniilor / ad set-urilor de comutat (aceeasi actiune START/PAUSE pentru toate).
// Editeaza aici ca sa adaugi/scoti tinte.
//
// adSet:
//   - numele exact al ad set-ului, SAU
//   - 'first' / 'only' = singurul (primul) ad set din campanie
//
module.exports = [
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
    adSet: 'first', // AUTO cartuse (campanie NOD_Canon_auto_cartuse_nov26-ian27, ad group 731421); start 2026-11-01
  },
  {
    // Product & Category (NOD_Canon_manual_product_category_nov26); 2026-11-01 .. 2026-11-30
    // IMPORTANT: nume exact — campania mai are 5 ad set-uri vechi (cartuse) pauzate; NU folosi 'first'.
    url: 'https://advertising.emag.net/campaign-manager/634320',
    adSet: 'Canon printere vs competitori',
  },
];
