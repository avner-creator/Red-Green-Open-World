/**
 * Per-layer fade, Auto challenge and the session tally, read back from the WebGL canvas.
 * The compositor keeps the red-green rule under every runtime multiplier: weak-layer changes
 * touch only the weak channel, strong-eye changes only the strong channel, blue never.
 * The saved calibration is never written by any of this.
 */
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { PNG } from 'pngjs';
import { boot, canvasShot, channelDiff } from './helpers';
import { VisionLayer } from '../../src/types';
import type { EyeSettings, GlassesKind, GlassesTier } from '../../src/types';

test.describe.configure({ mode: 'serial' });

let page: Page;
let consoleErrors: string[] = [];
let weakId = 0;
let strongId = 0;

const COMBOS: Array<{ eye: Pick<EyeSettings, 'leftLens' | 'weakEye'>; weak: 'r' | 'g'; strong: 'r' | 'g' }> = [
  { eye: { leftLens: 'red', weakEye: 'left' }, weak: 'r', strong: 'g' },
  { eye: { leftLens: 'red', weakEye: 'right' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'left' }, weak: 'g', strong: 'r' },
  { eye: { leftLens: 'green', weakEye: 'right' }, weak: 'r', strong: 'g' },
];
const CH = { r: 0, g: 1, b: 2 } as const;
const maxOf = (d: ReturnType<typeof channelDiff>, c: 'r' | 'g' | 'b'): number => (c === 'r' ? d.maxR : c === 'g' ? d.maxG : d.maxB);

/** Sum of |a − b| in one channel. */
function sumDiff(a: PNG, b: PNG, c: 'r' | 'g' | 'b'): number {
  let s = 0;
  for (let i = CH[c]; i < a.data.length; i += 4) s += Math.abs(a.data[i] - b.data[i]);
  return s;
}

async function frame(layers: { weak: boolean; strong: boolean } = { weak: true, strong: true }, path?: string): Promise<PNG> {
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

async function results(n: number, hit: boolean, mechanic = 'glowflies', kind: GlassesKind = 'follow', tier: GlassesTier = 2): Promise<void> {
  await page.evaluate(
    ({ n, hit, mechanic, kind, tier }) => {
      for (let i = 0; i < n; i++) window.__rg!.ctx.events.emit('glasses:result', { mechanic, kind, tier, hit });
    },
    { n, hit, mechanic, kind, tier },
  );
}

/**
 * `n` hits that each count for the staircase: before every hit, a little more than the hit
 * spacing (4 s) of play is stepped without drawing (no easing happens without a render).
 */
async function pacedHits(n: number, mechanic = 'glowflies'): Promise<void> {
  await page.evaluate(
    ({ n, mechanic }) => {
      const rg = window.__rg!;
      for (let i = 0; i < n; i++) {
        rg.step(1 / 20, 90, false); // 4.5 s of play
        rg.ctx.events.emit('glasses:result', { mechanic, kind: 'follow', tier: 2, hit: true });
      }
    },
    { n, mechanic },
  );
}

const level = (): Promise<number> => page.evaluate(() => window.__rg!.ctx.vision.challenge!().level);

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  ({ consoleErrors } = await boot(page));
  ({ weakId, strongId } = await page.evaluate(() => {
    const rg = window.__rg!;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 60, 10);
    const v = window.__rgVision!;
    const weakId = v.addTestObject({ layer: 'weak', distance: 6, size: 1, offsetX: -1.6, offsetY: 0.4 });
    const strongId = v.addTestObject({ layer: 'strong', distance: 6, size: 1, offsetX: 1.6, offsetY: 0.4 });
    return { weakId, strongId };
  }));
});

test.afterAll(async () => {
  await page.close();
});

