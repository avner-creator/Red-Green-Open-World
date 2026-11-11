// Lists every vision-layer mesh drawn in a view (draws, distance from the camera, layer:object path)
// and the whole-frame draw calls, at the perf-report's spawn and shack views. Debug helper.
// Usage: npm run build && RG_PORT=4230 node scripts/layer-draws.mjs [low|medium] [shack,spawn]
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const port = Number(process.env.RG_PORT ?? 4174);
const quality = process.argv[2] ?? 'low';
const wanted = (process.argv[3] ?? 'shack,spawn').split(',');
const server = await preview({ preview: { port, strictPort: true, open: false }, logLevel: 'warn' });
let browser;
try {
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${port}/?test=1&quality=${quality}`);
  await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 180000 });
  const out = await page.evaluate((wanted) => {
    const rg = window.__rg;
    const ctx = rg.ctx;
    const r = ctx.renderer;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 5, false);
    rg.step(1 / 30, 360, false); // let the wordless tutorial finish (as perf-report does)
    const A = ctx.world.anchors;
    const lookAt = (a, from, dist) => {
      const dx = from.x - a.position.x;
      const dz = from.z - a.position.z;
      const l = Math.hypot(dx, dz) || 1;
      const x = a.position.x + (dx / l) * dist;
      const z = a.position.z + (dz / l) * dist;
      rg.teleport(x, ctx.world.heightAt(x, z) + 0.2, z, Math.atan2(a.position.x - x, a.position.z - z));
    };
    const views = {
      spawn: () => rg.teleport(A.spawn.position.x, ctx.world.heightAt(A.spawn.position.x, A.spawn.position.z) + 0.2, A.spawn.position.z, A.spawn.yaw),
      shack: () => lookAt(A.gearShack, A.spawn.position, 10),
    };
    const res = {};
    const origRBD = r.renderBufferDirect;
    for (const v of wanted) {
      views[v]();
      rg.step(1 / 60, 90, false);
      rg.render();
      const rows = new Map();
      r.info.autoReset = false;
      r.info.reset();
      r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
        let top = object;
        const path = [];
        while (top.parent) {
          path.unshift(top.name || top.type);
          top = top.parent;
          if (top.name?.startsWith('Vision.')) break;
        }
        if (top.name?.startsWith('Vision.')) {
          const V = object.position.constructor;
          const p = object.getWorldPosition(new V());
          const cam = ctx.camera.getWorldPosition(new V());
          const key = `${top.name}:${path.join('>')}`;
          const row = rows.get(key) ?? { draws: 0, dist: p.distanceTo(cam).toFixed(1), inst: object.isInstancedMesh ? object.count : '' };
          row.draws++;
          rows.set(key, row);
        }
        return origRBD.call(this, camera, scene, geometry, material, object, group);
      };
      rg.render();
      r.renderBufferDirect = origRBD;
      const total = r.info.render.calls;
      r.info.autoReset = true;
      const cam = ctx.camera.position;
      res[v] = { total, cam: [cam.x, cam.y, cam.z].map((n) => n.toFixed(1)).join(','), rows: [...rows.entries()].map(([k, x]) => ({ k, ...x })) };
    }
    return res;
  }, wanted);
  for (const [v, x] of Object.entries(out)) {
    const sum = x.rows.reduce((s, r) => s + r.draws, 0);
    console.log(`\n[${quality} / ${v}] camera (${x.cam}); frame draws incl. shadow ${x.total}; layer draws ${sum}`);
    for (const r of x.rows) console.log(`  ${String(r.draws).padStart(2)}  ${String(r.dist).padStart(6)} m  ${r.k}${r.inst !== '' ? ` (inst ${r.inst})` : ''}`);
  }
} finally {
  await browser?.close();
  await Promise.race([server.close(), new Promise((r) => setTimeout(r, 2000))]);
}
process.exit(0);
