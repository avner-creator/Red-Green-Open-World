/**
 * Dichoptic channel tests: the same frozen frame rendered with and without layer objects.
 * WeakOnly objects must change the weak channel and leave the strong channel and blue
 * bit-identical; StrongOnly objects the mirror image. All 4 lens/eye combinations.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { PNG } from 'pngjs';
import { boot, channelDiff, shot } from './helpers';
import { VisionLayer } from '../../src/types';
import type { EyeSettings } from '../../src/types';

test.describe.configure({ mode: 'serial' });

let page: Page;
let consoleErrors: string[] = [];

const COMBOS: Array<{ eye: Pick<EyeSettings, 'leftLens' | 'weakEye'>; weak: 'r' | 'g'; strong: 'r' | 'g' }> = [
  { eye: { leftLens: 'red', weakEye: 'left' }, weak: 'r', strong: 'g' },
  { eye: { leftLens: 'red', weakEye: 'right' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'left' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'right' }, weak: 'r', strong: 'g' },
];

const maxOf = (d: ReturnType<typeof channelDiff>, c: 'r' | 'g' | 'b'): number => (c === 'r' ? d.maxR : c === 'g' ? d.maxG : d.maxB);

/** Set layer visibility, re-render the same frozen frame, screenshot. */
async function frame(layers: { weak: boolean; strong: boolean }): Promise<PNG> {
  await page.evaluate(
    ({ weak, strong, W, S }) => {
      const rg = window.__rg!;
      rg.setLayerVisible(W, weak);
      rg.setLayerVisible(S, strong);
      rg.render();
    },
    { ...layers, W: VisionLayer.WeakOnly, S: VisionLayer.StrongOnly },
  );
  return shot(page);
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  ({ consoleErrors } = await boot(page));
  // The boot overlay fades out over ~0.5 s; wait so it can't differ between screenshots.
  await page.waitForSelector('#boot', { state: 'detached', timeout: 10_000 });
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 20);
    // Deterministic layer objects in front of the camera (plus the stub world's gems).
    const v = window.__rgVision!;
    v.addTestObject({ layer: 'weak', distance: 6, size: 1, offsetX: -1.6, offsetY: 0.4 });
    v.addTestObject({ layer: 'weak', distance: 8, size: 1.2, offsetX: 0, offsetY: 2.2 }); // over the sky
    v.addTestObject({ layer: 'strong', distance: 6, size: 1, offsetX: 1.6, offsetY: 0.4 });
  });
});

test.afterAll(async () => {
  await page.close();
});

for (const combo of COMBOS) {
  test(`lens ${combo.eye.leftLens}-left, weak eye ${combo.eye.weakEye}: each layer touches only its own channel`, async () => {
    await page.evaluate((eye) => window.__rg!.setEye(eye), combo.eye);
    const all = await frame({ weak: true, strong: true });
    const noWeak = await frame({ weak: false, strong: true });
    const noStrong = await frame({ weak: true, strong: false });

    const dw = channelDiff(all, noWeak);
    expect(dw[combo.weak]).toBeGreaterThan(400);
    expect(maxOf(dw, combo.strong)).toBe(0);
    expect(dw.maxB).toBe(0);

    const ds = channelDiff(all, noStrong);
    expect(ds[combo.strong]).toBeGreaterThan(200);
    expect(maxOf(ds, combo.weak)).toBe(0);
    expect(ds.maxB).toBe(0);
  });
}

test('strong-eye contrast changes only the strong channel; crosstalk limit caps the weak delta', async () => {
  await page.evaluate(() => window.__rg!.setEye({ leftLens: 'red', weakEye: 'left', strongContrast: 1, crosstalkLimit: 1 }));
  const base = await frame({ weak: true, strong: true });
  await page.evaluate(() => window.__rg!.setEye({ strongContrast: 0.4 }));
  const low = await frame({ weak: true, strong: true });
  const dc = channelDiff(base, low);
  expect(dc.g).toBeGreaterThan(10_000);
  expect(dc.maxR).toBe(0);
  expect(dc.maxB).toBe(0);

  await page.evaluate(() => window.__rg!.setEye({ strongContrast: 1, crosstalkLimit: 0.1 }));
  const limited = await frame({ weak: true, strong: false });
  const none = await frame({ weak: false, strong: false });
  const dl = channelDiff(limited, none);
  expect(dl.r).toBeGreaterThan(100);
  expect(dl.maxR).toBeLessThanOrEqual(Math.ceil(0.1 * 255) + 1);
  await page.evaluate(() => window.__rg!.setEye({ crosstalkLimit: 1 }));
});

