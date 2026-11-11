/**
 * Surprise bounces (seeded): over a run of held bounces there is at least one SUPER BOING, an auto
 * trick, a bonus star, sideways kicks — and every landing stays on the bed. Screenshots of three
 * bounces: test-results/tramp-surprise-<n>.png.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { boot, canvasShot } from './helpers';

test.describe.configure({ mode: 'serial' });
let page: Page;
let consoleErrors: string[] = [];

interface Tramp {
  surprise: { superBoing: boolean; trick: string; starAt: number; kickX: number; kickZ: number } | null;
  superCount: number;
  bonusStars: number;
  star: number[] | null;
  reseed(seed: number): void;
  setSurprises(on: boolean): void;
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(300_000);
  page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
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

test('seeded surprise bounces: super boing, tricks, stars, kicks; always lands on the bed', async () => {
  test.setTimeout(300_000);
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    const ctx = rg.ctx;
    const tr = (window as unknown as { __rgTramp: Tramp }).__rgTramp;
    tr.setSurprises(true);
    tr.reseed(12345);
    const c = window.__rgThrills!.trampoline();
    rg.teleport(c.x + 1, c.y + 0.1, c.z, 0);
    rg.step(1 / 60, 2, false);
    const seen = { supers: 0, tricks: new Set<string>(), stars: 0, kicks: 0, landings: 0, maxR: 0, tilted: 0 };
    let last: Tramp['surprise'] = null;
    // Bounce for ~60 s, holding jump in bursts (grow, then let it decay, then grow again).
    for (let i = 0; i < 60 * 60; i++) {
      const hold = Math.floor(i / 600) % 2 === 0;
      rg.inject(hold ? { jump: true } : null);
      rg.step(1 / 60, 1, false);
      const p = ctx.player.position;
      seen.maxR = Math.max(seen.maxR, Math.hypot(p.x - c.x, p.z - c.z));
      if (tr.surprise && tr.surprise !== last) {
        last = tr.surprise;
        seen.landings++;
        if (last.superBoing) seen.supers++;
        if (last.trick !== 'none') seen.tricks.add(last.trick);
        if (last.starAt >= 0) seen.stars++;
        if (Math.hypot(last.kickX, last.kickZ) > 0.3) seen.kicks++;
      }
    }
    rg.inject(null);
    return { ...seen, tricks: [...seen.tricks], superCount: tr.superCount, bonusStars: tr.bonusStars, mode: ctx.player.mode };
  });
  expect(r.landings).toBeGreaterThan(10);
  expect(r.supers).toBeGreaterThanOrEqual(1);
  expect(r.tricks.length).toBeGreaterThanOrEqual(2);
  expect(r.stars).toBeGreaterThanOrEqual(1);
  expect(r.kicks).toBeGreaterThanOrEqual(3);
  expect(r.maxR).toBeLessThan(9.5);
  expect(consoleErrors).toEqual([]);
});

test('screenshots: three surprise bounces', async () => {
  test.setTimeout(300_000);
  for (let n = 0; n < 3; n++) {
    // Step until something visible happens (a trick in progress or a star in the column), then shoot.
    const what = await page.evaluate(() => {
      const rg = window.__rg!;
      const tr = (window as unknown as { __rgTramp: Tramp }).__rgTramp;
      const ctx = rg.ctx;
      rg.inject({ jump: true });
      for (let i = 0; i < 60 * 20; i++) {
        rg.step(1 / 60, 1, false);
        const s = tr.surprise;
        const tilted = Math.abs(ctx.player.object.children[0]?.rotation.x ?? 0) + Math.abs(ctx.player.object.children[0]?.rotation.z ?? 0) > 1;
        if (s && (tilted || (tr.star && ctx.player.position.y > tr.star[1]! - 6 && ctx.player.position.y < tr.star[1]! - 1))) {
          rg.render();
          return `${s.superBoing ? 'super ' : ''}${s.trick}${tr.star ? ' star' : ''}`;
        }
      }
      rg.render();
      return 'none';
    });
    await canvasShot(page, `test-results/tramp-surprise-${n}.png`);
    console.log(`shot ${n}: ${what}`);
    await page.evaluate(() => window.__rg!.step(1 / 60, 40, false));
  }
  await page.evaluate(() => window.__rg!.inject(null));
});
