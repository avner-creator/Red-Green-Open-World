/**
 * Foam Lava course, child-proofing (QA6 B1, M1, m4): a child holding W (and tapping Space) from
 * the 3-2-1 on still starts on the course and moves; nobody is ever frozen; a child who keeps
 * falling still gets a kind ending (result card with a prize) within the round cap; the leave
 * button is on screen during a run; the countdown camera is outside the hero's head.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
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
    rg.step(1 / 60, 10, false);
  });
});

test.afterAll(async () => {
  await page.close();
});

/** Walk up to the booth with W held (real keys), press E, keep W held and tap Space. */
test('holding W through the countdown: the hero starts on the course and keeps moving', async () => {
  // Like the QA child: start 10 m to the side, walk up with W (camera behind), then E.
  await page.evaluate(() => {
    const rg = window.__rg!;
    const [x, , z] = window.__rgFoam!.booth();
    const px = x + 10;
    const pz = z;
    rg.teleport(px, rg.ctx.world.heightAt(px, pz) + 0.5, pz, Math.atan2(x - px, z - pz));
    rg.step(1 / 60, 30, false);
  });
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 40; i++) {
    await page.evaluate(() => window.__rg!.step(1 / 60, 15, false));
    const d = await page.evaluate(() => {
      const [x, , z] = window.__rgFoam!.booth();
      const p = window.__rg!.ctx.player.position;
      return Math.hypot(p.x - x, p.z - z);
    });
    if (d < 1.6) break;
  }
  await page.keyboard.press('KeyE');
  const track: { phase: string; mode: string; p: number[]; local: number[]; cam: number }[] = [];
  for (let i = 0; i < 16; i++) {
    await page.evaluate(() => window.__rg!.step(1 / 60, 30, false));
    await page.keyboard.press('Space');
    track.push(
      await page.evaluate(() => {
        const rg = window.__rg!;
        const f = window.__rgFoam!;
        const p = rg.ctx.player.position;
        return {
          phase: f.phase(),
          mode: rg.ctx.player.mode,
          p: [p.x, p.y, p.z].map((n) => +n.toFixed(2)),
          local: [f.sim.p.x, f.sim.p.y, f.sim.p.z].map((n) => +n.toFixed(2)),
          cam: +rg.ctx.camera.position.distanceTo(p).toFixed(2),
        };
      }),
    );
  }
  await page.keyboard.up('KeyW');
  // Started (countdown or run), riding the course controller.
  expect(track[0].phase).not.toBe('idle');
  expect(track.every((t) => t.phase !== 'idle')).toBe(true);
  expect(track[track.length - 1].mode).toBe('external');
  // The hero (world) matches the course sim (on the course, not left beside it).
  const w = await page.evaluate(() => {
    const f = window.__rgFoam!;
    const s = f.sim.p;
    const at = f.toWorld(s.x, s.y, s.z);
    const p = window.__rg!.ctx.player.position;
    return Math.hypot(at[0] - p.x, at[2] - p.z);
  });
  expect(w).toBeLessThan(0.05);
  // Moving: the sim moved after GO.
  const runs = track.filter((t) => t.phase === 'run');
  expect(runs.length).toBeGreaterThan(4);
  const a = runs[0].local;
  const z = runs[runs.length - 1].local;
  expect(Math.hypot(z[0] - a[0], z[2] - a[2])).toBeGreaterThan(2);
});

test('the leave button is on screen during a run', async () => {
  const exit = page.getByTestId('foamlava-leave');
  await expect(exit).toBeVisible();
  const box = await exit.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
});

