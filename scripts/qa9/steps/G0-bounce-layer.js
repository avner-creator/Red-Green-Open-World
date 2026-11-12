// Phase 2 `bounce` layer: bounce on the trampoline; when the weave debug says the ring is on, capture the same frozen
// frame with the WeakOnly layer shown and hidden (HUD hidden) and diff per channel. Then play: press Space when the ring
// is in the target window vs never, and log results.
const { PNG } = await import('pngjs');
const { writeFileSync, mkdirSync } = await import('node:fs');
mkdirSync('test-results/qa9/drv/wv', { recursive: true });
const W = (id) => page.evaluate((id) => window.__rgGlasses.weave.debug(id), id);
log('weave ids', await page.evaluate(() => window.__rgGlasses.weave.ids()));
if ((await H.s()).mode !== 'walk') { await page.keyboard.press('KeyR'); await st(60, false); }
await H.near(58, -24, 12, Math.PI / 2);
await H.walkTo(58, -24, 12, 1.0);
await page.keyboard.down('Space');
await st(240, false);
await page.keyboard.up('Space');
let got = false;
const seen = [];
for (let i = 0; i < 400 && !got; i++) {
  await st(3, false);
  const d = await W('bounce');
  if (i % 20 === 0) seen.push(JSON.stringify(d).slice(0, 160));
  if (d.ringOn || d.ring || d.showing || d.active === true && (d.phase === 'ring' || d.state === 'ring')) got = true;
}
log('debug samples', seen.slice(0, 6).join('\n'));
await page.evaluate(() => window.__rg.render());
const grab = async () => PNG.sync.read(await page.screenshot());
const a = await grab();
writeFileSync('test-results/qa9/drv/wv/bounce.png', PNG.sync.write(a));
await page.evaluate(() => { window.__rg.setLayerVisible(1, false); window.__rg.render(); });
const b = await grab();
await page.evaluate(() => { window.__rg.setLayerVisible(1, true); window.__rg.render(); });
const dd = [0, 0, 0];
const o = new PNG({ width: a.width, height: a.height });
for (let i = 0; i < a.data.length; i += 4) { for (let c = 0; c < 3; c++) { const x = Math.abs(a.data[i + c] - b.data[i + c]) > 2; if (x) dd[c]++; o.data[i + c] = x ? 255 : 0; } o.data[i + 3] = 255; }
writeFileSync('test-results/qa9/drv/wv/bounce.diff.png', PNG.sync.write(o));
log('ring found', got, 'changed px RGB', dd, JSON.stringify(await W('bounce')).slice(0, 300));
// keep bouncing 30 s pressing Space every landing (child), log weave results
const res = [];
for (let i = 0; i < 30; i++) { await page.keyboard.down('Space'); await st(20, false); await page.keyboard.up('Space'); await st(40, false); }
log('after play', JSON.stringify(await W('bounce')).slice(0, 400));
