/**
 * Vision toolkit blocks (rings, timing rings, reticles, glyph sprites, half symbols, dot pictures)
 * spawned through `window.__rgVision.toolkit`, checked on the real compositor output:
 *  (a) weak-layer blocks change only the weak channel, strong-layer blocks only the strong one,
 *      all 4 lens/eye combinations (strong channel and blue exactly unchanged);
 *  (b) behind a both-eye wall they change no pixel;
 *  (c) fade 0 changes no pixel, fade 0.5 changes less than fade 1;
 *  (d) dot pictures: the strong-eye frame is bit-identical for two different shapes (same seed);
 *  (e) half symbols: two symbols sharing the strong half give bit-identical strong-eye frames.
 * The statistical "weak pattern alone has no shape" proof is in tests/vision/toolkit-dots.test.ts.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { boot, canvasShot, channelDiff } from './helpers';
import { VisionLayer } from '../../src/types';
import type { EyeSettings } from '../../src/types';
import type { ToolkitBlockKind, ToolkitSpawnOptions, ToolkitSpawnResult } from '../../src/vision/toolkit/testApi';

test.describe.configure({ mode: 'serial' });

const OUT = 'test-results/glasses-toolkit';
let page: Page;
let consoleErrors: string[] = [];

const COMBOS: Array<{ eye: Pick<EyeSettings, 'leftLens' | 'weakEye'>; weak: 'r' | 'g'; strong: 'r' | 'g' }> = [
  { eye: { leftLens: 'red', weakEye: 'left' }, weak: 'r', strong: 'g' },
  { eye: { leftLens: 'red', weakEye: 'right' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'left' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'right' }, weak: 'r', strong: 'g' },
];

const BLOCKS: Array<{ block: ToolkitBlockKind; extra?: Partial<ToolkitSpawnOptions> }> = [
  { block: 'ring', extra: { progress: 0.7, segments: 0 } },
  { block: 'timingRing', extra: { t: 0.5 } },
  { block: 'reticle' },
  { block: 'glyph', extra: { text: '×3' } },
  { block: 'halfSymbol', extra: { symbol: { left: 'spiky', right: 'round' } } },
  { block: 'dotPicture', extra: { shape: 'heart', seed: 11, cells: 20 } },
];

const CH = { r: 0, g: 1, b: 2 } as const;
const maxOf = (d: ReturnType<typeof channelDiff>, c: 'r' | 'g' | 'b'): number => (c === 'r' ? d.maxR : c === 'g' ? d.maxG : d.maxB);

/** Pixels (> 2 levels) and summed |difference| of one channel inside a rect (fractions, top-left). */
function regionDiff(a: PNG, b: PNG, rect: ToolkitSpawnResult['rect'], ch: 'r' | 'g' | 'b'): { count: number; sum: number } {
  const x0 = Math.max(0, Math.floor(rect[0] * a.width));
  const x1 = Math.min(a.width, Math.ceil(rect[2] * a.width));
  const y0 = Math.max(0, Math.floor(rect[1] * a.height));
  const y1 = Math.min(a.height, Math.ceil(rect[3] * a.height));
  let count = 0;
  let sum = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * a.width + x) * 4 + CH[ch];
      const d = Math.abs(a.data[i] - b.data[i]);
      sum += d;
      if (d > 2) count++;
    }
  }
  return { count, sum };
}

async function frame(layers: { weak: boolean; strong: boolean }, path?: string): Promise<PNG> {
  await page.evaluate(
    ({ weak, strong, W, S }) => {
      const rg = window.__rg!;
      rg.setLayerVisible(W, weak);
      rg.setLayerVisible(S, strong);
      rg.render();
    },
    { ...layers, W: VisionLayer.WeakOnly, S: VisionLayer.StrongOnly },
  );
  return canvasShot(page, path);
}

const spawn = (o: ToolkitSpawnOptions): Promise<ToolkitSpawnResult> => page.evaluate((opts) => window.__rgVision!.toolkit.spawn(opts), o);
const removeAll = (): Promise<void> => page.evaluate(() => window.__rgVision!.toolkit.removeAll());

/**
 * One weak row and one strong row of every block, `distance` metres ahead (rows kept above the
 * plaza: lower down they sit "underground" and are correctly hidden by the world's depth).
 */
