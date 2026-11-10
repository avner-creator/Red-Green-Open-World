// Render-cost report: draw calls and triangles per quality level and view, split into the main
// pass (everything except the shadow map, incl. post/compositor passes) and the shadow pass, and
// attributed to the hero objects by hiding them one group at a time.
// Usage: npm run build && RG_PORT=4271 node scripts/perf-report.mjs [low,medium,high] [--detail]
//   --detail also lists the costliest top-level scene objects and the hero meshes' triangle counts.
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const port = Number(process.env.RG_PORT ?? 4174);
const args = process.argv.slice(2);
const detail = args.includes('--detail');
const qualities = (args.find((a) => !a.startsWith('--')) ?? 'low,medium,high').split(',');

/** Groups of top-level scene objects (by name) whose cost is reported separately. */
const GROUPS = {
  buggy: ['buggy', 'buggy-blob', 'buggy-dust'],
  balloon: ['balloon', 'balloonPad', 'canopy', 'landingRings'],
  player: ['player', 'skill-sparkles', 'skill-shockwave', 'skill-speedlines'],
  thrills: ['trampoline', 'bouncePads', 'rocketPads'],
  horse: ['horse'],
  bungee: ['bungee-platform', 'bungee-landing', 'bungee-cord'],
  silly: ['silly-zone'],
  secrets: ['secret-pedestal', 'secret-vault'],
  shack: ['gearShack'],
};

