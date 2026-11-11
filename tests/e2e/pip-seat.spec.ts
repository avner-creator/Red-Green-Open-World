/** Pip flies along: in the plane's back seat (`player.object.userData.pipSeat`), released on landing. */
import { expect, test } from '@playwright/test';
import { boot } from './helpers';

test('Pip sits in the plane back seat while flying and is back on foot after landing', async ({ page }) => {
  test.setTimeout(240_000);
  const { consoleErrors } = await boot(page);
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const sky = window.__rgSky!;
    const ctx = rg.ctx;
    rg.start();
    rg.step(1 / 60, 3, false);
    rg.teleport(-16, ctx.world.heightAt(-16, 41) + 0.3, 41, Math.PI / 2);
    rg.step(1 / 60, 10, false);
    sky.plane.contestSeconds = 12;
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    let seatedFrames = 0;
    let maxGap = 0;
    let maxY = 0;
    for (let i = 0; i < 30 * 70 && ctx.player.mode === 'external'; i++) {
      rg.step(1 / 30, 1, false);
      const seat = ctx.player.object.userData.pipSeat as { getWorldPosition(v: unknown): { x: number; y: number; z: number } } | undefined;
      if (!seat) continue;
      const v = ctx.player.position.clone();
      const s = seat.getWorldPosition(v);
      const p = window.__rgBuddy!.pos();
      seatedFrames++;
      maxGap = Math.max(maxGap, Math.hypot(p[0] - s.x, p[1] - s.y, p[2] - s.z));
      maxY = Math.max(maxY, p[1] - ctx.world.heightAt(p[0], p[2]));
    }
    rg.step(1 / 30, 30, false);
    return { seatedFrames, maxGap, maxY, mode: ctx.player.mode, seatAfter: !!ctx.player.object.userData.pipSeat, ride: window.__rgBuddy!.ride() };
  });
  expect(r.seatedFrames, JSON.stringify(r)).toBeGreaterThan(60);
  expect(r.maxGap, JSON.stringify(r)).toBeLessThan(0.6);
  expect(r.maxY, 'Pip was up in the air with the plane').toBeGreaterThan(5);
  expect(r.mode).toBe('walk');
  expect(r.seatAfter).toBe(false);
  expect(r.ride).not.toBe('vehicle');
  expect(consoleErrors).toEqual([]);
});
