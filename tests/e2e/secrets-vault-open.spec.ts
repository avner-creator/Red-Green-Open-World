/**
 * QA8 M3: the vault door must visibly open. For every vault: the door leaf moves out of the
 * doorway over ~1.5 s, a fixed camera sees the doorway change, the treasure pays out, and the
 * weak-eye sequence sign stays weak-eye-only (only the weak channel changes when it is shown).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { SHOTS, boot, canvasShot } from './helpers';

test.describe.configure({ mode: 'serial' });

const OUT = 'test-results/secrets';
let page: Page;
let consoleErrors: string[] = [];

test.beforeAll(async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  page = await browser.newPage({ viewport: { width: 640, height: 360 } });
  ({ consoleErrors } = await boot(page, '&quality=low'));
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

/** Mean absolute RGB difference (0..255) inside a box given in fractions of the image. */
function regionDiff(a: PNG, b: PNG, x0: number, y0: number, x1: number, y1: number): number {
  let sum = 0;
  let n = 0;
  for (let y = Math.floor(y0 * a.height); y < Math.floor(y1 * a.height); y++) {
    for (let x = Math.floor(x0 * a.width); x < Math.floor(x1 * a.width); x++) {
      const i = (y * a.width + x) * 4;
      sum += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
      n += 3;
    }
  }
  return sum / n;
}

for (const door of [0, 1]) {
  test(`vault ${door}: the door visibly opens over ~1.5 s and the treasure pays`, async () => {
    const d = await page.evaluate((k) => window.__rgSecrets!.info().doors[k], door);
    /** Fixed camera 8 m in front of the door, looking into the doorway (HUD hidden). */
    const view = async (): Promise<PNG> => {
      await page.evaluate((k) => {
        const rg = window.__rg!;
        const dd = window.__rgSecrets!.info().doors[k];
        const c = rg.ctx.camera;
        rg.ctx.uiRoot.style.display = 'none';
        c.position.set(dd.x + Math.sin(dd.yaw) * 8, dd.y + 2, dd.z + Math.cos(dd.yaw) * 8);
        c.fov = 60;
        c.updateProjectionMatrix();
        c.lookAt(dd.x, dd.y + 1.8, dd.z);
        rg.render();
      }, door);
      return canvasShot(page);
    };
    const doorBox = (): Promise<number[]> => page.evaluate((k) => window.__rgSecrets!.doorBox(k), door);
    /** Hero parked far off to the side, out of the fixed view. */
    const park = (): Promise<void> =>
      page.evaluate((k) => {
        const rg = window.__rg!;
        const dd = window.__rgSecrets!.info().doors[k];
        const sx = dd.x + Math.sin(dd.yaw) * 10 + Math.cos(dd.yaw) * 14;
        const sz = dd.z + Math.cos(dd.yaw) * 10 - Math.sin(dd.yaw) * 14;
        rg.teleport(sx, rg.ctx.world.heightAt(sx, sz) + 0.2, sz, 0);
        rg.step(1 / 60, 5, false);
      }, door);
    await park();
    const before = await view();
    const boxBefore = await doorBox();
    expect(boxBefore[4]).toBeGreaterThan(d.y + 3);
    // Step on the pads in the weak eye's order.
    for (const b of d.sequence) {
      await page.evaluate(
        ({ k, b }) => {
          const rg = window.__rg!;
          const S = window.__rgSecrets!;
          const [ox, oz] = S.standPoint(k, 1, 6);
          const [x, z] = S.standPoint(k, b);
          rg.teleport(ox, rg.ctx.world.heightAt(ox, oz) + 0.1, oz, 0);
          rg.step(1 / 60, 3, false);
          rg.teleport(x, rg.ctx.world.heightAt(x, z) + 0.1, z, 0);
          rg.step(1 / 60, 12, false);
        },
        { k: door, b },
      );
    }
    expect((await page.evaluate((k) => window.__rgSecrets!.info().doors[k], door)).open).toBe(true);
    // The hero walks away while it opens (the door must open wherever the hero/camera is).
    await park();
    // Mid-way (~0.75 s) the leaf is on its way, not done: a real ~1.5 s motion.
    await page.evaluate(() => window.__rg!.step(1 / 60, 40, false));
    const boxMid = await doorBox();
    expect(boxMid[4]).toBeLessThan(boxBefore[4] - 0.4);
    expect(boxMid[4]).toBeGreaterThan(d.y + 0.3);
    await page.evaluate(() => window.__rg!.step(1 / 60, 120, false));
    const boxAfter = await doorBox();
    expect(boxAfter[4]).toBeLessThan(d.y + 0.3);
    const after = await view();
    // The doorway of a fixed view changes a lot (closed steel → the lit chamber inside).
    const diff = regionDiff(before, after, 0.38, 0.45, 0.62, 0.68);
    if (SHOTS || process.env.RG_KEEP) {
      writeFileSync(`${OUT}/vault${door}-before.png`, PNG.sync.write(before));
      writeFileSync(`${OUT}/vault${door}-after.png`, PNG.sync.write(after));
    }
    // Measured: closed door left up ≈ 9–11, door slid down ≈ 57–79.
    expect(diff).toBeGreaterThan(30);
    expect((await page.evaluate((k) => window.__rgSecrets!.info().doors[k], door)).treasure).toBe(true);
    // Whatever weak-eye-only things sit in the open vault stay weak-eye-only: hiding the weak
    // layer changes only the weak channel (default glasses: weak = R), never G or blue.
    await page.evaluate(() => window.__rg!.setLayerVisible(1, false));
    const noWeak = await view();
    await page.evaluate(() => window.__rg!.setLayerVisible(1, true));
    const withWeak = await view();
    let maxG = 0;
    let maxB = 0;
    for (let i = 0; i < noWeak.data.length; i += 4) {
      maxG = Math.max(maxG, Math.abs(noWeak.data[i + 1] - withWeak.data[i + 1]));
      maxB = Math.max(maxB, Math.abs(noWeak.data[i + 2] - withWeak.data[i + 2]));
    }
    expect([maxG, maxB]).toEqual([0, 0]);
    // Restart: the door is shut again.
    await page.evaluate(() => {
      const rg = window.__rg!;
      rg.ctx.uiRoot.style.display = '';
      rg.start();
      rg.step(1 / 60, 3, false);
    });
    const shut = await doorBox();
    expect(shut[4]).toBeCloseTo(boxBefore[4], 1);
  });
}

test('no errors', () => {
  expect(consoleErrors).toEqual([]);
});
