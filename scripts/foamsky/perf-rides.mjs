// Render cost during the foam run, the plane contest and the dragon tour (main pass | shadow pass),
// measured like scripts/perf-report.mjs. Usage: npm run build && RG_PORT=4272 node scripts/foamsky/perf-rides.mjs [low,medium]
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const port = Number(process.env.RG_PORT ?? 4272);
const qualities = (process.argv[2] ?? 'low,medium').split(',');
const server = await preview({ preview: { port, strictPort: true, open: false }, logLevel: 'warn' });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
try {
  for (const quality of qualities) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    await page.goto(`http://localhost:${port}/?test=1&quality=${quality}`);
    await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 180000 });
    const rows = await page.evaluate(async () => {
      const rg = window.__rg;
      const ctx = rg.ctx;
      const r = ctx.renderer;
      rg.freeze(true);
      rg.start();
      rg.setRemaining(3600);
      rg.step(1 / 60, 5, false);
      rg.step(1 / 30, 360, false);
      r.info.autoReset = false;
      const sm = r.shadowMap;
      const orig = sm.render;
      const shadow = { calls: 0, tris: 0 };
      sm.render = function (...a) {
        const c0 = r.info.render.calls;
        const t0 = r.info.render.triangles;
        orig.apply(this, a);
        shadow.calls += r.info.render.calls - c0;
        shadow.tris += r.info.render.triangles - t0;
      };
      const measure = (name) => {
        rg.render();
        shadow.calls = shadow.tris = 0;
        r.info.reset();
        rg.render();
        return { name, main: r.info.render.calls - shadow.calls, mainTris: r.info.render.triangles - shadow.tris, shadow: shadow.calls, shadowTris: shadow.tris };
      };
      const out = [];
      // Foam: mid-run (lane A, friend in view), then the blowers.
      const f = window.__rgFoam;
      const [bx, by, bz] = f.booth();
      rg.teleport(bx, by - 1.1, bz, 0);
      rg.step(1 / 60, 10, false);
      f.start();
      f.autopilot('main');
      for (let i = 0; i < 600 && f.sim.cp < 1; i++) rg.step(1 / 60, 6, false);
      out.push(measure('foam-run-lane-A'));
      for (let i = 0; i < 900 && f.sim.cp < 3; i++) rg.step(1 / 60, 6, false);
      rg.step(1 / 60, 60, false);
      out.push(measure('foam-run-blowers'));
      {
        const names = ['foam-lava', 'foam-lava-weak', 'foam-lava-lift-bubble', 'walk-in-pad'];
        const objs = [];
        ctx.scene.traverse((o) => { if (names.includes(o.name)) objs.push(o); });
        const vis = objs.map((o) => o.visible);
        objs.forEach((o) => (o.visible = false));
        const m = measure('  without foam');
        objs.forEach((o, i) => (o.visible = vis[i]));
        out.push(m);
        const det = [];
        ctx.scene.getObjectByName('foam-lava').traverse((o) => { if (o.isMesh) det.push(`${o.name || o.type}:${Math.round((o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1))}`); });
        out.push({ name: det.join(' '), main: 0, mainTris: 0, shadow: 0, shadowTris: 0 });
      }
      rg.inject({ respawnPressed: true });
      rg.step(1 / 60, 1, false);
      rg.inject(null);
      rg.step(1 / 60, 30, false);
      // Plane: in the contest over the beach.
      const sky = window.__rgSky;
      rg.teleport(-16, ctx.world.heightAt(-16, 41) + 0.3, 41, Math.PI / 2);
      rg.step(1 / 60, 10, false);
      rg.inject({ usePressed: true });
      rg.step(1 / 60, 1, false);
      rg.inject(null);
      for (let i = 0; i < 600 && sky.plane.phase !== 'race'; i++) rg.step(1 / 30, 1, false);
      rg.step(1 / 30, 150, false);
      out.push(measure('plane-race'));
      rg.inject({ respawnPressed: true });
      rg.step(1 / 60, 1, false);
      rg.inject(null);
      rg.step(1 / 60, 30, false);
      // Dragon: in the tour over the village.
      rg.teleport(-32.6, ctx.world.heightAt(-32.6, -125.2) + 0.3, -125.2, Math.PI);
      rg.step(1 / 60, 10, false);
      rg.inject({ usePressed: true });
      rg.step(1 / 60, 1, false);
      rg.inject(null);
      for (let i = 0; i < 600 && sky.dragon.phase !== 'tour'; i++) rg.step(1 / 30, 1, false);
      rg.step(1 / 30, 240, false);
      out.push(measure('dragon-tour'));
      return out;
    });
    for (const x of rows) console.log(`${quality.padEnd(7)} ${x.name.padEnd(18)} ${String(x.main).padStart(4)}/${String(Math.round(x.mainTris / 1000)).padStart(4)}k | ${x.shadow}/${Math.round(x.shadowTris / 1000)}k`);
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
