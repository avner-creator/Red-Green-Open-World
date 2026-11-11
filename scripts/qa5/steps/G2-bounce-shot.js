// Capture the bounce ring (layer shown / hidden), and try one press at the 'perfect' moment.
const { PNG } = await import('pngjs');
const { writeFileSync } = await import('node:fs');
await page.keyboard.down('Space');
let d;
for (let i = 0; i < 200; i++) { await st(5, false); d = await page.evaluate(() => window.__rgGlasses.weave.debug('bounce')); if (d.ring) break; }
await page.keyboard.up('Space');
await st(20, false);
await page.evaluate(() => window.__rg.render());
const grab = async () => PNG.sync.read(await page.screenshot());
const a = await grab();
writeFileSync('test-results/qa5/drv/wv/bounce-ring.png', PNG.sync.write(a));
for (const [c, n] of [[0, 'R'], [1, 'G']]) { const o = new PNG({ width: a.width, height: a.height }); for (let i = 0; i < a.data.length; i += 4) { const v = a.data[i + c]; o.data[i] = o.data[i + 1] = o.data[i + 2] = v; o.data[i + 3] = 255; } writeFileSync(`test-results/qa5/drv/wv/bounce-ring.${n}.png`, PNG.sync.write(o)); }
await page.evaluate(() => { window.__rg.setLayerVisible(1, false); window.__rg.render(); });
const b = await grab();
await page.evaluate(() => { window.__rg.setLayerVisible(1, true); window.__rg.render(); });
const dd = [0, 0, 0];
for (let i = 0; i < a.data.length; i += 4) for (let c = 0; c < 3; c++) if (Math.abs(a.data[i + c] - b.data[i + c]) > 2) dd[c]++;
log('ring', JSON.stringify(d).slice(0, 250), 'diff RGB', dd);
// child presses jump when the closing ring meets the target: poll `perfect` / at fields
let pressed = false;
for (let i = 0; i < 200 && !pressed; i++) {
  await st(2, false);
  const e = await page.evaluate(() => window.__rgGlasses.weave.debug('bounce'));
  if (!e.ring) break;
  if (e.at != null && e.perfect != null && Math.abs(e.at - e.perfect) < (e.half ?? 0.1) * 0.5) { await page.keyboard.press('Space'); pressed = true; }
}
await st(120, false);
log('after press', pressed, JSON.stringify(await page.evaluate(() => { const d = window.__rgGlasses.weave.debug('bounce'); return { hits: d.hits, perfects: d.perfects, misses: d.misses, grade: d.lastGrade }; })), (await H.s()).wallet);
