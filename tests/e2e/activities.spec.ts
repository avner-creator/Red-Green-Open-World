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
