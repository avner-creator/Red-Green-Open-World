// Before/after check for the distance LOD: each attraction from close, 60 m and 120 m, with the far
// LOD on and off (`?nofarlod`). Saves test-results/perf/<quality>-<on|off>/<anchor>-<dist>.png.
// Usage: npm run build && RG_PORT=4342 node scripts/shots-perf.mjs [medium|low]
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const port = Number(process.env.RG_PORT ?? 4174);
const quality = process.argv[2] ?? 'medium';
const SITES = ['carnivalRow', 'iceCream', 'bubbleArena', 'dinoRing', 'raceStart', 'foamCourse', 'airstrip', 'sillyZone', 'trampoline', 'launchPads'];
const DISTS = ['near', 60, 120];

const server = await preview({ preview: { port, strictPort: true, open: false }, logLevel: 'warn' });
let browser;
try {
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
  for (const mode of ['on', 'off']) {
    const out = `test-results/perf/${quality}-${mode}`;
    mkdirSync(out, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
    await page.goto(`http://localhost:${port}/?test=1&quality=${quality}${mode === 'off' ? '&nofarlod' : ''}`);
    await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 180000 });
    await page.evaluate(() => {
      window.__rg.freeze(true);
      window.__rg.start();
      window.__rg.step(1 / 60, 10, false);
    });
    for (const name of SITES) {
      for (const dist of DISTS) {
        await page.evaluate(
          ([name, dist]) => {
            const rg = window.__rg;
            const a = rg.ctx.world.anchors[name];
            const s = rg.ctx.world.anchors.spawn.position;
            const dx = s.x - a.position.x;
            const dz = s.z - a.position.z;
            const l = Math.hypot(dx, dz) || 1;
            const d = dist === 'near' ? Math.max(10, Math.min(30, a.radius * 1.6)) : dist;
            const x = a.position.x + (dx / l) * d;
            const z = a.position.z + (dz / l) * d;
            rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.2, z, Math.atan2(a.position.x - x, a.position.z - z));
            rg.ctx.cameraRig.setOverride({ distance: 7, height: 4 });
            rg.step(1 / 60, 30, false);
            rg.step(1 / 60, 1);
            rg.ctx.cameraRig.setOverride(null);
          },
          [name, dist],
        );
        await page.screenshot({ path: `${out}/${name}-${dist}.png` });
      }
    }
    await page.close();
  }
} finally {
  await browser?.close();
  await Promise.race([new Promise((r) => server.httpServer.close(r)), new Promise((r) => setTimeout(r, 2000))]);
}
process.exit(0);
