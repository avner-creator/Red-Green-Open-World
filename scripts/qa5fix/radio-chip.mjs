// Radio chip close-up (full, R-only, G-only) for a few stations. Usage: RG_PORT=4379 node scripts/qa5fix/radio-chip.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
const port = process.env.RG_PORT ?? 4173;
const out = 'test-results/qa5fix';
mkdirSync(out, { recursive: true });
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
await p.goto(`http://localhost:${port}/?test=1&quality=low&freeze=1`);
await p.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 90000 });
await p.evaluate(() => { window.__rg.start(); window.__rg.step(1 / 60, 5); });
const tiles = [];
for (const id of ['zoom', 'spooky', 'beach', 'auto']) {
  await p.evaluate((s) => window.__rgRadio.set(s), id);
  await p.waitForTimeout(400);
  const box = await p.locator('.rgr').boundingBox();
  const buf = await p.screenshot({ clip: { x: box.x - 10, y: box.y - 10, width: box.width + 20, height: box.height + 20 } });
  tiles.push(buf);
  writeFileSync(`${out}/radio-${id}.png`, buf);
  const png = PNG.sync.read(buf);
  for (const [c, n] of [[0, 'R'], [1, 'G']]) {
    const o = new PNG({ width: png.width, height: png.height });
    for (let i = 0; i < png.data.length; i += 4) { o.data[i] = o.data[i + 1] = o.data[i + 2] = png.data[i + c]; o.data[i + 3] = 255; }
    writeFileSync(`${out}/radio-${id}-${n}.png`, PNG.sync.write(o));
  }
}
await b.close();
