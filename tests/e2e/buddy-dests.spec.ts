/**
 * QA round 6 M3 (phone, 750×342 touch): a child walking straight to Pip's lead point stuck at the
 * rocket pads' rail fence for 115 s, and the hop-frees put them back on the same side.
 *  1. Every lead destination is validated at the start of play (fits the hero, reachable with the
 *     hero-radius planner, rails included), and a child walking straight along the LAST leg of
 *     Pip's planned way (from 25 m out) reaches the place.
 *  2. The QA repro: from the bounce pads, a child who walks straight at the rocket-pad lead point
 *     (not after Pip) is freed onto the path side of the fence and gets there.
 * Pip only ever leads to these places (attraction anchors: both-eye places).
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { boot, startGame } from './helpers';

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 750, height: 342 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

let page: Page;
let consoleErrors: string[] = [];

test.beforeAll(async ({ browser }) => {
  test.setTimeout(240_000);
  page = await browser.newPage({ viewport: { width: 750, height: 342 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  ({ consoleErrors } = await boot(page));
  await startGame(page, true);
  await page.evaluate(() => {
    window.__rg!.setRemaining(3000);
    // The destination check runs half a second into play (once the sites are in the physics world).
    window.__rg!.step(1 / 30, 30, false);
  });
});

test.afterAll(async () => {
  await page.close();
});

/**
 * In the page: walk the hero straight at (tx, tz) (camera-relative stick, as a thumb on the touch
 * stick does) until `done()` or `seconds` of game time; returns the seconds it took (or -1).
 */
const WALK = `
  window.__walk = (tx, tz, seconds, done) => {
    const rg = window.__rg;
    const p = rg.ctx.player.position;
    for (let f = 0; f < seconds * 30; f++) {
      if (done()) return f / 30;
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
      const y = rg.ctx.cameraRig.yaw;
      let mx = 0, my = 0;
      if (d > 0.8) {
        const ux = dx / d, uz = dz / d;
        my = ux * Math.sin(y) + uz * Math.cos(y);
        mx = -ux * Math.cos(y) + uz * Math.sin(y);
      }
      rg.inject({ moveX: mx, moveY: my });
      rg.step(1 / 30, 1, false);
    }
    rg.inject(null);
    return done() ? seconds : -1;
  };`;

test('every lead destination is reachable; a straight walk along the last leg gets there', async () => {
  test.setTimeout(300_000);
  await page.evaluate(WALK);
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const B = window.__rgBuddy!;
    const w = (window as unknown as { __walk: (x: number, z: number, s: number, done: () => boolean) => number }).__walk;
    const out: { name: string; ok: boolean; from: number[] | null; t: number; why?: string }[] = [];
    for (const d of B.dests()) {
      // Raised decks (the bungee platform, reached by its own bridge) are not a ground walk.
      const an = (rg.ctx.world.anchors as unknown as Record<string, { position: { y: number } }>)[d.name];
      if (!rg.ctx.world.isLand(d.dest[0], d.dest[1]) || (an && an.position.y > rg.ctx.world.heightAt(d.dest[0], d.dest[1]) + 2)) continue;
      // 25 m out towards the plaza (the way most children come from), on free land.
      let from: number[] | null = null;
      for (const r0 of [25, 22, 28, 18, 32]) {
        for (let k = 0; k < 16 && !from; k++) {
          const a = Math.atan2(0 - d.dest[0], 9 - d.dest[1]) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8);
          const x = d.dest[0] + Math.sin(a) * r0;
          const z = d.dest[1] + Math.cos(a) * r0;
          if (!rg.ctx.world.isLand(x, z) || rg.ctx.world.heightAt(x, z) < 0.3) continue;
          if (B.plan(x, z, d.name)) from = [x, z];
        }
        if (from) break;
      }
      if (!from) {
        out.push({ name: d.name, ok: d.ok, from, t: -1, why: 'no approach' });
        continue;
      }
      const route = B.plan(from[0], from[1], d.name)!;
      const start = route.length > 1 ? route[route.length - 2] : from;
      // A ride the last walk started (rocket pads, bounce pads) lets go first.
      if (rg.ctx.player.mode !== 'walk') rg.ctx.player.setExternalController(null);
      rg.teleport(start[0], rg.ctx.world.heightAt(start[0], start[1]) + 0.3, start[1], Math.atan2(d.dest[0] - start[0], d.dest[1] - start[1]));
      rg.step(1 / 30, 3, false);
      const t = w(d.dest[0], d.dest[1], 20, () => B.lead().at === d.name);
      const pp = rg.ctx.player.position;
      out.push({ name: d.name, ok: d.ok, from: start, t, why: `${rg.ctx.player.mode} at ${pp.x.toFixed(1)},${pp.y.toFixed(1)},${pp.z.toFixed(1)} (${B.lead().at})` });
    }
    return out;
  });
  expect(r.length).toBeGreaterThanOrEqual(18);
  for (const d of r) {
    expect.soft(d.ok, `${d.name}: destination not reachable`).toBe(true);
    expect.soft(d.t, `${d.name}: straight walk along the last leg failed ${JSON.stringify(d)}`).toBeGreaterThanOrEqual(0);
  }
});

test('QA6 M3: walking straight at the rocket-pad lead point from the bounce pads gets there (freed on the path side)', async () => {
  test.setTimeout(300_000);
  await page.evaluate(WALK);
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const B = window.__rgBuddy!;
    const w = (window as unknown as { __walk: (x: number, z: number, s: number, done: () => boolean) => number }).__walk;
    rg.teleport(84, rg.ctx.world.heightAt(84, -8) + 0.3, -8, 0);
    rg.step(1 / 30, 10, false);
    if (!B.invite('launchPads')) return { error: 'no lead' };
    rg.step(1 / 30, 3, false);
    const dest = B.lead().dest!;
    const route = B.route();
    // The child ignores Pip and pushes straight at the lead point the whole time.
    const t = w(dest[0], dest[1], 75, () => B.lead().at === 'launchPads');
    const L = B.lead();
    return { t, dest, route, rescues: L.rescues, frees: L.frees, freedAt: L.freedAt, pos: rg.ctx.player.position.toArray() };
  });
  expect(r).not.toHaveProperty('error');
  const d = r as { t: number; dest: number[]; route: number[][] | null; rescues: number; frees: number; freedAt: number[] | null; pos: number[] };
  console.log(`M3 repro: ${JSON.stringify(d)}`);
  // Pip's own way goes round the fence through its gap (x 71–75 at z ≈ 1), not over it.
  expect(d.route, JSON.stringify(d)).not.toBeNull();
  // Before: stuck at the fence for 115 s. Now: there within a minute.
  expect(d.t, JSON.stringify(d)).toBeGreaterThanOrEqual(0);
  expect(d.t, JSON.stringify(d)).toBeLessThanOrEqual(60);
  if (d.freedAt) expect(d.freedAt[1], `freed on the far (path) side: ${JSON.stringify(d)}`).toBeGreaterThan(1.5);
  expect(consoleErrors).toEqual([]);
});