test('layer objects behind main-scene geometry change no pixels', async () => {
  const ids = await page.evaluate(() => {
    const v = window.__rgVision!;
    v.removeTestObjects();
    const wall = v.addTestObject({ layer: 'both', distance: 3, size: 2.5, offsetY: 0.6 });
    const hidden = v.addTestObject({ layer: 'weak', distance: 9, size: 1, offsetY: 0.6 });
    const hiddenStrong = v.addTestObject({ layer: 'strong', distance: 9, size: 1, offsetX: 1.5, offsetY: 0.6 });
    return { wall, hidden, hiddenStrong };
  });
  const setVis = (id: number, vis: boolean): Promise<void> =>
    page.evaluate(({ id, vis }) => window.__rgVision!.setTestVisible(id, vis), { id, vis });

  // Behind the wall: no effect at all.
  const behind = await frame({ weak: true, strong: true });
  await setVis(ids.hidden, false);
  await setVis(ids.hiddenStrong, false);
  const without = await frame({ weak: true, strong: true });
  const d = channelDiff(behind, without);
  expect([d.maxR, d.maxG, d.maxB]).toEqual([0, 0, 0]);

  // Positive control: without the wall the same objects are visible.
  await setVis(ids.wall, false);
  const open = await frame({ weak: true, strong: true });
  await setVis(ids.hidden, true);
  await setVis(ids.hiddenStrong, true);
  const shown = await frame({ weak: true, strong: true });
  const d2 = channelDiff(open, shown);
  expect(d2.r).toBeGreaterThan(100);
  expect(d2.g).toBeGreaterThan(100);
  expect(d2.maxB).toBe(0);
  await page.evaluate(() => window.__rgVision!.removeTestObjects());
});

test('calibration pattern goes through the same maths', async () => {
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.setEye({ leftLens: 'red', weakEye: 'left', weakStrength: 1, crosstalkLimit: 1, strongContrast: 1 });
    rg.ctx.vision.openCalibration(() => {});
    rg.render();
  });
  expect(await page.evaluate(() => window.__rgVision!.calibrationOpen())).toBe(true);
  const img = await shot(page, 'test-results/vision-calibration.png');
  const px = (x: number, y: number): [number, number, number] => {
    const i = (Math.round(y) * img.width + Math.round(x)) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
  };
  const patternH = img.height * (1 - 0.38);
  const rowH = patternH / 2;
  const greys = [0, 0.25, 0.5, 0.75, 1];
  for (let col = 0; col < 5; col++) {
    const x = (col + 0.5) * (img.width / 5);
    const grey = Math.round(greys[col] * 255);
    const ring = px(x, rowH * 0.58); // ring core: weak-eye only (weak = R here)
    const square = px(x, rowH * 1.58); // square: strong-eye only (G)
    expect(Math.abs(ring[1] - grey)).toBeLessThanOrEqual(1);
    expect(Math.abs(ring[2] - grey)).toBeLessThanOrEqual(1);
    expect(Math.abs(ring[0] - grey)).toBeGreaterThan(70);
    expect(Math.abs(square[0] - grey)).toBeLessThanOrEqual(1);
    expect(Math.abs(square[2] - grey)).toBeLessThanOrEqual(1);
    expect(Math.abs(square[1] - grey)).toBeGreaterThan(70);
  }
  // Keyboard: sliders and toggles drive the settings live.
  await page.focus('#rgv-weakStrength');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  const eye = await page.evaluate(() => window.__rg!.ctx.settings.get().eye);
  expect(eye.weakStrength).toBeCloseTo(0.99);
  expect(eye.weakEye).toBe('right');
  await page.evaluate(() => window.__rg!.setEye({ weakStrength: 1, weakEye: 'left' }));
  // Escape closes it and the game frame comes back.
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__rgVision!.calibrationOpen())).toBe(false);
});

test('no errors', async () => {
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
