// Saves full, R-only and G-only screenshots of several views to test-results/channels/.
// Usage: npm run build && npm run shots:channels [-- anchorName ...]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';

const port = Number(process.env.RG_PORT ?? 4174);
const out = 'test-results/channels';
const wanted = process.argv.slice(2);
mkdirSync(out, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
const stop = () => server.kill();
process.on('exit', stop);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`http://localhost:${port}/`)).ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('preview server did not start (run `npm run build` first)');
}

function splitChannel(png, c) {
  const o = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    const v = png.data[i + c];
    o.data[i] = o.data[i + 1] = o.data[i + 2] = v;
    o.data[i + 3] = 255;
  }
  return PNG.sync.write(o);
}

await waitForServer();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
await page.goto(`http://localhost:${port}/?test=1`);
await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 120000 });

async function save(name) {
  const buf = await page.screenshot({ type: 'png' });
  const png = PNG.sync.read(buf);
  writeFileSync(`${out}/${name}-full.png`, buf);
  writeFileSync(`${out}/${name}-R.png`, splitChannel(png, 0));
  writeFileSync(`${out}/${name}-G.png`, splitChannel(png, 1));
  console.log(`saved ${out}/${name}-{full,R,G}.png`);
}

await page.evaluate(() => window.__rg.freeze(true));
await save('title');
const anchors = await page.evaluate(() => {
  const rg = window.__rg;
  rg.start();
  rg.step(1 / 60, 20);
  return Object.entries(rg.ctx.world.anchors).map(([name, a]) => ({ name, x: a.position.x, y: a.position.y, z: a.position.z, yaw: a.yaw }));
});
for (const a of anchors) {
  if (wanted.length && !wanted.includes(a.name)) continue;
  await page.evaluate((p) => {
    const rg = window.__rg;
    // Stand a little in front of the anchor, looking at it.
    rg.teleport(p.x + Math.sin(p.yaw) * 14, p.y + 0.2, p.z + Math.cos(p.yaw) * 14, p.yaw + Math.PI);
    rg.step(1 / 60, 45);
  }, a);
  await save(a.name);
}
await browser.close();
stop();
process.exit(0);