test('Auto challenge off: results change nothing (uniforms and frame bit-identical)', async () => {
  expect(await page.evaluate(() => window.__rg!.ctx.settings.get().autoChallenge)).toBeUndefined();
  const before = await page.evaluate(() => window.__rgChallenge!.effective());
  expect(before).toEqual({ strength: 1, limit: 1, contrast: 1, weakMul: 1, strongMul: 1 });
  const a = await frame();
  await results(3, true);
  await page.evaluate(() => window.__rgChallenge!.advance(5));
  const b = await frame();
  expect(await page.evaluate(() => window.__rgChallenge!.effective())).toEqual(before);
  const d = channelDiff(a, b);
  expect([d.maxR, d.maxG, d.maxB]).toEqual([0, 0, 0]);
});

test('forced weak / strong scales keep the channel rule, all 4 lens/eye combos', async () => {
  for (const combo of COMBOS) {
    const tag = `${combo.eye.leftLens}/${combo.eye.weakEye}`;
    await page.evaluate((eye) => {
      window.__rg!.setEye(eye);
      window.__rg!.ctx.vision.setChallenge!({});
    }, combo.eye);
    const base = await frame();
    await page.evaluate(() => window.__rg!.ctx.vision.setChallenge!({ weakScale: 0.5 }));
    const weakOnly = await frame();
    await page.evaluate(() => window.__rg!.ctx.vision.setChallenge!({ strongScale: 0.6 }));
    const strongOnly = await frame();
    const dw = channelDiff(base, weakOnly);
    expect(dw[combo.weak], tag).toBeGreaterThan(200);
    expect(maxOf(dw, combo.strong), tag).toBe(0);
    expect(dw.maxB, tag).toBe(0);
    const ds = channelDiff(base, strongOnly);
    expect(ds[combo.strong], tag).toBeGreaterThan(1000);
    expect(maxOf(ds, combo.weak), tag).toBe(0);
    expect(ds.maxB, tag).toBe(0);
  }
  await page.evaluate(() => {
    window.__rg!.setEye({ leftLens: 'red', weakEye: 'left' });
    window.__rg!.ctx.vision.setChallenge!(null);
  });
});

test('Auto challenge on: hits make the weak object fainter, never touching blue; calibration never saved', async () => {
  await page.evaluate(() => window.__rg!.ctx.settings.set({ autoChallenge: true }));
  const saved = await page.evaluate(() => ({ eye: window.__rg!.ctx.settings.get().eye, raw: localStorage.getItem('rgow.settings.v1') }));
  // Paced hits step play time (the world moves), so the identity frames are taken after them:
  // a render with dt 0 never eases, so the picture is still exactly the calibrated one.
  await pacedHits(6);
  const idOn = await frame();
  const idOff = await frame({ weak: false, strong: true });
  const idNone = await frame({ weak: false, strong: false });
  // Eased: nothing pops (a dt-0 render takes the new level number but moves no scale).
  const still = await page.evaluate(() => window.__rg!.ctx.vision.challenge!());
  expect([still.weakScale, still.strongScale, still.sizeScale]).toEqual([1, 1, 1]);
  expect(await page.evaluate(() => window.__rgChallenge!.target().level)).toBe(2);
  await page.evaluate(() => window.__rgChallenge!.advance(1));
  const mid = await page.evaluate(() => window.__rg!.ctx.vision.challenge!());
  expect(mid.weakScale).toBeLessThan(1);
  expect(mid.weakScale).toBeGreaterThan(0.86);
  await page.evaluate(() => window.__rgChallenge!.advance(10));
  const m = await page.evaluate(() => window.__rg!.ctx.vision.challenge!());
  expect(m.level).toBe(2);
  expect(m.weakScale).toBeCloseTo(0.86);
  expect(m.strongScale).toBeCloseTo(0.9);
  expect(m.sizeScale).toBeCloseTo(0.92);

  const chOn = await frame(undefined, 'test-results/glasses-challenge-level2.png');
  const chOff = await frame({ weak: false, strong: true });
  const chNone = await frame({ weak: false, strong: false });
  // The weak object's delta is smaller.
  expect(sumDiff(chOn, chOff, 'r')).toBeLessThan(sumDiff(idOn, idOff, 'r') * 0.95);
  expect(sumDiff(chOn, chOff, 'r')).toBeGreaterThan(0);
  // Without layer objects only the strong channel changes (contrast); blue never.
  const dn = channelDiff(idNone, chNone);
  expect(dn.maxR).toBe(0);
  expect(dn.maxB).toBe(0);
  expect(dn.g).toBeGreaterThan(1000);
  expect(channelDiff(idOn, chOn).maxB).toBe(0);

  // Up to the top and back down again: the saved calibration never changes.
  await pacedHits(12);
  await page.evaluate(() => window.__rgChallenge!.advance(20));
  expect(await level()).toBe(6);
  await results(6, false);
  await page.evaluate(() => window.__rgChallenge!.advance(20));
  await frame();
  expect(await level()).toBe(0);
  const after = await page.evaluate(() => ({ eye: window.__rg!.ctx.settings.get().eye, raw: localStorage.getItem('rgow.settings.v1') }));
  expect(after).toEqual(saved);
  const st = await page.evaluate(() => window.__rgChallenge!.staircase());
  expect(st.stepsUp).toBe(6);
  expect(st.stepsDown).toBe(6);
});