async function lineup(distance = 8, size = 1.5, yWeak = 2.3, yStrong = 0.6): Promise<{ weak: ToolkitSpawnResult[]; strong: ToolkitSpawnResult[] }> {
  const weak: ToolkitSpawnResult[] = [];
  const strong: ToolkitSpawnResult[] = [];
  const step = size * 1.25;
  for (let i = 0; i < BLOCKS.length; i++) {
    const b = BLOCKS[i];
    const base = { block: b.block, distance, size, offsetX: (i - (BLOCKS.length - 1) / 2) * step, ...b.extra };
    weak.push(await spawn({ ...base, layer: 'weak', offsetY: yWeak }));
    strong.push(await spawn({ ...base, layer: 'strong', offsetY: yStrong }));
  }
  return { weak, strong };
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  ({ consoleErrors } = await boot(page));
  mkdirSync(OUT, { recursive: true });
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 20);
    rg.setEye({ weakStrength: 1, crosstalkLimit: 1, strongContrast: 1 });
  });
});

test.afterAll(async () => {
  await page.close();
});

test('(a) every block touches only its own channel, all 4 lens/eye combinations', async () => {
  const rows = await lineup();
  for (const combo of COMBOS) {
    const tag = `${combo.eye.leftLens}-left/${combo.eye.weakEye}`;
    await page.evaluate((eye) => window.__rg!.setEye(eye), combo.eye);
    const all = await frame({ weak: true, strong: true });
    const noWeak = await frame({ weak: false, strong: true });
    const noStrong = await frame({ weak: true, strong: false });

    const dw = channelDiff(all, noWeak);
    expect(maxOf(dw, combo.strong), tag).toBe(0);
    expect(dw.maxB, tag).toBe(0);
    const ds = channelDiff(all, noStrong);
    expect(maxOf(ds, combo.weak), tag).toBe(0);
    expect(ds.maxB, tag).toBe(0);
    for (let i = 0; i < BLOCKS.length; i++) {
      const w = regionDiff(all, noWeak, rows.weak[i].rect, combo.weak);
      expect(w.count, `${tag} weak ${BLOCKS[i].block}`).toBeGreaterThan(40);
      const s = regionDiff(all, noStrong, rows.strong[i].rect, combo.strong);
      expect(s.count, `${tag} strong ${BLOCKS[i].block}`).toBeGreaterThan(40);
    }
  }
  await removeAll();
});

test('(b) behind a both-eye wall no block changes any pixel', async () => {
  await page.evaluate(() => window.__rg!.setEye({ leftLens: 'red', weakEye: 'left' }));
  await page.evaluate(() => window.__rgVision!.addTestObject({ layer: 'both', distance: 3, size: 9, offsetY: 0.6 }));
  await lineup();
  const on = await frame({ weak: true, strong: true });
  const off = await frame({ weak: false, strong: false });
  const d = channelDiff(on, off);
  expect([d.maxR, d.maxG, d.maxB]).toEqual([0, 0, 0]);
  await page.evaluate(() => window.__rgVision!.removeTestObjects());
  // Positive control: the same blocks without the wall do show.
  const open = channelDiff(await frame({ weak: true, strong: true }), await frame({ weak: false, strong: false }));
  expect(open.r).toBeGreaterThan(1000);
  expect(open.g).toBeGreaterThan(1000);
  await removeAll();
});

test('(c) fade 0 changes no pixel; fade 0.5 changes less than fade 1', async () => {
  await page.evaluate(() => window.__rg!.setEye({ leftLens: 'green', weakEye: 'left' })); // weak = g
  // Baseline: the same frame before the blocks exist (the game's own layer objects stay on).
  const none = await frame({ weak: true, strong: true });
  const rows = await lineup();
  const setFade = (f: number): Promise<void> => page.evaluate((v) => window.__rgVision!.toolkit.setFade(null, v), f);
  const full = await frame({ weak: true, strong: true });
  await setFade(0.5);
  const half = await frame({ weak: true, strong: true });
  await setFade(0);
  const zero = await frame({ weak: true, strong: true });
  await setFade(1);
  const dz = channelDiff(zero, none);
  expect([dz.maxR, dz.maxG, dz.maxB]).toEqual([0, 0, 0]);
  for (let i = 0; i < BLOCKS.length; i++) {
    for (const [rect, ch] of [
      [rows.weak[i].rect, 'g'],
      [rows.strong[i].rect, 'r'],
    ] as const) {
      const f1 = regionDiff(full, none, rect, ch).sum;
      const f05 = regionDiff(half, none, rect, ch).sum;
      expect(f05, BLOCKS[i].block).toBeGreaterThan(0);
      expect(f05, BLOCKS[i].block).toBeLessThan(f1 * 0.8);
    }
  }
  await removeAll();
});

