// One screenshot per Carnival Island attraction, from ~1.6 x its radius on the spawn side, to check
// that each sits on its anchor with no scenery poking through. Saves test-results/sites/<anchor>.png.
// Usage: npm run build && RG_PORT=4292 node scripts/shots-sites.mjs
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const port = Number(process.env.RG_PORT ?? 4174);
const out = 'test-results/sites';
mkdirSync(out, { recursive: true });
const SITES = ['carnivalRow', 'iceCream', 'bubbleArena', 'dinoRing', 'raceStart', 'foamCourse', 'airstrip', 'dragonRoost'];

const server = await preview({ preview: { port, strictPort: true, open: false }, logLevel: 'warn' });
let browser;
try {
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${port}/?test=1&quality=medium`);
  await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 180000 });
  await page.evaluate(() => {
    window.__rg.freeze(true);
    window.__rg.start();
    window.__rg.step(1 / 60, 10, false);
  });
  for (const name of SITES) {
    const ok = await page.evaluate((name) => {
      const rg = window.__rg;
      const a = rg.ctx.world.anchors[name];
      if (!a) return false;
      const s = rg.ctx.world.anchors.spawn.position;
      const dx = s.x - a.position.x;
      const dz = s.z - a.position.z;
      const l = Math.hypot(dx, dz) || 1;
      const d = Math.max(10, Math.min(30, a.radius * 1.6));
      const x = a.position.x + (dx / l) * d;
      const z = a.position.z + (dz / l) * d;
      rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.2, z, Math.atan2(a.position.x - x, a.position.z - z));
      rg.ctx.cameraRig.setOverride({ distance: 7, height: 4 });
      rg.step(1 / 60, 90, false);
      rg.step(1 / 60, 1);
      rg.ctx.cameraRig.setOverride(null);
      return true;
    }, name);
    if (!ok) {
      console.log(`${name}: no anchor`);
      continue;
    }
    await page.screenshot({ path: `${out}/${name}.png` });
    console.log(`${name}: saved`);
  }
  if (errors.length) console.log('errors:', errors);
} finally {
  await browser?.close();
  await new Promise((r) => server.httpServer.close(r));
}
