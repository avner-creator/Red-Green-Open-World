/**
 * Pip never hides the hero on a ride (QA round 5, M2): on the buggy, the horse, the plane and the
 * dragon his body stays off every chase-camera sight line to the hero (feet to head). Before the
 * fix he sat in the buggy's back seat and the driver could not be seen.
 * Screenshots (opt-in, RG_SHOTS=1) in test-results/buddy-rides/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { SHOTS, boot } from './helpers';

test.use({ viewport: { width: 960, height: 540 } });

/** Drive forward `n` × 0.5 s; after each, the smallest gap (m) between Pip's body and a camera→hero line. */
async function drive(page: Page, n: number): Promise<number[]> {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(
      await page.evaluate(() => {
        const rg = window.__rg!;
        rg.inject({ moveY: 1 });
        rg.step(1 / 30, 15, false);
        rg.inject(null);
        const ctx = rg.ctx;
        const cam = ctx.camera.position.clone();
        const pl = ctx.player;
        const bp = window.__rgBuddy!.pos();
        const sc = window.__rgBuddy!.scale();
        const c = cam.clone().set(bp[0], bp[1] + 0.35 * sc, bp[2]);
        const r = 0.38 * sc;
        let worst = 99;
        for (let k = 0; k <= 6; k++) {
          const h = cam.clone().set(pl.position.x, pl.position.y + 0.3 + (k / 6) * 1.4, pl.position.z);
          const d = h.clone().sub(cam);
          const len = d.length();
          d.divideScalar(len);
          const t = c.clone().sub(cam).dot(d);
          if (t <= 0 || t >= len) continue;
          worst = Math.min(worst, cam.clone().addScaledVector(d, t).distanceTo(c) - r);
        }
        return worst;
      }),
    );
  }
  if (SHOTS) {
    mkdirSync('test-results/buddy-rides', { recursive: true });
    await page.evaluate(() => window.__rg!.step(1 / 60, 1, true));
    writeFileSync(`test-results/buddy-rides/${await page.evaluate(() => window.__rgBuddy!.ride() + '-' + window.__rg!.ctx.player.mode)}.png`, await page.screenshot({ timeout: 90_000 }));
  }
  return out;
}

async function leave(page: Page, key: 'usePressed' | 'respawnPressed'): Promise<void> {
  await page.evaluate((k) => {
    const rg = window.__rg!;
    rg.inject({ [k]: true });
    rg.step(1 / 30, 1, false);
    rg.inject(null);
    rg.step(1 / 30, 40, false);
  }, key);
}

test('Pip rides small and in front: never between the chase camera and the hero (buggy, horse, plane, dragon)', async ({ page }) => {
  test.setTimeout(420_000);
  const { consoleErrors } = await boot(page);
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 30, 3, false);
    const c = rg.ctx.vehicles.all.find((v) => v.kind === 'car')!;
    rg.teleport(c.position.x + 1.2, c.position.y + 0.2, c.position.z - 1.2);
    rg.step(1 / 30, 10, false);
    rg.inject({ usePressed: true });
    rg.step(1 / 30, 1, false);
    rg.inject(null);
    rg.step(1 / 30, 30, false);
  });
  expect(await page.evaluate(() => window.__rg!.ctx.player.mode)).toBe('driving');
  const buggy = await drive(page, 6);
  expect(await page.evaluate(() => window.__rgBuddy!.scale())).toBeLessThan(1);
  await leave(page, 'usePressed');

  await page.evaluate(() => {
    const rg = window.__rg!;
    const h = rg.ctx.vehicles.all.find((v) => v.kind === 'horse')!;
    const q = h.object.quaternion;
    const yaw = Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y));
    const x = h.position.x + Math.cos(yaw) * 1.8;
    const z = h.position.z - Math.sin(yaw) * 1.8;
    rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.2, z, yaw);
    rg.step(1 / 60, 20, false);
    rg.inject({ usePressed: true });
    rg.step(1 / 60, 1, false);
    rg.inject(null);
    rg.step(1 / 60, 150, false);
  });
  expect(await page.evaluate(() => window.__rg!.ctx.player.mode)).toBe('riding');
  const horse = await drive(page, 6);
  await leave(page, 'usePressed');

  const sky: Record<string, number[]> = {};
  for (const k of ['plane', 'dragon'] as const) {
    await page.evaluate((k) => {
      const rg = window.__rg!;
      const pa = window.__rgSky![k].pad.at;
      rg.teleport(pa.x + 5, pa.y + 0.3, pa.z, 0);
      rg.step(1 / 60, 10, false);
      rg.teleport(pa.x, pa.y + 0.3, pa.z, 0);
      rg.step(1 / 60, 240, false);
    }, k);
    expect(await page.evaluate(() => window.__rgBuddy!.ride())).toBe('vehicle');
    sky[k] = await drive(page, 5);
    await leave(page, 'respawnPressed');
  }
  const all = { buggy, horse, ...sky };
  for (const [k, gaps] of Object.entries(all)) expect(Math.min(...gaps), `${k}: ${JSON.stringify(all)}`).toBeGreaterThan(0.05);
  expect(consoleErrors).toEqual([]);
});
