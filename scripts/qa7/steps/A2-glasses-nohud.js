// The six magic-glasses mini-games: go to each site (test goto), screenshot composite + R + G, then hide the
// WeakOnly layer and re-render the same frozen frame: count changed pixels per channel (strong channel must be 0).
const { PNG } = await import('pngjs');
const { writeFileSync, mkdirSync } = await import('node:fs');
mkdirSync('test-results/qa7/drv/gl2', { recursive: true });
const eye = await page.evaluate(() => JSON.stringify(window.__rg.ctx.settings.get?.() ?? {}));
log('eye settings', eye.slice(0, 200));
log('mode after R', (await H.s()).mode, await page.evaluate(() => window.__rgFoam.phase()));
const sites = await page.evaluate(() => window.__rgGlasses.sites().map((s) => s.id));
log('sites', sites);
await page.addStyleTag({ content: 'body > *:not(canvas) { visibility: hidden !important; } canvas { visibility: visible !important; }' }).catch(() => {});
const grab = async () => PNG.sync.read(await page.screenshot());
const chan = (img, c, name) => {
  const o = new PNG({ width: img.width, height: img.height });
  for (let i = 0; i < img.data.length; i += 4) { const v = img.data[i + c]; o.data[i] = o.data[i + 1] = o.data[i + 2] = v; o.data[i + 3] = 255; }
  writeFileSync(name, PNG.sync.write(o));
};
const res = [];
for (const id of sites) {
  await page.evaluate((id) => { const g = window.__rgGlasses.goto(id); window.__rg.teleport(g.x, g.y, g.z, g.yaw); }, id);
  await st(90);
  const here = (await H.s()).p;
  const dbg = await page.evaluate((id) => { try { return JSON.stringify(window.__rgGlasses.debug(id)).slice(0, 300); } catch (e) { return String(e); } }, id);
  const a = await grab();
  writeFileSync(`test-results/qa7/drv/gl2/${id}.png`, PNG.sync.write(a));
  chan(a, 0, `test-results/qa7/drv/gl2/${id}.R.png`);
  chan(a, 1, `test-results/qa7/drv/gl2/${id}.G.png`);
  await page.evaluate(() => { window.__rg.setLayerVisible(1, false); window.__rg.render(); });
  const b = await grab();
  await page.evaluate(() => { window.__rg.setLayerVisible(1, true); window.__rg.render(); });
  const d = [0, 0, 0];
  for (let i = 0; i < a.data.length; i += 4) for (let c = 0; c < 3; c++) if (Math.abs(a.data[i + c] - b.data[i + c]) > 2) d[c]++;
  res.push({ id, here, changedPx_RGB: d, dbg });
  const o = new PNG({ width: a.width, height: a.height });
  for (let i = 0; i < a.data.length; i += 4) { for (let c = 0; c < 3; c++) o.data[i + c] = Math.abs(a.data[i + c] - b.data[i + c]) > 2 ? 255 : 0; o.data[i + 3] = 255; }
  writeFileSync(`test-results/qa7/drv/gl2/${id}.diff.png`, PNG.sync.write(o));
}
for (const r of res) log(JSON.stringify(r));
log('VisionLayer enum check', await page.evaluate(() => JSON.stringify(window.__rg.layerObjects().slice(0, 3))));
