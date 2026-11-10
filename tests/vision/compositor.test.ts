import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/config';
import { COMPOSITE } from '../../src/vision/constants';
import { applyContrast, compositeLayer, compositePixel, deriveChannels, layerTarget, linearToSrgb } from '../../src/vision/math';
import { compositeFragment, depthCopyFragment } from '../../src/vision/shaders';
import type { EyeSettings } from '../../src/types';

const eye = (patch: Partial<EyeSettings> = {}): EyeSettings => ({ ...DEFAULT_SETTINGS.eye, ...patch });
const COMBOS: Array<Pick<EyeSettings, 'leftLens' | 'weakEye'>> = [
  { leftLens: 'red', weakEye: 'left' },
  { leftLens: 'red', weakEye: 'right' },
  { leftLens: 'green', weakEye: 'left' },
  { leftLens: 'green', weakEye: 'right' },
];
const NONE = { L: 0, M: 0 };
const FULL = { L: 1, M: 1 };

describe('deriveChannels', () => {
  it('weak channel is the colour of the lens in front of the weak eye', () => {
    expect(COMBOS.map((c) => deriveChannels(c).weak)).toEqual(['r', 'g', 'g', 'r']);
    for (const c of COMBOS) {
      const ch = deriveChannels(c);
      expect(ch.strong).not.toBe(ch.weak);
    }
  });
});

describe('layer target f(L, bg)', () => {
  it('keeps objects clearly visible on every background', () => {
    for (let i = 0; i <= 100; i++) {
      const bg = i / 100;
      for (const L of [0, 0.5, 1]) {
        const minDelta = 0.5 * COMPOSITE.popMin - 1e-9;
        expect(Math.abs(layerTarget(L, bg) - bg)).toBeGreaterThanOrEqual(minDelta);
      }
    }
  });
  it('brightens on dark, darkens on bright, strong contrast on mid-grey', () => {
    expect(layerTarget(1, 0)).toBeCloseTo(1);
    expect(layerTarget(1, 1)).toBeCloseTo(0);
    expect(layerTarget(1, 0.2)).toBeGreaterThan(0.2);
    expect(layerTarget(1, 0.8)).toBeLessThan(0.8);
    expect(Math.abs(layerTarget(1, 0.5) - 0.5)).toBeGreaterThanOrEqual(0.5 - 1e-9);
    expect(Math.abs(layerTarget(1, 0.49) - 0.49)).toBeGreaterThan(0.45);
    expect(Math.abs(layerTarget(1, 0.51) - 0.51)).toBeGreaterThan(0.45);
  });
  it('stays inside 0..1', () => {
    for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) {
      const v = layerTarget(i / 20, j / 20);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe('compositeLayer', () => {
  it('mask 0 returns the background exactly', () => {
    for (const bg of [0, 0.123, 0.5, 0.987, 1]) expect(compositeLayer(bg, 1, 0, 1, 1)).toBe(bg);
  });
  it('crosstalk limit clamps the delta', () => {
    for (const bg of [0, 0.3, 0.5, 0.7, 1]) {
      expect(Math.abs(compositeLayer(bg, 1, 1, 1, 0.1) - bg)).toBeLessThanOrEqual(0.1 + 1e-9);
    }
  });
  it('strength scales the delta linearly', () => {
    const full = compositeLayer(0.2, 1, 1, 1, 1) - 0.2;
    expect(compositeLayer(0.2, 1, 1, 0.5, 1) - 0.2).toBeCloseTo(full / 2);
    expect(compositeLayer(0.2, 1, 1, 0, 1)).toBe(0.2);
  });
});

describe('compositePixel', () => {
  const bgs: Array<[number, number, number]> = [
    [0, 0, 0], [1, 1, 1], [0.5, 0.5, 0.5], [0.2, 0.7, 0.4], [0.9, 0.1, 0.6],
  ];
  for (const combo of COMBOS) {
    const e = eye(combo);
    const ch = deriveChannels(combo);
    const wi = ch.weak === 'r' ? 0 : 1;
    const si = 1 - wi;
    it(`${combo.leftLens}-left lens, weak ${combo.weakEye}: weak object changes only the weak channel`, () => {
      for (const bg of bgs) {
        const without = compositePixel(bg, e, NONE, NONE);
        const withObj = compositePixel(bg, e, FULL, NONE);
        expect(withObj[si]).toBe(without[si]);
        expect(withObj[2]).toBe(bg[2]);
        expect(Math.abs(withObj[wi] - without[wi])).toBeGreaterThanOrEqual(0.29);
      }
    });
    it(`${combo.leftLens}-left lens, weak ${combo.weakEye}: strong object changes only the strong channel`, () => {
      for (const bg of bgs) {
        const without = compositePixel(bg, e, NONE, NONE);
        const withObj = compositePixel(bg, e, NONE, FULL);
        expect(withObj[wi]).toBe(without[wi]);
        expect(withObj[2]).toBe(bg[2]);
        expect(Math.abs(withObj[si] - without[si])).toBeGreaterThanOrEqual(0.29);
      }
    });
  }
  it('strong-eye contrast scales only the strong channel around mid-grey', () => {
    const e = eye({ strongContrast: 0.4 });
    const out = compositePixel([0.2, 0.9, 0.3], e, NONE, NONE);
    expect(out[0]).toBe(0.2); // weak = R (red lens on the left, weak left)
    expect(out[1]).toBeCloseTo(applyContrast(0.9, 0.4));
    expect(out[1]).toBeCloseTo(0.66);
    expect(out[2]).toBe(0.3);
  });
});

describe('shader stays in sync with the TS mirror', () => {
  it('embeds the shared constants', () => {
    expect(compositeFragment).toContain(COMPOSITE.popMin.toFixed(6));
    expect(compositeFragment).toContain(COMPOSITE.pivot.toFixed(6));
    expect(compositeFragment).toContain(COMPOSITE.contrastMid.toFixed(6));
    expect(depthCopyFragment).toContain('gl_FragDepth');
  });
  it('never writes blue from anything but the input', () => {
    expect(compositeFragment).toMatch(/vec3 o = vec3\([^;]*, c\.b\);/);
  });
  it('linearToSrgb matches the standard curve', () => {
    expect(linearToSrgb(0)).toBe(0);
    expect(linearToSrgb(1)).toBeCloseTo(1);
    expect(linearToSrgb(0.214)).toBeCloseTo(0.5, 2);
  });
});
