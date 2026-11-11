// Control for A0: two renders of the same frozen frame with nothing toggled; then toggle WeakOnly and StrongOnly.
const { PNG } = await import('pngjs');
const { writeFileSync } = await import('node:fs');
const grab = async () => PNG.sync.read(await page.screenshot());
const diff = (a, b, name) => {
  const d = [0, 0, 0];
  const o = new PNG({ width: a.width, height: a.height });
  for (let i = 0; i < a.data.length; i += 4) {
    let any = false;
    for (let c = 0; c < 3; c++) if (Math.abs(a.data[i + c] - b.data[i + c]) > 2) { d[c]++; any = true; }
    o.data[i] = any && Math.abs(a.data[i] - b.data[i]) > 2 ? 255 : 0;
    o.data[i + 1] = any && Math.abs(a.data[i + 1] - b.data[i + 1]) > 2 ? 255 : 0;
    o.data[i + 2] = any && Math.abs(a.data[i + 2] - b.data[i + 2]) > 2 ? 255 : 0;
    o.data[i + 3] = 255;
  }
  if (name) writeFileSync(name, PNG.sync.write(o));
  return d;
};
await page.evaluate(() => window.__rg.render());
const a = await grab();
await page.evaluate(() => window.__rg.render());
const a2 = await grab();
log('control (no toggle)', diff(a, a2, 'test-results/qa5/drv/gl/diff-control.png'));
await page.evaluate(() => { window.__rg.setLayerVisible(1, false); window.__rg.render(); });
const b = await grab();
log('weak hidden', diff(a, b, 'test-results/qa5/drv/gl/diff-weak.png'));
await page.evaluate(() => { window.__rg.setLayerVisible(1, true); window.__rg.render(); });
const c = await grab();
log('weak back', diff(a, c));
