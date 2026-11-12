// Odd-one-out: go to the site, look at the shapes with the weak layer shown / hidden, then press the answer button by walking onto it.
const tapK = async (k, f = 3) => { await page.keyboard.down(k); await st(f, false); await page.keyboard.up(k); };
await page.evaluate(() => { const g = window.__rgGlasses.goto('oddone'); window.__rg.teleport(g.x, g.y, g.z, g.yaw); });
await st(60);
let d = await page.evaluate(() => window.__rgGlasses.debug('oddone'));
log('debug', JSON.stringify(d).slice(0, 600));
await H.snap('odd/00-shown');
await page.evaluate(() => { window.__rg.setLayerVisible(1, false); window.__rg.render(); });
await shot('odd/01-weak-hidden');
await page.evaluate(() => { window.__rg.setLayerVisible(1, true); window.__rg.render(); });
const b = d.buttons?.[d.answer];
if (b) {
  log('walk to answer button', await H.walkTo(b[0], b[b.length - 1], 10, 0.5));
  await tapK('KeyE');
  await st(60);
  d = await page.evaluate(() => window.__rgGlasses.debug('oddone'));
  log('after', JSON.stringify({ phase: d.phase, hits: d.hits, misses: d.misses, gems: d.gems, lastHit: d.lastHit }));
  await H.snap('odd/02-after');
}
