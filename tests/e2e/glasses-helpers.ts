/**
 * Proof helpers for glasses-play mechanics (built on ./helpers.ts). Use them from a spec whose
 * page booted with `boot()`, froze time (`__rg.freeze(true)`) and started a session.
 *
 *  - `expectLayerOnlyTouchesOwnChannel(page)`: for all 4 lens/eye combinations, the frame with all
 *    layers vs the frame with the WeakOnly (or StrongOnly) layer hidden: only that layer's channel
 *    changes; the other channel and blue are bit-identical.
 *  - `expectAnswerBlindWithoutWeakEye(page, { setA, setB })`: with the WeakOnly layer hidden, two
 *    different answers give bit-identical frames (the strong eye gets no clue); with it shown they
 *    differ, in the weak channel only.
 *  - `expectDrawBudget(page, id, max)`: the mechanic + its board stay within the draw budget.
 *
 * `setA` / `setB` must change the answer WITHOUT advancing time (e.g. `__rgGlasses.force(id,
 * { answer: 0 })`); the helpers re-render the frozen frame themselves.
 */
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { PNG } from 'pngjs';
import { canvasShot, channelDiff } from './helpers';
import { VisionLayer } from '../../src/types';
import type { EyeSettings } from '../../src/types';

export type Ch = 'r' | 'g';

export const COMBOS: ReadonlyArray<{ eye: Pick<EyeSettings, 'leftLens' | 'weakEye'>; weak: Ch; strong: Ch }> = [
  { eye: { leftLens: 'red', weakEye: 'left' }, weak: 'r', strong: 'g' },
  { eye: { leftLens: 'red', weakEye: 'right' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'left' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'right' }, weak: 'r', strong: 'g' },
];

export type Diff = ReturnType<typeof channelDiff>;
export const maxOf = (d: Diff, c: Ch | 'b'): number => (c === 'r' ? d.maxR : c === 'g' ? d.maxG : d.maxB);

/** Set layer visibility, re-render the same frozen frame and read the canvas back. */
export async function layerFrame(page: Page, layers: { weak: boolean; strong: boolean }): Promise<PNG> {
  await page.evaluate(
    ({ weak, strong, W, S }) => {
      const rg = window.__rg!;
      rg.setLayerVisible(W, weak);
      rg.setLayerVisible(S, strong);
      rg.render();
    },
    { ...layers, W: VisionLayer.WeakOnly, S: VisionLayer.StrongOnly },
  );
  return canvasShot(page);
}

export async function setEye(page: Page, eye: Partial<EyeSettings>): Promise<void> {
  await page.evaluate((e) => window.__rg!.setEye(e), eye);
}

/**
 * For all 4 lens/eye combinations: hiding the `layer` changes at least `minPixels` pixels of its
 * own channel and leaves the other channel and blue exactly equal. `layer: 'both'` checks the
 * WeakOnly and the StrongOnly layer in one pass (3 frames per combination instead of 4). Leaves
 * both layers visible and the eye settings at red-left / weak-left.
 */
export async function expectLayerOnlyTouchesOwnChannel(
  page: Page,
  opts: { layer?: 'weak' | 'strong' | 'both'; minPixels?: number; label?: string } = {},
): Promise<void> {
  const layers: ('weak' | 'strong')[] = opts.layer === 'both' ? ['weak', 'strong'] : [opts.layer ?? 'weak'];
  const minPixels = opts.minPixels ?? 30;
  for (const combo of COMBOS) {
    await setEye(page, combo.eye);
    const all = await layerFrame(page, { weak: true, strong: true });
    for (const layer of layers) {
      const tag = `${opts.label ?? ''} ${layer} layer, ${combo.eye.leftLens}-left, weak ${combo.eye.weakEye}`;
      const without = await layerFrame(page, { weak: layer !== 'weak', strong: layer !== 'strong' });
      const d = channelDiff(all, without);
      const own = layer === 'weak' ? combo.weak : combo.strong;
      const other = layer === 'weak' ? combo.strong : combo.weak;
      expect(d[own], `${tag}: own channel changes`).toBeGreaterThanOrEqual(minPixels);
      expect(maxOf(d, other), `${tag}: other channel untouched`).toBe(0);
      expect(d.maxB, `${tag}: blue untouched`).toBe(0);
    }
  }
  await setEye(page, COMBOS[0].eye);
  await layerFrame(page, { weak: true, strong: true });
}