test('a child who keeps falling still gets a kind ending with a prize', async () => {
  const out = await page.evaluate(() => {
    const rg = window.__rg!;
    const f = window.__rgFoam!;
    // Always run straight into the foam: never reaches a checkpoint.
    const w0 = rg.ctx.profile.wallet;
    let frames = 0;
    let maxFalls = 0;
    while (f.phase() === 'run' && frames < 60 * 30) {
      rg.inject({ moveX: 1, moveY: 0.3 });
      rg.step(1 / 60, 30, false);
      frames += 30;
      maxFalls = Math.max(maxFalls, f.sim.falls);
      // Skip the middle of the round (the cap is a run-clock rule; 85 s of stepping is too slow here).
      if (maxFalls > 0 && f.sim.time < 80) f.sim.time = 80;
    }
    rg.inject(null);
    rg.step(1 / 60, 10, false);
    return { phase: f.phase(), secs: frames / 60, falls: maxFalls, result: f.lastResult(), gained: rg.ctx.profile.wallet - w0 };
  });
  expect(out.falls).toBeGreaterThan(0);
  expect(out.phase).toBe('result');
  expect(out.secs).toBeLessThan(30);
  expect(out.result!.prize).toBeGreaterThan(0);
  await expect(page.getByTestId('foamlava-result')).toHaveClass(/on/);
  await page.keyboard.press('KeyR');
  await page.evaluate(() => window.__rg!.step(1 / 60, 20, false));
  expect(await page.evaluate(() => window.__rgFoam!.phase())).toBe('idle');
});

test('countdown camera stands well outside the hero', async () => {
  const d = await page.evaluate(() => {
    const rg = window.__rg!;
    const f = window.__rgFoam!;
    const [x, y, z] = f.booth();
    rg.teleport(x, y - 1.15, z);
    rg.step(1 / 60, 10, false);
    f.start();
    const out: number[] = [];
    for (let i = 0; i < 8; i++) {
      rg.step(1 / 60, 20, false);
      const p = rg.ctx.player.position;
      out.push(rg.ctx.camera.position.distanceTo({ x: p.x, y: p.y + 1.5, z: p.z } as never));
    }
    return out;
  });
  for (const v of d) expect(v).toBeGreaterThan(2.5);
  await page.keyboard.press('KeyR');
  await page.evaluate(() => window.__rg!.step(1 / 60, 20, false));
});

test('result card camera: clear of the start-arch pillars wherever the hero finishes (QA r7 m13)', async () => {
  const rows = await page.evaluate(() => {
    const rg = window.__rg!;
    const f = window.__rgFoam!;
    const ctx = rg.ctx;
    const pillars = f.props().filter((p) => p.id.startsWith('arch'));
    const out: { at: number[]; dist: number; pillar: number; blocked: boolean; phase: string }[] = [];
    // Spots across the finish deck, the ones by the arch pillar first.
    for (const [x, z] of [[-5.1, 1.5], [-5.1, 0.6], [-4.4, 1.8], [-1.6, 1.6], [-3.3, -0.5], [-5.0, -2.6]]) {
      const [bx, by, bz] = f.booth();
      rg.teleport(bx, by - 1.15, bz);
      rg.step(1 / 60, 5, false);
      f.start();
      for (let i = 0; i < 400 && f.phase() !== 'run'; i++) rg.step(1 / 60, 1, false);
      f.finishAt(x, z);
      rg.step(1 / 60, 90, false);
      const cam = ctx.camera.position;
      const head = ctx.player.position.clone();
      head.y += 1.45;
      const pillar = Math.min(...pillars.map((p) => Math.hypot(cam.x - p.x, cam.z - p.z) - p.r));
      const dir = head.clone().sub(cam);
      const hit = ctx.physics.raycast(cam.clone(), dir.clone().normalize(), dir.length() - 0.5);
      out.push({ at: [x, z], dist: cam.distanceTo(head), pillar, blocked: !!hit, phase: f.phase() });
      rg.inject({ respawnPressed: true });
      rg.step(1 / 60, 1, false);
      rg.inject(null);
      rg.step(1 / 60, 20, false);
    }
    return out;
  });
  console.log('foam result camera', JSON.stringify(rows));
  for (const r of rows) {
    expect(r.phase, JSON.stringify(r)).toBe('result');
    expect(r.dist, JSON.stringify(r)).toBeGreaterThan(3.5);
    expect(r.pillar, JSON.stringify(r)).toBeGreaterThan(0.3);
    expect(r.blocked, JSON.stringify(r)).toBe(false);
  }
});

test('no errors', () => {
  expect(consoleErrors).toEqual([]);
});
