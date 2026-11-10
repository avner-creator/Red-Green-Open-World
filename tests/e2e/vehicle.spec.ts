/**
 * The buggy on the real island: get in with E, drive the south road, steer, get out, R to unstick,
 * auto-righting. One page for the whole file; each step re-establishes its own state.
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

interface CarState {
  x: number;
  y: number;
  z: number;
  heading: number;
  upY: number;
  speed: number;
  mode: string;
  inCar: boolean;
  playerDist: number;
  grounded: boolean;
}

/** Snapshot of the car and the player (heading from the car's quaternion). */
async function carState(p: Page): Promise<CarState> {
  return p.evaluate(() => {
    const rg = window.__rg!;
    const car = rg.ctx.vehicles.all[0];
    const q = car.object.quaternion;
    const fx = 2 * (q.x * q.z + q.w * q.y);
    const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
    const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
    const pl = rg.ctx.player;
    return {
      x: car.position.x,
      y: car.position.y,
      z: car.position.z,
      heading: Math.atan2(fx, fz),
      upY,
      speed: car.speed,
      mode: rg.state().playerMode,
      inCar: pl.vehicle === car,
      playerDist: Math.hypot(pl.position.x - car.position.x, pl.position.z - car.position.z),
      grounded: pl.grounded,
    };
  });
}

async function steps(p: Page, n: number, inject: Record<string, number | boolean> | null = null): Promise<void> {
  await p.evaluate(
    ([n, inject]) => {
      const rg = window.__rg!;
      rg.inject(inject);
      rg.step(1 / 60, n, false);
      rg.inject(null);
    },
    [n, inject] as const,
  );
}

/** Stand next to the car (left side) and press E. */
async function getIn(p: Page): Promise<void> {
  await p.evaluate(() => {
    const rg = window.__rg!;
    const car = rg.ctx.vehicles.all[0];
    const q = car.object.quaternion;
    const fx = 2 * (q.x * q.z + q.w * q.y);
    const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
    const h = Math.atan2(fx, fz);
    const x = car.position.x + Math.cos(h) * 1.9;
    const z = car.position.z - Math.sin(h) * 1.9;
    rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.3, z, h);
    rg.step(1 / 60, 20, false);
  });
  await steps(page, 1, { usePressed: true });
  await steps(page, 30);
}

test('the buggy is parked at the garage and you can get in with E', async () => {
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 30, false);
  });
  const info = await page.evaluate(() => {
    const rg = window.__rg!;
    const car = rg.ctx.vehicles.all[0];
    const g = rg.ctx.world.anchors.garage;
    return { kind: car.kind, count: rg.ctx.vehicles.all.length, d: Math.hypot(car.position.x - g.position.x, car.position.z - g.position.z) };
  });
  expect(info.kind).toBe('car');
  expect(info.count).toBe(1);
  expect(info.d).toBeLessThan(1.5);
  const parked = await carState(page);
  expect(parked.upY).toBeGreaterThan(0.98);
  expect(parked.mode).toBe('walk');

  await getIn(page);
  const s = await carState(page);
  expect(s.mode).toBe('driving');
  expect(s.inCar).toBe(true);
  expect(s.playerDist).toBeLessThan(1); // the robot sits in the car
});

test('drives fast along the road, steers, and the driver rides along', async () => {
  await page.evaluate(() => {
    const rg = window.__rg!;
    const car = rg.ctx.vehicles.all[0] as unknown as { teleport(p: { x: number; y: number; z: number }, yaw: number): void };
    car.teleport({ x: 1, y: rg.ctx.world.heightAt(1, 20), z: 20 }, 0); // south road, heading +Z
    rg.step(1 / 60, 20, false);
  });
  const a = await carState(page);
  await steps(page, 150, { moveY: 1 });
  const b = await carState(page);
  const dist = Math.hypot(b.x - a.x, b.z - a.z);
  expect(dist).toBeGreaterThan(22); // ~0→16 m/s in 2.5 s
  expect(b.speed).toBeGreaterThan(13);
  expect(b.speed).toBeLessThan(17.5);
  expect(b.upY).toBeGreaterThan(0.9);
  expect(b.mode).toBe('driving');
  expect(b.playerDist).toBeLessThan(1);
  const pos = await page.evaluate(() => window.__rg!.state().playerPosition);
  expect(Math.hypot(pos[0] - b.x, pos[2] - b.z)).toBeLessThan(1);

  // Steering right (D) turns the nose clockwise seen from above (heading decreases).
  await steps(page, 40, { moveY: 1, moveX: 1 });
  const c = await carState(page);
  const turned = Math.atan2(Math.sin(c.heading - b.heading), Math.cos(c.heading - b.heading));
  expect(turned).toBeLessThan(-0.5);
  expect(c.upY).toBeGreaterThan(0.85);

  // Brake hard (S) for 0.7 s, let go: it stops and holds still.
  await steps(page, 42, { moveY: -1 });
  await steps(page, 60);
  const d = await carState(page);
  expect(d.speed).toBeLessThan(2);
});

test('E gets out to a free side, standing on the ground', async () => {
  await steps(page, 1, { usePressed: true });
  await steps(page, 60);
  const s = await carState(page);
  expect(s.mode).toBe('walk');
  expect(s.inCar).toBe(false);
  expect(s.playerDist).toBeGreaterThan(1);
  expect(s.playerDist).toBeLessThan(4);
  expect(s.grounded).toBe(true);
});

test('R in a flipped car puts it upright on the road with the player beside it', async () => {
  await getIn(page);
  expect((await carState(page)).mode).toBe('driving');
  // Tip it upside down on the grass beside the road.
  await page.evaluate(() => {
    const rg = window.__rg!;
    const w = rg.ctx.physics.world;
    w.forEachRigidBody((b) => {
      if (b.isDynamic() && b.mass() > 300) {
        const t = b.translation();
        b.setTranslation({ x: t.x + 14, y: rg.ctx.world.heightAt(t.x + 14, t.z) + 1.2, z: t.z }, true);
        b.setRotation({ x: 0, y: 0, z: 1, w: 0 }, true);
      }
    });
    rg.step(1 / 60, 20, false);
  });
  expect((await carState(page)).upY).toBeLessThan(0);
  await steps(page, 1, { respawnPressed: true });
  await steps(page, 40);
  const s = await carState(page);
  expect(s.mode).toBe('walk');
  expect(s.upY).toBeGreaterThan(0.95);
  expect(Math.abs(s.x - 1.6)).toBeLessThan(4.5); // back on the south road (x ≈ 0..5 here)
  expect(s.playerDist).toBeLessThan(4);
  expect(s.grounded).toBe(true);
});

test('an empty flipped car rights itself', async () => {
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.ctx.physics.world.forEachRigidBody((b) => {
      if (b.isDynamic() && b.mass() > 300) {
        const t = b.translation();
        b.setTranslation({ x: t.x, y: t.y + 1.5, z: t.z }, true);
        b.setRotation({ x: 0.7071, y: 0, z: 0, w: 0.7071 }, true); // on its nose
      }
    });
  });
  await steps(page, 240);
  const s = await carState(page);
  expect(s.upY).toBeGreaterThan(0.95);
});

test('no console errors while driving', async () => {
  const errors = await page.evaluate(() => window.__rg!.errors);
  expect(errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
