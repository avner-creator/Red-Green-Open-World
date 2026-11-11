import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot, canvasShot } from './helpers';

/** Grey image of one channel (what one eye sees through its lens). */
function channel(png: PNG, c: number): Buffer {
  const o = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    o.data[i] = o.data[i + 1] = o.data[i + 2] = png.data[i + c];
    o.data[i + 3] = 255;
  }
  return PNG.sync.write(o);
}

test('living island: birds scatter, townsfolk load, budget holds, no errors', async ({ page }) => {
  test.setTimeout(150_000);
  const { consoleErrors } = await boot(page);
  const out = 'test-results/life';
  mkdirSync(out, { recursive: true });

  await page.evaluate(async () => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    await window.__rgLife!.loadTownsfolk();
    rg.step(1 / 60, 10, false);
  });
  expect(await page.evaluate(() => window.__rgLife!.townsfolkReady)).toBe(true);

  // Birds: settled while the player is away; scatter up when the player walks in; resettle later.
  const flock = await page.evaluate(() => {
    const rg = window.__rg!;
    const f0 = window.__rgLife!.critters.flocks[0];
    rg.teleport(f0.x - 25, rg.ctx.world.heightAt(f0.x - 25, f0.z) + 0.1, f0.z, Math.PI / 2);
    rg.step(1 / 60, 60, false);
    const before = window.__rgLife!.critters.flocks[0];
    rg.teleport(f0.x - 1, rg.ctx.world.heightAt(f0.x - 1, f0.z) + 0.1, f0.z, Math.PI / 2);
    rg.step(1 / 60, 45, false);
    const after = window.__rgLife!.critters.flocks[0];
    // Walk away; after a while they come back down somewhere clear of the player.
    rg.teleport(0, rg.ctx.world.heightAt(0, 9) + 0.1, 9, 1.75);
    rg.step(1 / 60, 15 * 60, false);
    const later = window.__rgLife!.critters.flocks[0];
    return { before, after, later };
  });
  expect(flock.before.state).toBe('ground');
  expect(flock.before.scatters).toBe(0);
  expect(flock.after.state).toBe('flying');
  expect(flock.after.scatters).toBe(1);
  expect(flock.after.y).toBeGreaterThan(1.5);
  expect(flock.later.state).toBe('ground');

  // Draw-call / triangle budget at the busiest spot (plaza: townsfolk, birds, butterflies),
  // at Low and Medium; CPU time of the whole module per frame.
  const budget = await page.evaluate(() => {
    const rg = window.__rg!;
    const life = window.__rgLife!;
    const res: Record<string, { calls: number; tris: number; ms: number; folk: number }> = {};
    for (const q of ['low', 'medium'] as const) {
      rg.ctx.settings.set({ quality: q });
      rg.teleport(9.5, rg.ctx.world.heightAt(9.5, 10.6) + 0.1, 10.6, -0.6);
      rg.step(1 / 60, 40, false);
      const info = rg.ctx.renderer.info;
      info.autoReset = false;
      const measure = (): { calls: number; tris: number } => {
        info.reset();
        rg.render();
        return { calls: info.render.calls, tris: info.render.triangles };
      };
      measure();
      const on = measure();
      life.setVisible(false);
      const off = measure();
      life.setVisible(true);
      info.autoReset = true;
      life.resetStats();
      rg.step(1 / 60, 120, false);
      res[q] = { calls: on.calls - off.calls, tris: on.tris - off.tris, ms: life.stats().avgMs, folk: life.townsfolk.filter((t) => t.visible).length };
    }
    return res;
  });
  console.log('life budget', JSON.stringify(budget));
  for (const q of ['low', 'medium'] as const) {
    expect(budget[q].folk, q).toBeGreaterThan(0);
    expect(budget[q].calls, q).toBeLessThanOrEqual(25);
    // Wall-clock CPU time: 0.2 ms typical; the limit leaves room for a busy shared test machine.
    expect(budget[q].ms, q).toBeLessThan(1.0);
  }
  expect(budget.medium.tris).toBeLessThanOrEqual(60_000);
  expect(budget.low.tris).toBeLessThanOrEqual(budget.medium.tris);

  // An idle player next to a townsperson gets pointed at an attraction (never a gem).
  const point = await page.evaluate(() => {
    const rg = window.__rg!;
    const cafe = window.__rgLife!.townsfolk.find((t) => t.id === 'plaza-cafe')!;
    rg.teleport(cafe.x + 2.5, rg.ctx.world.heightAt(cafe.x + 2.5, cafe.z - 1) + 0.1, cafe.z - 1, -1.2);
    rg.step(1 / 60, 190, false);
    return window.__rgLife!.townsfolk.find((t) => t.id === 'plaza-cafe')!.pointAt;
  });
  expect(point).not.toBeNull();

  // Screenshots for humans (full, R-only, G-only): the plaza and the ranch.
  for (const [name, x, z, yaw] of [['plaza', 9.5, 10.6, -0.6], ['ranch', -50, 44, -1.57]] as const) {
    await page.evaluate(([x, z, yaw]) => {
      const rg = window.__rg!;
      rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.1, z, yaw);
      rg.step(1 / 60, 60, true);
    }, [x, z, yaw] as const);
    const png = await canvasShot(page, `${out}/${name}-full.png`);
    writeFileSync(`${out}/${name}-R.png`, channel(png, 0));
    writeFileSync(`${out}/${name}-G.png`, channel(png, 1));
  }

  const errors = await page.evaluate(() => window.__rg!.errors);
  expect(errors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
