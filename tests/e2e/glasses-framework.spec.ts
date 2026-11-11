/**
 * Glasses-play framework: the six sites in the real world, their pictogram boards (readable in
 * R-only and G-only), far-idle, draw budgets, and the proof helpers the mechanics will use
 * (demonstrated on throwaway layer test objects).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot, canvasShot } from './helpers';
import { channelOnly, channelSpread, expectAnswerBlindWithoutWeakEye, expectDrawBudget, expectLayerOnlyTouchesOwnChannel } from './glasses-helpers';
import { ROADS } from '../../src/world/layout';
import type { GlassesSiteInfo } from '../../src/activities/glasses';
import { FIXED_SITES } from '../../src/activities/glasses/sites';

test.describe.configure({ mode: 'serial' });

const OUT = 'test-results/glasses';
let page: Page;
let consoleErrors: string[] = [];
let sites: GlassesSiteInfo[] = [];

function segDist(px: number, pz: number, a: readonly number[], b: readonly number[]): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2)) : 0;
  return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  ({ consoleErrors } = await boot(page));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 5, false);
  });
  sites = await page.evaluate(() => window.__rgGlasses!.sites());
  mkdirSync(OUT, { recursive: true });
});

test.afterAll(async () => {
  await page.close();
});

test('the sites are the fixed table: on land, nothing standing on them, off anchors and roads', async () => {
  expect(sites.map((s) => s.id)).toEqual(FIXED_SITES.map((f) => f.id));
  for (const f of FIXED_SITES) {
    const s = sites.find((x) => x.id === f.id)!;
    expect([s.x, s.z, s.yaw], f.id).toEqual([f.x, f.z, f.yaw]);
  }
  const world = await page.evaluate(() => {
    const w = window.__rg!.ctx.world;
    const anchors = Object.entries(w.anchors).map(([name, a]) => ({
      name,
      x: a.position.x,
      z: a.position.z,
      r: a.radius,
      t: a.target ? { x: a.target.x, z: a.target.z, r: a.targetRadius ?? 0 } : null,
    }));
    const g = window.__rgGlasses!;
    const rows = g.sites().map((s) => ({ id: s.id, land: w.isLand(s.x, s.z) && s.y > w.waterLevel + 1 }));
    return { anchors, rows };
  });
  console.log(sites.map((s) => `${s.id} (${s.x}, ${s.y.toFixed(1)}, ${s.z}) yaw ${s.yaw} near ${s.near}`).join('\n'));
  for (const r of world.rows) expect(r.land, `${r.id} on land`).toBe(true);
  // `valid` = the startup probe found no collider, trunk or building on the site (before its own
  // props); `problem` says what blocks it. Re-site it with `__rgGlasses.search` (see sites.ts).
  const blocked = sites.filter((s) => !s.valid).map((s) => `${s.id} at (${s.x}, ${s.z}): ${s.problem ?? '?'}`);
  expect(blocked, `fixed glasses sites blocked by the world:\n${blocked.join('\n')}`).toEqual([]);
  for (const s of sites) {
    for (const a of world.anchors) {
      expect(Math.hypot(s.x - a.x, s.z - a.z), `${s.id} vs anchor ${a.name}`).toBeGreaterThanOrEqual(a.r + s.radius);
      if (a.t) expect(Math.hypot(s.x - a.t.x, s.z - a.t.z), `${s.id} vs ${a.name} target`).toBeGreaterThanOrEqual(a.t.r + s.radius);
    }
    for (const r of ROADS)
      for (let i = 1; i < r.points.length; i++) expect(segDist(s.x, s.z, r.points[i - 1], r.points[i]) - r.width / 2, `${s.id} vs road ${r.id}`).toBeGreaterThan(s.radius);
  }
});

test('far mechanics are idle; one becomes active on approach', async () => {
  // The two sites farthest apart: each is beyond the other's deactivate radius.
  let pair: [GlassesSiteInfo, GlassesSiteInfo] = [sites[0], sites[1]];
  for (const a of sites) for (const b of sites) if (Math.hypot(a.x - b.x, a.z - b.z) > Math.hypot(pair[0].x - pair[1].x, pair[0].z - pair[1].z)) pair = [a, b];
  const [near, far] = pair;
  expect(Math.hypot(near.x - far.x, near.z - far.z)).toBeGreaterThan(90);
  await page.evaluate((id) => {
    window.__rgGlasses!.goto(id);
    window.__rg!.step(1 / 60, 2, false);
  }, near.id);
  expect(await page.evaluate((id) => window.__rgGlasses!.active(id), near.id)).toBe(true);
  expect(await page.evaluate((id) => window.__rgGlasses!.active(id), far.id)).toBe(false);
  await page.evaluate((id) => {
    window.__rgGlasses!.goto(id);
    window.__rg!.step(1 / 60, 2, false);
  }, far.id);
  expect(await page.evaluate((id) => window.__rgGlasses!.active(id), far.id)).toBe(true);
  expect(await page.evaluate((id) => window.__rgGlasses!.active(id), near.id)).toBe(false);
});

test('each mechanic stays within the draw budget', async () => {
  for (const s of sites) expect(await expectDrawBudget(page, s.id, 6)).toBeGreaterThanOrEqual(1);
});

test('every site draws its board or booth in ONE draw call', async () => {
  for (const s of sites) expect(await page.evaluate((id) => window.__rgGlasses!.signDraws(id), s.id), `${s.id} sign draws`).toBe(1);
  expect(await page.evaluate(() => window.__rgGlasses!.isBooth('gates'))).toBe(true);
});

/**
 * Draw calls of the six mini-games (boards, booths and everything they track) in the perf report's
 * spawn and Gear Shack views (low quality as in the e2e run). Pinned at what they cost before the
 * booth kit (measured on agent/glasses-depth with the same count: 7 and 7): a booth must not
 * add a draw call there (odd one out is only 37 m from spawn). 6 and 6 since line-up and glow-flies
 * moved to the kit (fewer separate meshes: line-up's aim pad is now part of its booth's one mesh).
 */
