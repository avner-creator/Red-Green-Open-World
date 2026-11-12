/**
 * Free rides never stay wedged (QA7 M1, m5): hold W for 20 s from every parked vehicle, and drive
 * the buggy and a horse nose-first into a booth: the ride is never stationary for more than 4 s,
 * and an unstick hop shows the reset hint.
 */
import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

test.describe.configure({ mode: 'serial' });

let page: Page;
let consoleErrors: string[] = [];

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  ({ consoleErrors } = await boot(page));
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 30, false);
  });
});

test.afterAll(async () => {
  await page.close();
});

interface Run {
  /** Longest time (s) the ride stayed within 1 m of one spot. */
  stillest: number;
  travelled: number;
  unsticks: number;
  hint: boolean;
  mode: string;
}

/**
 * Board vehicle `i` (E beside it; `place` = optional pose first), hold W for `seconds` in 0.25 s
 * chunks, and measure how long it ever stayed put. Leaves the ride with R afterwards.
 */
async function holdW(p: Page, i: number, seconds: number, place?: { x: number; z: number; yaw: number }): Promise<Run> {
  return p.evaluate(
    ([i, seconds, place]) => {
      const rg = window.__rg!;
      const v = rg.ctx.vehicles.all[i] as unknown as {
        position: { x: number; y: number; z: number };
        object: { quaternion: { x: number; y: number; z: number; w: number } };
        teleport(p: { x: number; y: number; z: number }, yaw: number): void;
        unsticks: number;
      };
      const internal = v;
      if (place) v.teleport({ x: place.x, y: rg.ctx.world.heightAt(place.x, place.z), z: place.z }, place.yaw);
      rg.step(1 / 60, 10, false);
      const q = v.object.quaternion;
      const h = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
      const sx = v.position.x + Math.cos(h) * 2.2;
      const sz = v.position.z - Math.sin(h) * 2.2;
      rg.teleport(sx, rg.ctx.world.heightAt(sx, sz) + 0.3, sz, h);
      rg.step(1 / 60, 20, false);
      rg.inject({ usePressed: true });
      rg.step(1 / 60, 1, false);
      rg.inject(null);
      rg.step(1 / 60, 40, false);
      const mode = rg.state().playerMode;
      const pts: [number, number][] = [];
      let hint = false;
      const n0 = internal.unsticks ?? 0;
      for (let t = 0; t < seconds; t += 0.25) {
        rg.inject({ moveY: 1 });
        rg.step(1 / 60, 15, false);
        pts.push([v.position.x, v.position.z]);
        hint ||= !!document.querySelector('[data-testid="ride-reset"].on');
      }
      rg.inject(null);
      let stillest = 0;
      let travelled = 0;
      for (let a = 0; a < pts.length; a++) {
        let b = a;
        while (b + 1 < pts.length && Math.hypot(pts[b + 1][0] - pts[a][0], pts[b + 1][1] - pts[a][1]) < 1) b++;
        stillest = Math.max(stillest, (b - a) * 0.25);
        if (a > 0) travelled += Math.hypot(pts[a][0] - pts[a - 1][0], pts[a][1] - pts[a - 1][1]);
      }
      // Let go (R) so the next run starts on foot.
      rg.inject({ respawnPressed: true });
      rg.step(1 / 60, 1, false);
      rg.inject(null);
      rg.step(1 / 60, 30, false);
      return { stillest, travelled, unsticks: internal.unsticks - n0, hint, mode };
    },
    [i, seconds, place ?? null] as const,
  );
}

test('the parked buggy faces a clear lane: W from the garage drives off', async () => {
  const r = await holdW(page, 0, 20);
  expect(r.mode).toBe('driving');
  expect(r.stillest).toBeLessThanOrEqual(4);
  expect(r.travelled).toBeGreaterThan(40);
});

test('W into the race booth: the buggy hops back, turns to open space, reset hint shows', async () => {
  // The old parking pose: nose at the race booth 15 m ahead (QA7 M1).
  const r = await holdW(page, 0, 14, { x: 34, z: 13, yaw: Math.PI });
  expect(r.mode).toBe('driving');
  expect(r.stillest).toBeLessThanOrEqual(4);
  expect(r.unsticks).toBeGreaterThan(0);
  expect(r.travelled).toBeGreaterThan(25);
  expect(r.hint).toBe(true);
});

test('W from both parked horses: never stationary for more than 4 s', async () => {
  for (const i of [1, 2]) {
    const r = await holdW(page, i, 20);
    expect(r.mode).toBe('riding');
    expect(r.stillest, `horse ${i}`).toBeLessThanOrEqual(4);
  }
});

test('a horse pushed into the race booth hops back and turns away', async () => {
  const r = await holdW(page, 1, 12, { x: 34, z: 10, yaw: Math.PI });
  expect(r.mode).toBe('riding');
  expect(r.stillest).toBeLessThanOrEqual(4);
  expect(r.unsticks).toBeGreaterThan(0);
  expect(r.travelled).toBeGreaterThan(12);
  expect(consoleErrors).toEqual([]);
});