test('clamps: effective weak strength ≤ calibrated, contrast ≥ 0.4 at every level', async () => {
  await page.evaluate(() => window.__rg!.setEye({ weakStrength: 0.5, strongContrast: 0.45 }));
  for (let l = 0; l <= 6; l++) {
    const u = await page.evaluate((l) => {
      window.__rg!.ctx.vision.setChallenge!({ level: l });
      window.__rg!.render();
      return window.__rgChallenge!.effective();
    }, l);
    expect(u.strength * u.weakMul).toBeLessThanOrEqual(0.5);
    expect(u.contrast).toBeGreaterThanOrEqual(0.4);
    expect(u.contrast).toBeLessThanOrEqual(0.45);
  }
  await page.evaluate(() => {
    window.__rg!.ctx.vision.setChallenge!(null);
    window.__rg!.setEye({ weakStrength: 1, strongContrast: 1 });
  });
});

test('misses and the drought step back; a new session and turning it off reset to identity', async () => {
  await pacedHits(6);
  expect(await page.evaluate(() => window.__rgChallenge!.target().level)).toBe(2);
  await results(1, false);
  expect(await page.evaluate(() => window.__rgChallenge!.target().level)).toBe(1);
  // 41 s of play without a hit (simulation only) → one quiet step easier.
  await page.evaluate(() => window.__rg!.step(1 / 20, 820, false));
  const st = await page.evaluate(() => window.__rgChallenge!.staircase());
  expect(st.level).toBe(0);
  expect(st.seconds).toBeGreaterThan(40);

  await pacedHits(3);
  await page.evaluate(() => window.__rgChallenge!.settle());
  expect(await level()).toBe(1);
  await page.evaluate(() => window.__rg!.start());
  expect(await page.evaluate(() => window.__rg!.ctx.vision.challenge!())).toEqual({ level: 0, maxLevel: 6, weakScale: 1, strongScale: 1, sizeScale: 1 });

  await pacedHits(3);
  await page.evaluate(() => window.__rgChallenge!.settle());
  expect(await level()).toBe(1);
  await page.evaluate(() => window.__rg!.ctx.settings.set({ autoChallenge: false }));
  expect(await page.evaluate(() => window.__rg!.ctx.vision.challenge!())).toEqual({ level: 0, maxLevel: 6, weakScale: 1, strongScale: 1, sizeScale: 1 });
  await page.evaluate(() => window.__rg!.render());
  expect(await page.evaluate(() => window.__rgChallenge!.effective())).toEqual({ strength: 1, limit: 1, contrast: 1, weakMul: 1, strongMul: 1 });
});

