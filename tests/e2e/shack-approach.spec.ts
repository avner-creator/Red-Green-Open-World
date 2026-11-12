/**
 * Gear Shack from the sides (QA7 m4): a child walking straight at the counter's E spot from either
 * side (or a front corner) slides round the kiosk to the prompt instead of sticking at the rocket or
 * the paint bucket. (Straight from behind a convex kiosk always ends at its back; kids steer there.)
 */
import { expect, test } from '@playwright/test';
import { boot } from './helpers';

test('walking at the shack prompt from the sides and front corners reaches it', async ({ page }) => {
  const { consoleErrors } = await boot(page);
  const rows = await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 30, false);
    const gs = rg.interactables().find((i) => i.id === 'gearShack')!;
    const [tx, , tz] = gs.position;
    const a0 = rg.ctx.world.anchors.gearShack;
    const V = rg.ctx.camera.position.constructor as new () => { x: number; z: number };
    const out: { side: number; reached: number }[] = [];
    // Local directions round the kiosk (0 = straight in front, ±π/2 = the sides).
    for (const side of [-2.1, -1.57, -1.0, 1.0, 1.57, 2.1]) {
      const a = a0.yaw + side;
      const px = a0.position.x + Math.sin(a) * 6.5;
      const pz = a0.position.z + Math.cos(a) * 6.5;
      rg.teleport(px, rg.ctx.world.heightAt(px, pz) + 0.4, pz, Math.atan2(tx - px, tz - pz));
      rg.step(1 / 60, 30, false);
      let reached = -1;
      for (let t = 0; t < 9; t += 0.25) {
        if (rg.ctx.interactions.focused?.id === 'gearShack') {
          reached = t;
          break;
        }
        const p = rg.state().playerPosition;
        const f = rg.ctx.camera.getWorldDirection(new V() as never) as unknown as { x: number; z: number };
        const fl = Math.hypot(f.x, f.z) || 1;
        const fx = f.x / fl;
        const fz = f.z / fl;
        const dl = Math.hypot(tx - p[0], tz - p[2]) || 1;
        const dx = (tx - p[0]) / dl;
        const dz = (tz - p[2]) / dl;
        rg.inject({ moveY: dx * fx + dz * fz, moveX: -dx * fz + dz * fx });
        rg.step(1 / 60, 15, false);
      }
      rg.inject(null);
      out.push({ side, reached });
    }
    return out;
  });
  for (const r of rows) expect(r.reached, `from local angle ${r.side}`).toBeGreaterThanOrEqual(0);
  expect(consoleErrors).toEqual([]);
});
