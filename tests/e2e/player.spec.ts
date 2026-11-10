import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

/** Freeze, start a session and settle on the ground. */
async function startFrozen(page: Page): Promise<void> {
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 20);
  });
}

/** Step frame by frame (no render) and collect player state. */
async function run(page: Page, frames: number): Promise<{ y: number[]; grounded: boolean[]; pos: [number, number, number] }> {
  return page.evaluate((n) => {
    const rg = window.__rg!;
    const p = rg.ctx.player;
    const y: number[] = [];
    const grounded: boolean[] = [];
    for (let i = 0; i < n; i++) {
      rg.step(1 / 60, 1);
      y.push(p.position.y);
      grounded.push(p.grounded);
    }
    return { y, grounded, pos: [p.position.x, p.position.y, p.position.z] as [number, number, number] };
  }, frames);
}

test('player walks, jumps, launches, teleports and respawns without errors', async ({ page }) => {
  const { consoleErrors } = await boot(page);
  await startFrozen(page);

  // Settled on the flat ground at y≈0.
  const start = await page.evaluate(() => {
    const p = window.__rg!.ctx.player;
    return { x: p.position.x, y: p.position.y, z: p.position.z, grounded: p.grounded, mode: p.mode };
  });
  expect(start.grounded).toBe(true);
  expect(Math.abs(start.y)).toBeLessThan(0.1);
  expect(start.mode).toBe('walk');

  // Walking forward (camera-relative) moves the player ~walkSpeed m/s.
  await page.evaluate(() => window.__rg!.inject({ moveY: 1 }));
  const walk = await run(page, 60);
  await page.evaluate(() => window.__rg!.inject(null));
  const walked = Math.hypot(walk.pos[0] - start.x, walk.pos[2] - start.z);
  expect(walked).toBeGreaterThan(3);
  expect(walked).toBeLessThan(5);

  // Jump: rises ~1.28 m (7.5²/2·22) and lands again.
  await run(page, 30);
  await page.evaluate(() => window.__rg!.inject({ jump: true, jumpPressed: true }));
  const jump = await run(page, 90);
  await page.evaluate(() => window.__rg!.inject(null));
  const peak = Math.max(...jump.y) - start.y;
  expect(peak).toBeGreaterThan(1.1);
  expect(peak).toBeLessThan(1.45);
  expect(jump.grounded[5]).toBe(false);
  expect(jump.grounded[jump.grounded.length - 1]).toBe(true);

  // Launch to a 40 m apex (trampoline): v = sqrt(2·g·h).
  const launch = await page.evaluate(() => {
    const rg = window.__rg!;
    const p = rg.ctx.player;
    const v = Math.sqrt(2 * 22 * 40);
    const y0 = p.position.y;
    p.launch(new (p.position.constructor as new (x: number, y: number, z: number) => typeof p.position)(0, v, 0));
    let maxPeak = 0;
    let modeDuring = '';
    for (let i = 0; i < 400; i++) {
      rg.step(1 / 60, 1);
      maxPeak = Math.max(maxPeak, p.airPeak);
      if (i === 60) modeDuring = p.mode;
      if (p.grounded && i > 10) break;
    }
    return { apex: maxPeak, y0, grounded: p.grounded, mode: p.mode, modeDuring };
  });
  expect(launch.apex).toBeGreaterThan(38.5);
  expect(launch.apex).toBeLessThan(40.5);
  expect(launch.grounded).toBe(true);
  expect(launch.modeDuring).toBe('walk');
  expect(launch.mode).toBe('walk'); // launch landings never flop

  // Flop: comic tumble, then back to walking.
  const flop = await page.evaluate(() => {
    const rg = window.__rg!;
    rg.inject({ flopPressed: true });
    rg.step(1 / 60, 2);
    const during = rg.ctx.player.mode;
    rg.step(1 / 60, 90);
    return { during, after: rg.ctx.player.mode };
  });
  expect(flop).toEqual({ during: 'flop', after: 'walk' });

  // Teleport, then respawn back to the last safe grounded spot.
  const tp = await page.evaluate(() => {
    const rg = window.__rg!;
    const before = rg.ctx.player.position.clone();
    rg.teleport(30, 5, 30);
    rg.step(1 / 60, 1);
    const after = rg.ctx.player.position.clone();
    rg.inject({ respawnPressed: true });
    rg.step(1 / 60, 2);
    const back = rg.ctx.player.position.clone();
    return { before: before.toArray(), after: after.toArray(), back: back.toArray() };
  });
  expect(tp.after[0]).toBeCloseTo(30, 1);
  expect(tp.after[2]).toBeCloseTo(30, 1);
  expect(Math.hypot(tp.back[0] - tp.before[0], tp.back[2] - tp.before[2])).toBeLessThan(1.5);

  // Falling out of the world auto-respawns.
  const fell = await page.evaluate(() => {
    const rg = window.__rg!;
    rg.teleport(0, -40, 0);
    rg.step(1 / 60, 2);
    return rg.ctx.player.position.y;
  });
  expect(fell).toBeGreaterThan(-1);

  // Camera stays above the ground and looks at the player.
  const cam = await page.evaluate(() => {
    const rg = window.__rg!;
    rg.step(1 / 60, 30);
    const c = rg.ctx.camera.position;
    return { y: c.y, d: c.distanceTo(rg.ctx.player.position) };
  });
  expect(cam.y).toBeGreaterThan(0.3);
  expect(cam.d).toBeGreaterThan(2);
  expect(cam.d).toBeLessThan(10);

  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('interactions focus the nearest target and E uses it', async ({ page }) => {
  await boot(page);
  await startFrozen(page);
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const p = rg.ctx.player.position;
    const at = p.clone().setX(p.x + 1.5);
    let used = 0;
    const focusLog: (string | null)[] = [];
    rg.ctx.events.on('interact:focus', (e) => focusLog.push(e.target ? e.target.id : null));
    const remove = rg.ctx.interactions.add({ id: 'box', radius: 3, icon: 'hand', position: () => at, onUse: () => (used += 1) });
    rg.step(1 / 60, 2);
    const focused = rg.ctx.interactions.focused?.id ?? null;
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 3);
    remove();
    rg.step(1 / 60, 1);
    return { focused, used, focusLog, after: rg.ctx.interactions.focused };
  });
  expect(r.focused).toBe('box');
  expect(r.used).toBe(1);
  expect(r.focusLog).toEqual(['box', null]);
  expect(r.after).toBeNull();
});
