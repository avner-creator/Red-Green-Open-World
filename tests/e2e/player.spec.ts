/**
 * The real player on the real island. One page for the whole file (boots are the slow part on
 * SwiftShader); every test re-establishes its own state with a fresh session and teleports.
 */
import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

test.describe.configure({ mode: 'serial' });

let page: Page;
let consoleErrors: string[] = [];

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  ({ consoleErrors } = await boot(page));
});

test.afterAll(async () => {
  await page.close();
});

/** Freeze, start a fresh session (player back at the spawn) and settle on the ground. */
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
      rg.step(1 / 60, 1, false);
      y.push(p.position.y);
      grounded.push(p.grounded);
    }
    return { y, grounded, pos: [p.position.x, p.position.y, p.position.z] as [number, number, number] };
  }, frames);
}

test('player walks, jumps, launches, teleports and respawns without errors', async () => {
  await startFrozen(page);

  // Settled on the real terrain at the spawn (open, flat plaza), on dry land.
  const start = await page.evaluate(() => {
    const { player: p, world: w } = window.__rg!.ctx;
    const { x, y, z } = p.position;
    return { x, y, z, ground: w.heightAt(x, z), land: w.isLand(x, z), grounded: p.grounded, mode: p.mode };
  });
  expect(start.grounded).toBe(true);
  expect(Math.abs(start.y - start.ground)).toBeLessThan(0.1);
  expect(start.land).toBe(true);
  expect(start.mode).toBe('walk');

  // Walking forward (camera-relative) moves the player ~walkSpeed m/s.
  await page.evaluate(() => window.__rg!.inject({ moveY: 1 }));
  const walk = await run(page, 60);
  await page.evaluate(() => window.__rg!.inject(null));
  const walked = Math.hypot(walk.pos[0] - start.x, walk.pos[2] - start.z);
  expect(walked).toBeGreaterThan(3);
  expect(walked).toBeLessThan(5);
  // Stayed glued to the ground the whole way (no hops or sinking on the heightfield).
  expect(walk.grounded.every(Boolean)).toBe(true);
  const afterWalk = await page.evaluate(() => {
    const { player: p, world: w } = window.__rg!.ctx;
    return p.position.y - w.heightAt(p.position.x, p.position.z);
  });
  expect(Math.abs(afterWalk)).toBeLessThan(0.1);

  // Jump: rises ~1.28 m (7.5²/2·22) and lands again.
  const before = await run(page, 30);
  const groundY = before.pos[1];
  await page.evaluate(() => window.__rg!.inject({ jump: true, jumpPressed: true }));
  const jump = await run(page, 90);
  await page.evaluate(() => window.__rg!.inject(null));
  const peak = Math.max(...jump.y) - groundY;
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
      rg.step(1 / 60, 1, false);
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
    rg.teleport(30, rg.ctx.world.heightAt(30, 30) + 5, 30);
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

  // Falling out of the world auto-respawns onto dry land.
  const fell = await page.evaluate(() => {
    const rg = window.__rg!;
    rg.teleport(0, -40, 0);
    rg.step(1 / 60, 2);
    const { x, y, z } = rg.ctx.player.position;
    return { above: y - rg.ctx.world.heightAt(x, z), land: rg.ctx.world.isLand(x, z) };
  });
  expect(fell.above).toBeGreaterThan(-0.1);
  expect(fell.above).toBeLessThan(0.5);
  expect(fell.land).toBe(true);

  // Camera stays above the ground and looks at the player.
  const cam = await page.evaluate(() => {
    const rg = window.__rg!;
    rg.step(1 / 60, 30);
    const c = rg.ctx.camera.position;
    return { above: c.y - rg.ctx.world.heightAt(c.x, c.z), d: c.distanceTo(rg.ctx.player.position) };
  });
  expect(cam.above).toBeGreaterThan(0.3);
  expect(cam.d).toBeGreaterThan(2);
  expect(cam.d).toBeLessThan(10);

  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('interactions focus the nearest target and E uses it', async () => {
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

test('island walk: road to the trampoline, up its steps and bouncing; sea splash; bridge deck', async () => {
  await startFrozen(page);
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const { player: p, world: w, cameraRig, events } = rg.ctx;
    const offGround = (): number => p.position.y - w.heightAt(p.position.x, p.position.z);
    const respawns: { land: boolean; off: number }[] = [];
    events.on('player:respawn', () => respawns.push({ land: w.isLand(p.position.x, p.position.z), off: offGround() }));
    /** Steer with injected camera-relative input through [x, z] waypoints (simulation only). */
    const walk = (points: [number, number][], maxFrames = 1800): { stuck: number; air: number; maxOff: number } => {
      let frames = 0;
      let still = 0;
      let stuck = 0;
      let air = 0;
      let maxOff = 0;
      for (const [tx, tz] of points) {
        for (;;) {
          const dx = tx - p.position.x;
          const dz = tz - p.position.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.8 || frames++ > maxFrames) break;
          const s = Math.sin(cameraRig.yaw);
          const c = Math.cos(cameraRig.yaw);
          rg.inject({ moveY: (dx * s + dz * c) / d, moveX: (-dx * c + dz * s) / d });
          const x0 = p.position.x;
          const z0 = p.position.z;
          rg.step(1 / 60, 1, false);
          still = Math.hypot(p.position.x - x0, p.position.z - z0) < 0.02 ? still + 1 : 0;
          stuck = Math.max(stuck, still);
          if (!p.grounded) air++;
          maxOff = Math.max(maxOff, Math.abs(offGround()));
        }
      }
      rg.inject(null);
      return { stuck, air, maxOff };
    };

    // Spawn → plaza → park road → the trampoline's front steps (it faces west, steps on −x).
    const t = w.anchors.trampoline.position;
    const road = walk([[10, -4], [14, -8], [28, -14], [42, -18], [t.x - 13, t.z]]);
    const atSteps = Math.hypot(p.position.x - (t.x - 13), p.position.z - t.z);
    // Walk straight up the two steps onto the mat: autostep must carry the robot up (no jump).
    let maxY = p.position.y;
    rg.inject({ moveY: 0, moveX: 0 });
    for (let i = 0; i < 240; i++) {
      const s = Math.sin(cameraRig.yaw);
      const c = Math.cos(cameraRig.yaw);
      const dx = t.x - p.position.x;
      const dz = t.z - p.position.z;
      const d = Math.max(0.01, Math.hypot(dx, dz));
      rg.inject(d > 1 ? { moveY: (dx * s + dz * c) / d, moveX: (-dx * c + dz * s) / d } : null);
      rg.step(1 / 60, 1, false);
      maxY = Math.max(maxY, p.position.y);
    }
    rg.inject(null);
    const bounce = maxY - w.heightAt(t.x, t.z);

    // Walk off a beach into the sea: splash → respawn on a dry safe spot.
    rg.teleport(-140, w.heightAt(-140, 0) + 0.1, 0, -Math.PI / 2);
    rg.step(1 / 60, 20, false);
    respawns.length = 0;
    walk([[-175, 0]], 600);
    const sea = respawns[0] ?? { land: false, off: NaN };

    // The bridge deck holds a player dropped onto it and one walking across it.
    const b = w.anchors.bungee.position;
    rg.teleport(b.x, b.y + 25, b.z);
    rg.step(1 / 60, 120, false);
    const deckDrop = p.position.y - b.y;
    rg.teleport(0, b.y + 0.2, -84, Math.PI);
    rg.step(1 / 60, 10, false);
    walk([[0, -126]], 900);
    const deckWalk = { y: p.position.y - b.y, z: p.position.z, grounded: p.grounded };
    return { road, atSteps, bounce, sea, deckDrop, deckWalk };
  });
  expect(r.road.stuck).toBeLessThan(20);
  expect(r.road.air).toBe(0);
  expect(r.road.maxOff).toBeLessThan(0.1);
  expect(r.atSteps).toBeLessThan(1);
  expect(r.bounce).toBeGreaterThan(3); // climbed onto the mat (+1 m) and got launched
  expect(r.sea.land).toBe(true);
  expect(Math.abs(r.sea.off)).toBeLessThan(0.3);
  expect(Math.abs(r.deckDrop)).toBeLessThan(0.1);
  expect(Math.abs(r.deckWalk.y)).toBeLessThan(0.1);
  expect(r.deckWalk.z).toBeLessThan(-124);
  expect(r.deckWalk.grounded).toBe(true);
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