/**
 * The strong eye alone cannot tell answer A from answer B: with the WeakOnly layer hidden the two
 * frames are bit-identical (r, g and b). Positive control: with it shown they differ in the weak
 * channel only (≥ `minPixels`). Runs for `combos` (default: all 4).
 */
export async function expectAnswerBlindWithoutWeakEye(
  page: Page,
  opts: { setA: () => Promise<void>; setB: () => Promise<void>; minPixels?: number; combos?: typeof COMBOS; label?: string },
): Promise<void> {
  const minPixels = opts.minPixels ?? 30;
  for (const combo of opts.combos ?? COMBOS) {
    const tag = `${opts.label ?? ''} ${combo.eye.leftLens}-left, weak ${combo.eye.weakEye}`;
    await setEye(page, combo.eye);
    await opts.setA();
    const a0 = await layerFrame(page, { weak: false, strong: true });
    await opts.setB();
    const b0 = await layerFrame(page, { weak: false, strong: true });
    const blind = channelDiff(a0, b0);
    expect([blind.maxR, blind.maxG, blind.maxB], `${tag}: answer hidden without the weak eye`).toEqual([0, 0, 0]);

    await opts.setA();
    const a1 = await layerFrame(page, { weak: true, strong: true });
    await opts.setB();
    const b1 = await layerFrame(page, { weak: true, strong: true });
    const seen = channelDiff(a1, b1);
    expect(seen[combo.weak], `${tag}: answer visible to the weak eye`).toBeGreaterThanOrEqual(minPixels);
    expect(maxOf(seen, combo.strong), `${tag}: strong channel identical`).toBe(0);
    expect(seen.maxB, `${tag}: blue identical`).toBe(0);
  }
  await setEye(page, COMBOS[0].eye);
}

/** Mechanic `id` (its visible objects + its board) issues at most `max` draw calls. */
export async function expectDrawBudget(page: Page, id: string, max = 6): Promise<number> {
  const n = await page.evaluate((i) => window.__rgGlasses!.draws(i), id);
  expect(n, `${id} draw calls`).toBeLessThanOrEqual(max);
  expect(n, `${id} has its board`).toBeGreaterThanOrEqual(1);
  return n;
}

/** Luminance spread (p95 − p5) of one channel inside a rect of a canvas readback. */
export function channelSpread(img: PNG, rect: { x0: number; y0: number; x1: number; y1: number }, ch: 0 | 1 | 2): number {
  const vals: number[] = [];
  const x0 = Math.max(0, Math.floor(rect.x0));
  const x1 = Math.min(img.width, Math.ceil(rect.x1));
  const y0 = Math.max(0, Math.floor(rect.y0));
  const y1 = Math.min(img.height, Math.ceil(rect.y1));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) vals.push(img.data[(y * img.width + x) * 4 + ch]);
  if (vals.length < 10) return 0;
  vals.sort((a, b) => a - b);
  return vals[Math.floor(vals.length * 0.95)] - vals[Math.floor(vals.length * 0.05)];
}

/** Copy of `img` with every channel set to channel `ch` (what one eye sees, as grey). */
export function channelOnly(img: PNG, ch: 0 | 1): PNG {
  const out = { width: img.width, height: img.height, data: Buffer.from(img.data) } as PNG;
  for (let i = 0; i < out.data.length; i += 4) {
    const v = img.data[i + ch];
    out.data[i] = out.data[i + 1] = out.data[i + 2] = v;
    out.data[i + 3] = 255;
  }
  return out;
}
