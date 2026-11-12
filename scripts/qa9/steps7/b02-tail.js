const sum = [];
for (const weakEye of globalThis.QA_WEAK ?? ['left', 'right']) {
  await page.evaluate((w) => window.__rg.setEye({ leftLens: 'green', weakEye: w }), weakEye);
  await st(5, false);
  for (const id of globalThis.QA_IDS ?? ['oddone', 'dotsigns', 'lineup', 'gates', 'glowflies', 'toys']) {
    globalThis.QA_ID = id; globalThis.QA_TAG = `-gR-${weakEye}`; globalThis.QA_RETURN = true; globalThis.__waitShot = 0; globalThis.__waitT = -99;
    try { await play(); } catch (e) { log('ERR', id, String(e).slice(0, 200)); }
    const kd = await page.evaluate((id) => window.__rgGlasses.boothDebug(id), id);
    sum.push([weakEye, id, JSON.stringify(kd?.results), kd?.hits]);
  }
}
log('SUMMARY', JSON.stringify(sum));
await page.evaluate(() => window.__rg.setEye({ leftLens: 'red', weakEye: 'left' }));
