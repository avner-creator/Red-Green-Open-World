import { expect, test } from '@playwright/test';
import { boot } from './helpers';

test('teleporting onto a gem collects it; restart brings gems back', async ({ page }) => {
  const { consoleErrors } = await boot(page);
  const result = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    rg.freeze(true);
    const events: { id: string; count: number; total: number }[] = [];
    ctx.events.on('gem:collected', (e) => events.push({ id: e.id, count: e.count, total: e.total }));
    rg.start();
    rg.step(1 / 60, 5);
    const spot = ctx.world.gemSpots[0].position;
    const before = rg.state().gems;
    const total = rg.state().gemsTotal;
    // Feet are ~0.85 m below the gem centre the pickup test uses.
    rg.teleport(spot.x, spot.y - 0.85, spot.z);
    rg.step(1 / 60, 3);
    const after = rg.state().gems;
    rg.step(1 / 60, 10);
    const stays = rg.state().gems;
    rg.start(); // back to title, then a fresh session
    rg.step(1 / 60, 3);
    const restarted = rg.state().gems;
    return { before, after, stays, restarted, total, spots: ctx.world.gemSpots.length, events };
  });
  expect(result.before).toBe(0);
  expect(result.after).toBe(1);
  expect(result.stays).toBe(1);
  expect(result.total).toBe(result.spots);
  expect(result.events).toHaveLength(1);
  expect(result.events[0]).toMatchObject({ id: 'gem0', count: 1, total: result.spots });
  expect(result.restarted).toBe(0);
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('walking onto the trampoline mat launches the player upward', async ({ page }) => {
  const { consoleErrors } = await boot(page);
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 3);
    const a = ctx.world.anchors.trampoline.position;
    const toasts: unknown[] = [];
    ctx.events.on('ui:toast', (e) => toasts.push(e));
    rg.teleport(a.x, ctx.world.heightAt(a.x, a.z) + 1, a.z);
    rg.step(1 / 60, 3);
    return { vy: ctx.player.velocity.y, toasts: toasts.length };
  });
  expect(r.vy).toBeGreaterThan(5);
  expect(consoleErrors).toEqual([]);
});

test('walking from the steps onto the mat (no drop) is an immediate big bounce that then settles', async ({ page }) => {
  const { consoleErrors } = await boot(page);
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 3, false);
    const a = ctx.world.anchors.trampoline;
    const dist = 14;
    const x = a.position.x + Math.sin(a.yaw) * dist;
    const z = a.position.z + Math.cos(a.yaw) * dist;
    rg.teleport(x, ctx.world.heightAt(x, z) + 0.2, z, a.yaw + Math.PI);
    rg.step(1 / 60, 30, false); // settle on the ground
    const matTop = ctx.world.heightAt(a.position.x, a.position.z) + 1;
    let maxY = -Infinity;
    let onMatFrames = 0;
    rg.inject({ moveY: 1 });
    for (let i = 0; i < 420; i++) {
      rg.step(1 / 60, 1, false);
      const p = ctx.player.position;
      const d = Math.hypot(p.x - a.position.x, p.z - a.position.z);
      if (d < 8) {
        onMatFrames++;
        maxY = Math.max(maxY, p.y);
      }
      if (d < 3) break; // stop walking near the middle of the mat
    }
    rg.inject(null);
    // Stand still: the bounce decays and stops, so kids can stand on the mat and walk off.
    let lateMax = -Infinity;
    for (let i = 0; i < 600; i++) {
      rg.step(1 / 60, 1, false);
      if (i >= 480) lateMax = Math.max(lateMax, ctx.player.position.y);
    }
    return { maxRise: maxY - matTop, onMatFrames, standRise: lateMax - matTop };
  });
  expect(r.onMatFrames).toBeGreaterThan(20);
  expect(r.maxRise).toBeGreaterThan(8); // walking on is already a ~12 m bounce
  expect(r.standRise).toBeLessThan(0.4); // settled
  expect(consoleErrors).toEqual([]);
});
