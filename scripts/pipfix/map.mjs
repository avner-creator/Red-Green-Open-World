// Probe: ASCII collider map around a point (knee/chest-height shape test). Not part of verify.
// Usage: RG_PORT=4393 node scripts/pipfix/map.mjs x0 z0 x1 z1 [step]
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const [x0, z0, x1, z1, st = 1] = process.argv.slice(2).map(Number);
const port = Number(process.env.RG_PORT ?? 4393);
const server = await preview({ preview: { port, strictPort: true, open: false }, logLevel: 'warn' });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const page = await (await browser.newContext({ viewport: { width: 640, height: 360 } })).newPage();
await page.goto(`http://localhost:${port}/?test=1&quality=low&freeze=1`);
await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 240000 });
await page.evaluate(() => {
  window.__rg.freeze(true);
  window.__rg.start();
  window.__rg.step(1 / 30, 3, false);
});
const out = await page.evaluate(
  ([x0, z0, x1, z1, st, ups]) => {
    const ctx = window.__rg.ctx;
    const R = ctx.physics.rapier;
    const shape = new R.Ball(0.3);
    const rows = [];
    const marks = [];
    for (const [k, a] of Object.entries(ctx.world.anchors)) if (a && a.position) marks.push([k, a.position.x, a.position.z]);
    for (let z = z0; z <= z1; z += st) {
      let row = '';
      for (let x = x0; x <= x1; x += st) {
        const m = marks.find((m) => Math.abs(m[1] - x) < st / 2 && Math.abs(m[2] - z) < st / 2);
        if (m) {
          row += 'A';
          continue;
        }
        if (!ctx.world.isLand(x, z)) {
          row += '~';
          continue;
        }
        const gy = ctx.world.heightAt(x, z);
        let hit = false;
        for (const up of ups) {
          const h = ctx.physics.world.intersectionWithShape({ x, y: gy + up, z }, { x: 0, y: 0, z: 0, w: 1 }, shape, undefined, undefined, undefined, undefined, (c) => {
            if (c.isSensor() || c.shapeType() === R.ShapeType.HeightField) return false;
            const b = c.parent();
            return !b || b.isFixed();
          });
          if (h) hit = true;
        }
        row += hit ? '#' : '.';
      }
      rows.push(`${String(z).padStart(5)} ${row}`);
    }
    return { rows, marks: marks.filter((m) => m[1] >= x0 && m[1] <= x1 && m[2] >= z0 && m[2] <= z1) };
  },
  [x0, z0, x1, z1, st, (process.env.UPS ?? "0.45,1.0").split(",").map(Number)],
);
console.log(`x from ${x0} to ${x1} step ${st}`);
console.log(out.rows.join('\n'));
console.log(JSON.stringify(out.marks));
await browser.close();
await new Promise((r) => server.httpServer.close(r));
