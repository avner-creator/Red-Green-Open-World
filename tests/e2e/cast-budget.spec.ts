/**
 * Physics query budget (QA7 M5): ray and shape casts per frame at spawn, standing and walking, stay
 * within a fixed budget so new probes (camera swings, Pip's path checks, crowd blockers) cannot
 * creep the per-frame CPU cost up unnoticed. Counts every Rapier world query (cast*, intersection*,
 * project*), whoever makes it. Measured at the time of writing: ~10 per frame standing and walking
 * (4 buggy wheel rays, camera arm sphere casts, the player's ground ray, Pip).
 */
import { expect, test } from '@playwright/test';
import { boot } from './helpers';

/** Average and worst single frame (queries per 1/60 s frame). */
const BUDGET = { avg: 14, max: 30 } as const;

test('ray / shape casts per frame stay within budget at spawn (standing and walking)', async ({ page }) => {
  const { consoleErrors } = await boot(page);
  const res = await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 60, false);
    const w = rg.ctx.physics.world as unknown as Record<string, unknown>;
    const proto = Object.getPrototypeOf(w) as Record<string, unknown>;
    let n = 0;
    const patched: string[] = [];
    for (const k of Object.getOwnPropertyNames(proto)) {
      if (!/^(cast|intersection|project)/.test(k)) continue;
      const f = proto[k];
      if (typeof f !== 'function') continue;
      patched.push(k);
      w[k] = function (this: unknown, ...a: unknown[]) {
        n++;
        return (f as (...x: unknown[]) => unknown).apply(this, a);
      };
    }
    const run = (move: number): { avg: number; max: number } => {
      rg.inject(move ? { moveY: move, moveX: 0.25 } : null);
      rg.step(1 / 60, 20, false);
      let total = 0;
      let max = 0;
      for (let i = 0; i < 180; i++) {
        n = 0;
        rg.step(1 / 60, 1, false);
        total += n;
        max = Math.max(max, n);
      }
      rg.inject(null);
      return { avg: total / 180, max };
    };
    rg.ctx.player.respawn();
    const stand = run(0);
    rg.ctx.player.respawn();
    const walk = run(1);
    for (const k of patched) delete w[k];
    return { patched: patched.length, stand, walk };
  });
  console.log(`casts per frame: standing avg ${res.stand.avg.toFixed(1)} max ${res.stand.max}, walking avg ${res.walk.avg.toFixed(1)} max ${res.walk.max}`);
  expect(res.patched).toBeGreaterThan(3);
  for (const r of [res.stand, res.walk]) {
    expect(r.avg).toBeLessThanOrEqual(BUDGET.avg);
    expect(r.max).toBeLessThanOrEqual(BUDGET.max);
  }
  expect(consoleErrors).toEqual([]);
});
