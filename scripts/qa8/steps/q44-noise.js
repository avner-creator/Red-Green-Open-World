// QA6: render-noise check: same frozen frame rendered twice with nothing toggled, then H.sep again.
await page.evaluate(() => window.__rg.render());
const A = await H.grab();
await page.evaluate(() => window.__rg.render());
const B = await H.grab();
const m = [0, 0, 0];
for (let i = 0; i < A.data.length; i += 4) for (let c = 0; c < 3; c++) m[c] = Math.max(m[c], Math.abs(A.data[i + c] - B.data[i + c]));
log('noise (same frame twice)', m);
log('sep', JSON.stringify(await H.sep()));
log('sep', JSON.stringify(await H.sep()));
