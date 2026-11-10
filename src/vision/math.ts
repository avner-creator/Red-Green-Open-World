/**
 * Pure TypeScript mirror of the dichoptic compositor maths (the GLSL in `shaders.ts` does the
 * same steps with the same constants). All values are display-referred sRGB in 0..1.
 */
import { COMPOSITE } from './constants';
import type { ChannelAssignment, EyeSettings } from '../types';

/** Red lens passes R, green lens passes G. The weak eye's lens colour is the weak channel. */
export function deriveChannels(eye: Pick<EyeSettings, 'leftLens' | 'weakEye'>): ChannelAssignment {
  const leftChannel = eye.leftLens === 'red' ? 'r' : 'g';
  const rightChannel = leftChannel === 'r' ? 'g' : 'r';
  const weak = eye.weakEye === 'left' ? leftChannel : rightChannel;
  return { weak, strong: weak === 'r' ? 'g' : 'r' };
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

export function linearToSrgb(v: number): number {
  const c = clamp01(v);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

/**
 * Target level of a layer object over background `bg`.
 * `pivotBg` decides polarity: dark surroundings → brighten toward white, bright → darken toward
 * black. `L` (0..1, the object's own shading) sets how far it moves (popMin..popMax), so even on a
 * mid-grey background the object differs by at least 0.5 * popMin.
 */
export function layerTarget(L: number, bg: number, pivotBg: number = bg): number {
  const a = COMPOSITE.popMin + (COMPOSITE.popMax - COMPOSITE.popMin) * clamp01(L);
  return pivotBg < COMPOSITE.pivot ? bg + (1 - bg) * a : bg * (1 - a);
}

/** Polarity input: blend of the local background and its blurred neighbourhood. */
export function polarityBg(bg: number, blurred: number): number {
  const w = COMPOSITE.polarityLocalWeight;
  return bg * w + blurred * (1 - w);
}

/** One layer channel: `bg + clamp(f - bg, ±limit) * mask * strength`. Mask 0 returns `bg` exactly. */
export function compositeLayer(bg: number, L: number, mask: number, strength: number, limit: number, pivotBg: number = bg): number {
  const delta = Math.min(limit, Math.max(-limit, layerTarget(L, bg, pivotBg) - bg));
  return bg + delta * clamp01(mask) * clamp01(strength);
}

/** Strong-eye contrast (0.4..1) around mid-grey. */
export function applyContrast(v: number, contrast: number): number {
  return COMPOSITE.contrastMid + (v - COMPOSITE.contrastMid) * contrast;
}

export interface LayerSample {
  /** Object shading (display sRGB luminance 0..1). */
  L: number;
  /** Coverage 0..1. */
  M: number;
}

/**
 * Full per-pixel composite, mirroring the shader. `rgb` is the display-referred frame without layer
 * objects. Blue is returned unchanged; the weak channel never reads the strong layer and vice versa.
 */
export function compositePixel(
  rgb: readonly [number, number, number],
  eye: EyeSettings,
  weak: LayerSample,
  strong: LayerSample,
): [number, number, number] {
  const ch = deriveChannels(eye);
  const wi = ch.weak === 'r' ? 0 : 1;
  const si = 1 - wi;
  const out: [number, number, number] = [rgb[0], rgb[1], rgb[2]];
  out[wi] = clamp01(compositeLayer(rgb[wi], weak.L, weak.M, eye.weakStrength, eye.crosstalkLimit));
  const s = compositeLayer(rgb[si], strong.L, strong.M, eye.weakStrength, eye.crosstalkLimit);
  out[si] = clamp01(applyContrast(s, eye.strongContrast));
  return out;
}
