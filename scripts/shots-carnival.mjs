// Saves full, R-only and G-only screenshots of the carnival games row to test-results/carnival-games/:
// the row from the entrance, then each playable booth during a round (autopilot) and its result.
// Usage: npm run build && node scripts/shots-carnival.mjs [gameId ...]
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import { preview } from 'vite';

const port = Number(process.env.RG_PORT ?? 4176);
const out = 'test-results/carnival-games';
const wanted = process.argv.slice(2);
mkdirSync(out, { recursive: true });

function splitChannel(png, c) {
  const o = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    const v = png.data[i + c];
    o.data[i] = o.data[i + 1] = o.data[i + 2] = v;
    o.data[i + 3] = 255;
  }
  return PNG.sync.write(o);
}

const server = await preview({ preview: { port, strictPort: true, open: false }, logLevel: 'warn' });
let browser;
try {
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://localhost:${port}/?test=1&quality=medium`);
  await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 120000 });
  await page.waitForSelector('#boot', { state: 'detached', timeout: 10000 });

  const save = async (name) => {
    const buf = await page.screenshot({ type: 'png', animations: 'disabled' });
    const png = PNG.sync.read(buf);
    writeFileSync(`${out}/${name}-full.png`, buf);
    writeFileSync(`${out}/${name}-R.png`, splitChannel(png, 0));
    writeFileSync(`${out}/${name}-G.png`, splitChannel(png, 1));
    console.log(`saved ${out}/${name}-{full,R,G}.png`);
  };
  const step = (n, render = true) => page.evaluate(([n, render]) => window.__rg.step(1 / 30, n, render), [n, render]);

  await page.evaluate(() => {
    const rg = window.__rg;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 10, false);
  });
  const info = await page.evaluate(() => window.__rgCarnival.info());
  // Budget check: draws and triangles of the idle row (main scene + weak layer), not counting friends.
  const perf = await page.evaluate(() => {
    const ctx = window.__rg.ctx;
    let draws = 0;
    let tris = 0;
    const per = [];
    const count = (root) =>
      root.traverseVisible((o) => {
        if (!o.isMesh || o.name.startsWith('carnival-friend') || o.layers.mask !== 1) return;
        const g = o.geometry;
        const n = (g.index ? g.index.count : g.attributes.position.count) / 3;
        const inst = o.isInstancedMesh ? o.count : 1;
        if (inst === 0) return;
        draws++;
        tris += n * inst;
        per.push(`${o.name}:${Math.round(n * inst)}`);
      });
    const row = ctx.scene.getObjectByName('carnival-row');
    if (row) count(row);
    ctx.scene.traverse((o) => o.name.startsWith('carnival-') && o.name.endsWith('-weak') && count(o));
    return { draws, tris: Math.round(tris), per };
  });
  console.log('idle carnival row (visible):', JSON.stringify(perf));
  if (!wanted.length || wanted.includes('row')) {
    // From the plaza end of the midway, looking down the row.
    const [ex, , ez] = await page.evaluate(() => window.__rgCarnival.boothPoint('balloonPop', 5.5, 0, 2.6));
    const [tx, , tz] = await page.evaluate(() => window.__rgCarnival.boothPoint('strengthBell', 0, 0, 0.5));
    await page.evaluate(([x, z, yaw]) => window.__rg.teleport(x, 18.2, z, yaw), [ex, ez, Math.atan2(tx - ex, tz - ez)]);
    await step(60);
    await save('row');
  }
  for (const b of info.booths) {
    if (!b.playable || (wanted.length && !wanted.includes(b.id))) continue;
    await page.evaluate((id) => {
      window.__rgCarnival.autopilot(true);
      window.__rgCarnival.start(id);
    }, b.id);
    await step(75, false); // countdown + 0.5 s
    await step(1);
    await save(`${b.id}-go`);
    await step(300, false);
    await step(1);
    await save(`${b.id}-play`);
    for (let i = 0; i < 40 && (await page.evaluate(() => window.__rgCarnival.info().phase)) !== 'result'; i++) await step(60, false);
    await step(45);
    await save(`${b.id}-result`);
    console.log(b.id, JSON.stringify(await page.evaluate(() => window.__rgCarnival.info().result)), JSON.stringify(await page.evaluate(() => window.__rgCarnival.info().scores)));
    await page.evaluate(() => window.__rgCarnival.exit());
    await step(10, false);
  }
  if (errors.length) console.log('errors:', errors.join('\n'));
} finally {
  await browser?.close();
  await server.close();
}
