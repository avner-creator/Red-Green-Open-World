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

export interface ScreenRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Every visible HUD element's rectangle (CSS px, canvas-relative), with its class for messages. */
export async function hudRects(page: Page): Promise<(ScreenRect & { what: string })[]> {
  return page.evaluate(() => {
    const ctx = window.__rg!.ctx;
    const c = ctx.canvas.getBoundingClientRect();
    const out: { x0: number; y0: number; x1: number; y1: number; what: string }[] = [];
    for (const el of Array.from(ctx.uiRoot.querySelectorAll<HTMLElement>('*'))) {
      const vis = (el as HTMLElement & { checkVisibility?: (o: object) => boolean }).checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) ?? true;
      if (!vis) continue;
      const r = el.getBoundingClientRect();
      const area = r.width * r.height;
      // Skip empty boxes and full-screen layers (vignettes, overlays that only tint).
      if (area < 16 || area > c.width * c.height * 0.25) continue;
      if (r.right < c.left || r.left > c.right || r.bottom < c.top || r.top > c.bottom) continue;
      const cls = (el.className as unknown as { baseVal?: string })?.baseVal ?? String(el.className);
      out.push({ x0: r.left - c.left, y0: r.top - c.top, x1: r.right - c.left, y1: r.bottom - c.top, what: `${el.tagName.toLowerCase()}.${cls.split(' ').join('.')}` });
    }
    return out;
  });
}

/** The booth prompt's screen rectangle (CSS px) for the current camera, or null when hidden/behind. */
export async function promptRect(page: Page, id: string): Promise<(ScreenRect & { id: string }) | null> {
  return page.evaluate((i) => {
    const ctx = window.__rg!.ctx;
    const d = window.__rgGlasses!.boothDebug(i) as { promptWorld: { id: string; x: number; y: number; z: number; size: number } | null } | null;
    const p = d?.promptWorld;
    if (!p) return null;
    const cam = ctx.camera;
    cam.updateMatrixWorld();
    const e = cam.matrixWorld.elements;
    const W = ctx.canvas.clientWidth;
    const H = ctx.canvas.clientHeight;
    let r: { x0: number; y0: number; x1: number; y1: number } | null = null;
    // The prompt bobs ±0.12 m: test the whole band it covers.
    const h = p.size / 2;
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const v = cam.position.clone().set(p.x + (e[0] * a + e[4] * b) * h, p.y + (e[1] * a + e[5] * b) * h + b * 0.12, p.z + (e[2] * a + e[6] * b) * h);
      v.applyMatrix4(cam.matrixWorldInverse);
      if (v.z > -0.1) return null;
      v.applyMatrix4(cam.projectionMatrix);
      const x = (v.x * 0.5 + 0.5) * W;
      const y = (0.5 - v.y * 0.5) * H;
      r = r ? { x0: Math.min(r.x0, x), y0: Math.min(r.y0, y), x1: Math.max(r.x1, x), y1: Math.max(r.y1, y) } : { x0: x, y0: y, x1: x, y1: y };
    }
    return r && { ...r, id: p.id };
  }, id);
}

/** Central safe area (fractions of the canvas) the prompt must lie in (`booth/view.ts` PROMPT_SAFE, a little looser). */
export const PROMPT_SAFE_E2E = { x0: 0.2, x1: 0.8, y0: 0.15, y1: 0.72 } as const;

/**
 * The booth prompt seen from the current camera: on screen, inside the central safe area and
 * clear of every visible HUD element. Returns the reasons it is not.
 */
export async function checkPromptClear(page: Page, id: string): Promise<{ ok: boolean; why: string[]; prompt: ScreenRect | null }> {
  const r = await promptRect(page, id);
  if (!r) return { ok: false, why: ['no prompt on screen'], prompt: null };
  const why: string[] = [];
  const { W, H } = await page.evaluate(() => ({ W: window.__rg!.ctx.canvas.clientWidth, H: window.__rg!.ctx.canvas.clientHeight }));
  const S = PROMPT_SAFE_E2E;
  const n = (v: number): number => Math.round(v);
  if (r.x0 < S.x0 * W || r.x1 > S.x1 * W || r.y0 < S.y0 * H || r.y1 > S.y1 * H) why.push(`outside the safe area: ${n(r.x0)},${n(r.y0)}–${n(r.x1)},${n(r.y1)} of ${W}x${H}`);
  for (const h of await hudRects(page)) {
    if (r.x0 < h.x1 && h.x0 < r.x1 && r.y0 < h.y1 && h.y0 < r.y1) why.push(`under HUD ${h.what} (${n(h.x0)},${n(h.y0)}–${n(h.x1)},${n(h.y1)})`);
  }
  return { ok: why.length === 0, why, prompt: r };
}