test('setLayerFade fades one layer only, eased by render dt', async () => {
  const fade = (layer: VisionLayer, f: number, s = 0): Promise<void> =>
    page.evaluate(({ layer, f, s }) => window.__rg!.ctx.vision.setLayerFade!(layer, f, s), { layer, f, s });
  const full = await frame();
  const noWeak = await frame({ weak: false, strong: true });
  const noStrong = await frame({ weak: true, strong: false });

  await fade(VisionLayer.WeakOnly, 0);
  const w0 = await frame();
  const d0 = channelDiff(w0, noWeak);
  expect([d0.maxR, d0.maxG, d0.maxB]).toEqual([0, 0, 0]);
  await fade(VisionLayer.WeakOnly, 0.5);
  const w5 = await frame();
  expect(sumDiff(w5, noWeak, 'r')).toBeLessThan(sumDiff(full, noWeak, 'r') * 0.7);
  expect(sumDiff(w5, noWeak, 'r')).toBeGreaterThan(0);
  const dw = channelDiff(full, w5);
  expect(dw.maxG).toBe(0);
  expect(dw.maxB).toBe(0);

  // Eased: a 0-dt render never moves it; advancing time does.
  await fade(VisionLayer.WeakOnly, 1, 1);
  await page.evaluate(() => window.__rg!.render());
  expect(await page.evaluate(() => window.__rgChallenge!.fades().weak)).toBe(0.5);
  await page.evaluate(() => window.__rgChallenge!.advance(0.5));
  const midFade = await page.evaluate(() => window.__rgChallenge!.fades().weak);
  expect(midFade).toBeGreaterThan(0.5);
  expect(midFade).toBeLessThan(1);
  await page.evaluate(() => window.__rgChallenge!.advance(1));

  await fade(VisionLayer.StrongOnly, 0);
  const s0 = await frame();
  const ds0 = channelDiff(s0, noStrong);
  expect([ds0.maxR, ds0.maxG, ds0.maxB]).toEqual([0, 0, 0]);
  await fade(VisionLayer.StrongOnly, 0.5);
  const s5 = await frame();
  expect(sumDiff(s5, noStrong, 'g')).toBeLessThan(sumDiff(full, noStrong, 'g') * 0.7);
  const ds = channelDiff(full, s5);
  expect(ds.maxR).toBe(0);
  expect(ds.maxB).toBe(0);
  await fade(VisionLayer.StrongOnly, 1);
  await fade(VisionLayer.Both, 0); // ignored
  const back = channelDiff(full, await frame());
  expect([back.maxR, back.maxG, back.maxB]).toEqual([0, 0, 0]);
});

test('sessionSummary counts what was emitted', async () => {
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.ctx.settings.set({ autoChallenge: true });
    rg.start();
  });
  await results(2, true, 'glowflies', 'follow', 3);
  await results(1, false, 'glowflies', 'follow', 3);
  await results(4, true, 'oddOneOut', 'tellApart', 1);
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.ctx.events.emit('chest:key', { chestId: 'test' });
    rg.step(1 / 20, 40, false); // 2 s of play
    rg.ctx.session.end();
    rg.ctx.events.emit('glasses:result', { mechanic: 'late', kind: 'find', tier: 1, hit: true }); // after the end: ignored
  });
  const s = await page.evaluate(() => window.__rg!.ctx.vision.sessionSummary!());
  expect(s.rows).toEqual([
    { mechanic: 'glowflies', kind: 'follow', tier: 3, hits: 2, misses: 1 },
    { mechanic: 'oddOneOut', kind: 'tellApart', tier: 1, hits: 4, misses: 0 },
    { mechanic: 'chestKeys', kind: 'find', tier: 1, hits: 1, misses: 0 },
  ]);
  expect(s.seconds).toBeGreaterThanOrEqual(1.75);
  expect(s.seconds).toBeLessThanOrEqual(2.05);
  // All emitted at once: only the first hit counts for the staircase (paced), the miss resets it.
  expect(s.challenge).toEqual({ enabled: true, level: 0, maxLevel: 6, stepsUp: 0, stepsDown: 0 });
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.ctx.settings.set({ autoChallenge: false });
    rg.start();
  });
});

