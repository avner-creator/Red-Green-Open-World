// What is the half-hidden round icon at the left edge under the wallet (x~15, y~105)?
const r = await page.evaluate(() => [[8, 100], [18, 108], [30, 112]].map(([x, y]) => document.elementsFromPoint(x, y).slice(0, 4).map((e) => (e.dataset?.testid ?? '') + '.' + String(e.className?.baseVal ?? e.className).slice(0, 40) + '#' + e.tagName)));
log(JSON.stringify(r));