const PINNED_GLASSES_DRAWS = { spawn: 6, shack: 6 };

test('no extra glasses draws at spawn and at the Gear Shack', async () => {
  const counts = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const r = ctx.renderer;
    const A = ctx.world.anchors;
    const mine = new Set<unknown>();
    for (const o of window.__rgGlasses!.objects()) o.traverse((c) => mine.add(c));
    const go = {
      spawn: () => rg.teleport(A.spawn.position.x, ctx.world.heightAt(A.spawn.position.x, A.spawn.position.z) + 0.2, A.spawn.position.z, A.spawn.yaw),
      shack: () => {
        const a = A.gearShack;
        const dx = A.spawn.position.x - a.position.x;
        const dz = A.spawn.position.z - a.position.z;
        const l = Math.hypot(dx, dz) || 1;
        const x = a.position.x + (dx / l) * 10;
        const z = a.position.z + (dz / l) * 10;
        rg.teleport(x, ctx.world.heightAt(x, z) + 0.2, z, Math.atan2(a.position.x - x, a.position.z - z));
      },
    };
    const out: Record<string, number> = {};
    const orig = r.renderBufferDirect;
    for (const [view, fn] of Object.entries(go)) {
      fn();
      rg.step(1 / 60, 90, false);
      rg.render();
      let n = 0;
      r.renderBufferDirect = function (...args: Parameters<typeof orig>) {
        if (mine.has(args[4])) n++;
        return orig.apply(this, args);
      };
      rg.render();
      r.renderBufferDirect = orig;
      out[view] = n;
    }
    return out;
  });
  console.log(`glasses mini-game draws: spawn ${counts.spawn}, Gear Shack ${counts.shack}`);
  expect(counts).toEqual(PINNED_GLASSES_DRAWS);
});

test('every board is visible from goto() and reads in R-only and G-only', async () => {
  // Screenshots judge the look: medium quality (shadows, AO) for these frames only.
  await page.evaluate(() => window.__rg!.ctx.settings.set({ quality: 'medium' }));
  for (const s of sites) {
    await page.evaluate((id) => {
      window.__rgGlasses!.goto(id);
      window.__rg!.step(1 / 60, 3, false);
      window.__rg!.step(1 / 60, 1);
    }, s.id);
    const rect = await page.evaluate((id) => window.__rgGlasses!.boardRect(id), s.id);
    expect(rect, `${s.id} board in front of the camera`).not.toBeNull();
    const img = await canvasShot(page, `${OUT}/${s.id}-full.png`);
    writeFileSync(`${OUT}/${s.id}-R.png`, PNG.sync.write(channelOnly(img, 0)));
    writeFileSync(`${OUT}/${s.id}-G.png`, PNG.sync.write(channelOnly(img, 1)));
    const r = rect!;
    const w = r.x1 - r.x0;
    const h = r.y1 - r.y0;
    expect(w * h, `${s.id} board on screen`).toBeGreaterThan(600);
    expect(r.x1 - r.x0).toBeGreaterThan(20);
    const spreadR = channelSpread(img, r, 0);
    const spreadG = channelSpread(img, r, 1);
    expect(spreadR, `${s.id} R contrast`).toBeGreaterThan(90);
    expect(spreadG, `${s.id} G contrast`).toBeGreaterThan(90);
  }
  await page.evaluate(() => window.__rg!.ctx.settings.set({ quality: 'low' }));
});