test('a burst of 14 hits in 2 s raises the level by at most one; the summary keeps all 14', async () => {
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.ctx.settings.set({ autoChallenge: true });
    rg.start();
  });
  await pacedHits(2); // two counted hits: one more counted hit steps up
  const r = await page.evaluate(() => {
    const rg = window.__rg!;
    rg.step(1 / 20, 90, false);
    const before = window.__rgChallenge!.target().level;
    for (let i = 0; i < 14; i++) {
      rg.ctx.events.emit('glasses:result', { mechanic: 'foamSecret', kind: 'find', tier: 2, hit: true });
      rg.step(1 / 20, 3, false); // 14 × 0.15 s ≈ 2 s of play
    }
    return { before, after: window.__rgChallenge!.target().level, st: window.__rgChallenge!.staircase() };
  });
  expect(r.before).toBe(0);
  expect(r.after - r.before).toBeLessThanOrEqual(1);
  expect(r.after).toBe(1); // the burst's first hit completed the streak; the other 13 were paced out
  expect(r.st.stepsUp).toBe(1);
  const s = await page.evaluate(() => window.__rg!.ctx.vision.sessionSummary!());
  expect(s.rows).toEqual([
    { mechanic: 'glowflies', kind: 'follow', tier: 2, hits: 2, misses: 0 },
    { mechanic: 'foamSecret', kind: 'find', tier: 2, hits: 14, misses: 0 },
  ]);
  await page.evaluate(() => {
    const rg = window.__rg!;
    rg.ctx.settings.set({ autoChallenge: false });
    rg.start();
  });
});

test('debug view shows the layer mask; layerCoverage finds the test object', async () => {
  const normal = await frame();
  const mask0Width = (): number => normal.width;
  const cov = async (): Promise<{ pixels: number; bbox: { x0: number; y0: number; x1: number; y1: number } | null }> =>
    page.evaluate((W) => window.__rgChallenge!.layerCoverage(W), VisionLayer.WeakOnly);
  const withObj = await cov();
  await page.evaluate((id) => window.__rgVision!.setTestVisible(id, false), weakId);
  await frame();
  const without = await cov();
  await page.evaluate((id) => window.__rgVision!.setTestVisible(id, true), weakId);
  const objPixels = withObj.pixels - without.pixels;
  expect(objPixels).toBeGreaterThan(1000);
  expect(objPixels).toBeLessThan(30_000);
  expect(withObj.bbox).not.toBeNull();
  // Without other weak-eye things in view, the box is the test object's own footprint.
  if (without.pixels === 0) expect(withObj.bbox!.x1).toBeLessThan(mask0Width() / 2);

  await page.evaluate(() => window.__rgChallenge!.setDebugView('weak'));
  const mask = await frame(undefined, 'test-results/glasses-challenge-weak-mask.png');
  let n = 0;
  let x0 = mask.width;
  let x1 = -1;
  let grey = true;
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      const i = (y * mask.width + x) * 4;
      if (mask.data[i] !== mask.data[i + 1] || mask.data[i] !== mask.data[i + 2]) grey = false;
      if (mask.data[i] > 0) {
        n++;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
      }
    }
  }
  expect(grey).toBe(true);
  expect(Math.abs(n - withObj.pixels)).toBeLessThan(withObj.pixels * 0.1 + 20);
  expect(Math.abs(x0 - withObj.bbox!.x0)).toBeLessThanOrEqual(2);
  expect(Math.abs(x1 - withObj.bbox!.x1)).toBeLessThanOrEqual(2);
  // The test object sits left of centre.
  expect((withObj.bbox!.x0 + withObj.bbox!.x1) / 2).toBeLessThan(mask.width / 2);
  // Strong mask too.
  await page.evaluate(() => window.__rgChallenge!.setDebugView('strong'));
  await frame();
  const sc = await page.evaluate((S) => window.__rgChallenge!.layerCoverage(S), VisionLayer.StrongOnly);
  expect(sc.pixels).toBeGreaterThan(1000);
  expect((sc.bbox!.x0 + sc.bbox!.x1) / 2).toBeGreaterThan(mask.width / 2);
  await page.evaluate(() => window.__rgChallenge!.setDebugView('off'));
  const d = channelDiff(normal, await frame());
  expect([d.maxR, d.maxG, d.maxB]).toEqual([0, 0, 0]);
  expect(strongId).toBeGreaterThan(0);
});

test('no errors', async () => {
  expect(await page.evaluate(() => window.__rg!.errors)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