const server = await preview({ preview: { port, strictPort: true, open: false }, logLevel: 'warn' });
let browser;
try {
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
  const rows = [];
  for (const quality of qualities) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://localhost:${port}/?test=1&quality=${quality}`);
    await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 180000 });
    const result = await page.evaluate(
      ([groups, wantDetail]) => {
        const rg = window.__rg;
        const ctx = rg.ctx;
        const r = ctx.renderer;
        rg.freeze(true);
        rg.start();
        rg.step(1 / 60, 5, false);
        rg.step(1 / 30, 360, false); // let the wordless tutorial finish
        r.info.autoReset = false;
        const sm = r.shadowMap;
        const origRender = sm.render;
        const shadow = { calls: 0, tris: 0 };
        sm.render = function (...a) {
          const c0 = r.info.render.calls;
          const t0 = r.info.render.triangles;
          origRender.apply(this, a);
          shadow.calls += r.info.render.calls - c0;
          shadow.tris += r.info.render.triangles - t0;
        };
        const measure = () => {
          shadow.calls = 0;
          shadow.tris = 0;
          r.info.reset();
          rg.render();
          const calls = r.info.render.calls;
          const tris = r.info.render.triangles;
          return { main: calls - shadow.calls, mainTris: tris - shadow.tris, shadow: shadow.calls, shadowTris: shadow.tris };
        };
        const byName = (names) => ctx.scene.children.filter((o) => names.includes(o.name));
        const cost = (objs) => {
          const vis = objs.map((o) => o.visible);
          const all = measure();
          objs.forEach((o) => (o.visible = false));
          const without = measure();
          objs.forEach((o, i) => (o.visible = vis[i]));
          return {
            main: all.main - without.main,
            mainTris: all.mainTris - without.mainTris,
            shadow: all.shadow - without.shadow,
            shadowTris: all.shadowTris - without.shadowTris,
          };
        };
        const A = ctx.world.anchors;
        const standBack = (a, dist, height = 0.2) => {
          const x = a.position.x + Math.sin(a.yaw) * dist;
          const z = a.position.z + Math.cos(a.yaw) * dist;
          rg.teleport(x, ctx.world.heightAt(x, z) + height, z, a.yaw + Math.PI);
        };
        const lookAt = (a, from, dist) => {
          // Stand `dist` metres from `a` on the side of `from` (an anchor or point), facing `a`.
          const dx = from.x - a.position.x;
          const dz = from.z - a.position.z;
          const l = Math.hypot(dx, dz) || 1;
          const x = a.position.x + (dx / l) * dist;
          const z = a.position.z + (dz / l) * dist;
          rg.teleport(x, ctx.world.heightAt(x, z) + 0.2, z, Math.atan2(a.position.x - x, a.position.z - z));
        };
        const buggyRoot = ctx.scene.getObjectByName('buggy');
        const views = {
          spawn: () => rg.teleport(A.spawn.position.x, ctx.world.heightAt(A.spawn.position.x, A.spawn.position.z) + 0.2, A.spawn.position.z, A.spawn.yaw),
          park: () => lookAt(A.trampoline, A.bouncePads.position, 16),
          // The buggy from 8 m on the spawn side (it parks at the garage).
          garage: () => (buggyRoot ? lookAt({ position: buggyRoot.position }, A.spawn.position, 8) : standBack(A.garage, 10)),
          balloon: () => standBack(A.balloon, 26),
          ranch: () => lookAt(A.ranch, A.spawn.position, 14),
          bungee: () => lookAt(A.bungee, A.bungeeLanding.position, 18),
          silly: () => lookAt(A.sillyZone, A.spawn.position, 16),
          vault: () => {
            const d = window.__rgSecrets?.info().doors[0];
            if (d) lookAt({ position: { x: d.x, z: d.z } }, { x: d.x + Math.sin(d.yaw) * 20, z: d.z + Math.cos(d.yaw) * 20 }, 12);
          },
        };
        const out = [];
        for (const [view, go] of Object.entries(views)) {
          go();
          rg.step(1 / 60, 90, false);
          rg.render(); // compile anything new before measuring
          const total = measure();
          const parts = {};
          let sum = { main: 0, mainTris: 0, shadow: 0, shadowTris: 0 };
          for (const [g, names] of Object.entries(groups)) {
            parts[g] = cost(byName(names));
            for (const k of Object.keys(sum)) sum[k] += parts[g][k];
          }
          parts.world = {};
          for (const k of Object.keys(sum)) parts.world[k] = total[k] - sum[k];
          const row = { view, total, parts };
          if (wantDetail) {
            row.top = ctx.scene.children
              .filter((o) => o.visible)
              .map((o) => ({ name: o.name || o.type, ...cost([o]) }))
              .sort((a, b) => b.main + b.shadow - (a.main + a.shadow))
              .slice(0, 12);
          }
          out.push(row);
        }
        const meshes = [];
        if (wantDetail) {
          for (const n of ['buggy', 'balloon', 'balloonPad', 'player', 'trampoline', 'bouncePads', 'rocketPads', 'landingRings']) {
            const root = ctx.scene.getObjectByName(n);
            if (!root) continue;
            root.traverse((o) => {
              if (!o.isMesh && !o.isLine && !o.isPoints) return;
              const g = o.geometry;
              const tris = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
              const inst = o.isInstancedMesh ? o.count : 1;
              meshes.push({ root: n, name: o.name || o.type, tris: Math.round(tris * inst), cast: o.castShadow, mat: Array.isArray(o.material) ? o.material.length : o.material.type });
            });
          }
        }
        sm.render = origRender;
        r.info.autoReset = true;
        return { out, meshes };
      },
      [GROUPS, detail],
    );
    if (errors.length) console.log(`[${quality}] page errors:`, errors.slice(0, 3));
    for (const row of result.out) rows.push({ quality, ...row });
    if (detail) {
      for (const row of result.out) {
        console.log(`\n[${quality} / ${row.view}] costliest top-level objects (main draws/tris | shadow draws/tris)`);
        for (const t of row.top) console.log(`  ${t.name.padEnd(28)} ${String(t.main).padStart(4)} / ${String(t.mainTris).padStart(7)} | ${String(t.shadow).padStart(4)} / ${String(t.shadowTris).padStart(7)}`);
      }
      if (quality === qualities[0]) {
        console.log('\nHero meshes (static triangles, castShadow, material):');
        for (const m of result.meshes) console.log(`  ${m.root.padEnd(12)} ${m.name.padEnd(26)} ${String(m.tris).padStart(7)} ${m.cast ? 'cast' : '    '} ${m.mat}`);
      }
    }
    await page.close();
  }

  const k = (n) => (n >= 10000 ? `${Math.round(n / 1000)}k` : String(n));
  const cell = (c) => `${String(c.main).padStart(3)}/${k(c.mainTris).padStart(5)} ${String(c.shadow).padStart(3)}/${k(c.shadowTris).padStart(5)}`;
  const cols = ['total', ...Object.keys(GROUPS), 'world'];
  console.log('\nDraws/triangles per frame: main pass | shadow pass (attributed by hiding each group)');
  console.log(`${'quality'.padEnd(7)} ${'view'.padEnd(8)} ${cols.map((c) => c.padEnd(21)).join(' ')}`);
  for (const r of rows) {
    const cells = cols.map((c) => cell(c === 'total' ? r.total : r.parts[c]).padEnd(21));
    console.log(`${r.quality.padEnd(7)} ${r.view.padEnd(8)} ${cells.join(' ')}`);
  }
} finally {
  await browser?.close();
  await server.close();
}
