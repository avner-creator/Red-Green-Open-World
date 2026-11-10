// Saves full, R-only and G-only screenshots of several views to test-results/channels/.
// Shows the game as a player sees it: the title screen, then each anchor during play (HUD on).
// Usage: npm run build && npm run shots:channels [-- anchorName ...]
// The preview server runs in this process (vite's preview API) so it always stops with the script.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import { preview } from 'vite';

const port = Number(process.env.RG_PORT ?? 4174);
const out = 'test-results/channels';
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
  await page.goto(`http://localhost:${port}/?test=1`);
  await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 120000 });
  await page.waitForSelector('#boot', { state: 'detached', timeout: 10000 });

  const save = async (name) => {
    // CSS animations finished/stopped so the shot is stable; nothing is hidden.
    const buf = await page.screenshot({ type: 'png', animations: 'disabled' });
    const png = PNG.sync.read(buf);
    writeFileSync(`${out}/${name}-full.png`, buf);
    writeFileSync(`${out}/${name}-R.png`, splitChannel(png, 0));
    writeFileSync(`${out}/${name}-G.png`, splitChannel(png, 1));
    console.log(`saved ${out}/${name}-{full,R,G}.png`);
  };

  await page.evaluate(() => {
    window.__rg.freeze(true);
    window.__rg.step(1 / 60, 2);
  });
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
      if (p.name === 'spawn') {
        rg.ctx.player.respawn();
      } else {
        // Stand a little in front of the anchor, looking at it.
        rg.teleport(p.x + Math.sin(p.yaw) * 14, p.y + 0.2, p.z + Math.cos(p.yaw) * 14, p.yaw + Math.PI);
      }
      rg.step(1 / 60, 44, false);
      rg.step(1 / 60, 1);
    }, a);
    await save(a.name);
  }
  // Always: a view of the nearest Glow Gems (weak-eye only: visible in the weak channel only).
  await page.evaluate(() => {
    const rg = window.__rg;
    const spots = rg.ctx.world.gemSpots;
    if (!spots.length) return;
    const g = spots[0].position;
    const h = rg.ctx.world.heightAt(g.x, g.z + 7);
    rg.teleport(g.x, h + 0.2, g.z + 7, Math.PI);
    rg.step(1 / 60, 44, false);
    rg.step(1 / 60, 1);
  });
  await save('gems');
  if (errors.length) console.error('page errors:', errors);
} finally {
  await browser?.close();
  await server.close();
}