test('proof helpers: channel isolation, answer blindness, on throwaway layer objects', async () => {
  await page.evaluate(() => {
    const rg = window.__rg!;
    window.__rgGlasses!.goto('glowflies');
    rg.step(1 / 60, 3, false);
    rg.step(1 / 60, 1);
    const v = window.__rgVision!;
    v.addTestObject({ layer: 'weak', distance: 6, size: 0.8, offsetX: -1.2, offsetY: 0.6 });
    v.addTestObject({ layer: 'strong', distance: 6, size: 0.8, offsetX: 1.2, offsetY: 0.6 });
  });
  await expectLayerOnlyTouchesOwnChannel(page, { layer: 'both', label: 'test object' });

  // Two "answers": the weak-eye object on the left vs on the right, everything else equal.
  const place = (x: number) => async (): Promise<void> => {
    await page.evaluate((offsetX) => {
      const v = window.__rgVision!;
      v.removeTestObjects();
      v.addTestObject({ layer: 'weak', distance: 6, size: 0.8, offsetX, offsetY: 0.6 });
      v.addTestObject({ layer: 'strong', distance: 6, size: 0.8, offsetX: 0, offsetY: -0.6 });
    }, x);
  };
  await expectAnswerBlindWithoutWeakEye(page, { setA: place(-1.5), setB: place(1.5), label: 'test answer' });
  await page.evaluate(() => window.__rgVision!.removeTestObjects());
});

test('the weave boots with its six parts, all idle (zero draws) away from their attractions', async () => {
  const w = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const world = ctx.world;
    const weave = window.__rgGlasses!.weave!;
    // Stand on land far from every attraction anchor (Gear Shack, trampoline, race, balloon…) and
    // from every spot of the `fakes` part; skill ready, no combo, not riding.
    const fakeSpots = ((weave.debug('fakes').spots ?? []) as { x: number; z: number }[]).map((s) => ({ x: s.x, z: s.z, r: 35 }));
    const keepClear = [...Object.values(world.anchors).map((a) => ({ x: a.position.x, z: a.position.z, r: a.radius + 40 })), ...fakeSpots];
    let spot: { x: number; z: number } | null = null;
    for (let ring = 20; ring <= 200 && !spot; ring += 10) {
      for (let k = 0; k < 36 && !spot; k++) {
        const a = (k / 36) * Math.PI * 2;
        const x = Math.sin(a) * ring;
        const z = Math.cos(a) * ring;
        if (!world.isLand(x, z) || world.heightAt(x, z) < world.waterLevel + 1) continue;
        if (keepClear.some((c) => Math.hypot(x - c.x, z - c.z) < c.r)) continue;
        spot = { x, z };
      }
    }
    if (spot) rg.teleport(spot.x, world.heightAt(spot.x, spot.z) + 0.1, spot.z);
    rg.step(1 / 60, 240, false); // land, let any combo / skill hold run out
    rg.step(1 / 60, 2, false);
    return {
      spot,
      mode: ctx.player.mode,
      ready: ctx.player.skill.ready,
      combo: ctx.economy.combo.multiplier,
      parts: weave.ids().map((id) => ({ id, draws: weave.draws(id), debug: weave.debug(id) })),
    };
  });
  expect(w.spot, 'a free spot').not.toBeNull();
  expect(w).toMatchObject({ mode: 'walk', ready: true, combo: 1 });
  expect(w.parts.map((p) => p.id)).toEqual(['bounce', 'chute', 'hero', 'boost', 'fakes', 'shack']);
  for (const p of w.parts) {
    expect(p.draws, `${p.id} draws`).toBe(0);
    expect(p.debug, `${p.id} debug`).toBeTruthy();
  }
});

test('no errors', async () => {
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
