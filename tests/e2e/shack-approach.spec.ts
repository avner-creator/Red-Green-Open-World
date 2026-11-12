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

/**
 * QA8 m1: a child pushing straight at the kiosk's middle from any of 24 directions (10 m out, the
 * stick held toward the anchor the whole time) is deflected round it: never held in one place for
 * more than 1.5 s without the E prompt, and the prompt shows within 12 s.
 */
test('pushing at the kiosk from 24 directions slides round to the prompt (QA8 m1)', async ({ page }) => {
  test.setTimeout(240_000);
  const { consoleErrors } = await boot(page);
  const rows = await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 30, false);
    const a0 = rg.ctx.world.anchors.gearShack;
    const K = { x: a0.position.x, z: a0.position.z };
    const V = rg.ctx.camera.position.constructor as new () => { x: number; z: number };
    const out: { deg: number; prompt: number; stuck: number; end: string }[] = [];
    for (let n = 0; n < 24; n++) {
      const a = a0.yaw + (n * Math.PI) / 12;
      // 10 m out, or closer where something else (the Scoops parlour, a bench) is in the way.
      const o = rg.ctx.camera.position.clone().set(K.x + Math.sin(a) * 4.4, rg.ctx.world.heightAt(K.x, K.z) + 1, K.z + Math.cos(a) * 4.4);
      const hit = rg.ctx.physics.raycast(o, o.clone().set(Math.sin(a), 0, Math.cos(a)), 5.6);
      const r0 = hit ? Math.max(5.5, 4.4 + hit.distance - 0.8) : 10;
      const px = K.x + Math.sin(a) * r0;
      const pz = K.z + Math.cos(a) * r0;
      rg.teleport(px, rg.ctx.world.heightAt(px, pz) + 0.4, pz, Math.atan2(K.x - px, K.z - pz));
      rg.step(1 / 60, 30, false);
      let prompt = -1;
      let still = 0;
      let stuck = 0;
      let last: [number, number] | null = null;
      for (let t = 0; t < 12; t += 0.25) {
        if (rg.ctx.interactions.focused?.id === 'gearShack') {
          prompt = t;
          break;
        }
        const p = rg.state().playerPosition;
        if (last && Math.hypot(p[0] - last[0], p[2] - last[1]) < 0.05 * 3) {
          still += 0.25;
          stuck = Math.max(stuck, still);
        } else still = 0;
        last = [p[0], p[2]];
        const f = rg.ctx.camera.getWorldDirection(new V() as never) as unknown as { x: number; z: number };
        const fl = Math.hypot(f.x, f.z) || 1;
        const fx = f.x / fl;
        const fz = f.z / fl;
        const dl = Math.hypot(K.x - p[0], K.z - p[2]) || 1;
        const dx = (K.x - p[0]) / dl;
        const dz = (K.z - p[2]) / dl;
        rg.inject({ moveY: dx * fx + dz * fz, moveX: -dx * fz + dz * fx });
        rg.step(1 / 60, 15, false);
      }
      rg.inject(null);
      const p = rg.state().playerPosition;
      out.push({ deg: n * 15, prompt, stuck, end: `${p[0].toFixed(2)},${p[2].toFixed(2)}` });
    }
    return out;
  });
  console.log(rows.map((r) => JSON.stringify(r)).join('\n'));
  for (const r of rows) {
    expect.soft(r.prompt, `from ${r.deg}°: ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(0);
    expect.soft(r.stuck, `from ${r.deg}°: ${JSON.stringify(r)}`).toBeLessThanOrEqual(1.5);
  }
  expect(consoleErrors).toEqual([]);
});