test('(d) dot pictures: the strong-eye frame is identical for two shapes with the same seed', async () => {
  await page.evaluate(() => window.__rg!.setEye({ leftLens: 'red', weakEye: 'left' }));
  const { id } = await spawn({ block: 'dotPicture', layer: 'pair', distance: 6, size: 3.2, offsetY: 0.9, shape: 'star', seed: 7 });
  const strongStar = await frame({ weak: false, strong: true });
  const bothStar = await frame({ weak: true, strong: true });
  await page.evaluate((i) => window.__rgVision!.toolkit.setPicture(i, 'moon', 7), id);
  const strongMoon = await frame({ weak: false, strong: true });
  const bothMoon = await frame({ weak: true, strong: true });
  const ds = channelDiff(strongStar, strongMoon);
  expect([ds.maxR, ds.maxG, ds.maxB]).toEqual([0, 0, 0]);
  // Positive control: the weak eye's pattern (R here) does differ, G and blue do not.
  const dw = channelDiff(bothStar, bothMoon);
  expect(dw.r).toBeGreaterThan(300);
  expect([dw.maxG, dw.maxB]).toEqual([0, 0]);
  await removeAll();
});

test('(e) half symbols sharing the strong half give identical strong-eye frames', async () => {
  const { id } = await spawn({ block: 'halfSymbol', layer: 'pair', distance: 6, size: 2, offsetY: 0.9, symbol: { left: 'round', right: 'square' } });
  const a = await frame({ weak: false, strong: true });
  const aw = await frame({ weak: true, strong: true });
  await page.evaluate((i) => window.__rgVision!.toolkit.setSymbol(i, { left: 'spiky', right: 'square' }), id);
  const b = await frame({ weak: false, strong: true });
  const bw = await frame({ weak: true, strong: true });
  const d = channelDiff(a, b);
  expect([d.maxR, d.maxG, d.maxB]).toEqual([0, 0, 0]);
  const dw = channelDiff(aw, bw);
  expect(dw.r).toBeGreaterThan(100);
  expect([dw.maxG, dw.maxB]).toEqual([0, 0]);
  await removeAll();
});

/** R-only / G-only views: the channel as grey (what each eye sees through its lens). */
function channelImage(img: PNG, ch: 'r' | 'g'): Buffer {
  const out = new PNG({ width: img.width, height: img.height });
  for (let i = 0; i < img.data.length; i += 4) {
    const v = img.data[i + CH[ch]];
    out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
    out.data[i + 3] = 255;
  }
  return PNG.sync.write(out);
}

test('demo line-up screenshots (full, R-only, G-only)', async () => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.setEye({ leftLens: 'red', weakEye: 'left' });
    rg.render();
  });
  // Rows: weak-eye blocks, strong-eye blocks, then pairs on both-eye boards + glyph strings.
  await lineup(5, 1, 2.05, 0.8);
  await page.evaluate(() => {
    const v = window.__rgVision!;
    const t = v.toolkit;
    const y = -0.45;
    v.addTestObject({ layer: 'both', distance: 5.1, size: 1.25, offsetX: -3.1, offsetY: y, grey: 0.12 });
    v.addTestObject({ layer: 'both', distance: 5.1, size: 1.25, offsetX: -1.7, offsetY: y, grey: 0.12 });
    t.spawn({ block: 'halfSymbol', layer: 'pair', distance: 5, size: 0.9, offsetX: -3.1, offsetY: y, symbol: { left: 'point', right: 'round' } });
    t.spawn({ block: 'dotPicture', layer: 'pair', distance: 5, size: 1.15, offsetX: -1.7, offsetY: y, shape: 'fish', seed: 5, cells: 24 });
    t.spawn({ block: 'glyph', layer: 'weak', distance: 5, size: 0.4, offsetX: 1.1, offsetY: y + 0.28, text: '0123456789' });
    t.spawn({ block: 'glyph', layer: 'weak', distance: 5, size: 0.4, offsetX: 1.1, offsetY: y - 0.28, text: '×+!?←→↑↓✓' });
    t.spawn({ block: 'glyph', layer: 'strong', distance: 5, size: 0.4, offsetX: 3.4, offsetY: y, text: '★♥●■▲◆' });
  });
  const img = await frame({ weak: true, strong: true }, `${OUT}/lineup-full.png`);
  writeFileSync(`${OUT}/lineup-R.png`, channelImage(img, 'r'));
  writeFileSync(`${OUT}/lineup-G.png`, channelImage(img, 'g'));
  await removeAll();
  await page.evaluate(() => window.__rgVision!.removeTestObjects());
  await page.setViewportSize({ width: 640, height: 360 });
});

test('no errors', async () => {
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
