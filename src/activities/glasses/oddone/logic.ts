/**
 * Odd one out: pure round logic (no three.js, unit-tested).
 *
 * A gentle per-session staircase: every hit makes the difference finer (level + 1), every miss
 * coarser (level − 1).
 *   level 0: a different shape (a circle among squares…)
 *   level 1: the same arrow pointing another way
 *   level 2: a ring whose gap is on another side
 *   level 3+: the same ring with a narrower gap and a smaller size, down to a floor that still reads
 *             at 640×360 from the buttons.
 * Every answer position gets the same set of shapes: only WHERE the odd one sits changes.
 */
import type { GlassesTier } from '../../../types';
import { ODD } from './constants';

export type ShapeKind = 'square' | 'circle' | 'triangle' | 'diamond' | 'arrow' | 'ring';

/** Shader codes for the kinds (keep in sync with ./shapes.ts). */
export const KIND_CODE: Readonly<Record<ShapeKind, number>> = { square: 0, circle: 1, triangle: 2, diamond: 3, arrow: 4, ring: 5 };

export interface ShapeSpec {
  kind: ShapeKind;
  /** Direction in quarter turns (0 = right, 1 = up, 2 = left, 3 = down). Arrows point there; rings have their gap there. */
  dir: number;
}

export interface Detail {
  /** Outer size of a shape, metres. */
  size: number;
  /** Ring gap width, metres. */
  gap: number;
  /** Ring stroke width, metres. */
  stroke: number;
}

export interface Round {
  level: number;
  tier: GlassesTier;
  /** Index (0..2, left to right) of the odd pedestal. */
  answer: number;
  common: ShapeSpec;
  odd: ShapeSpec;
  detail: Detail;
}

/** Shape pairs for level 0: [common, odd]. */
export const SHAPE_PAIRS: readonly (readonly [ShapeKind, ShapeKind])[] = [
  ['square', 'circle'],
  ['circle', 'square'],
  ['circle', 'triangle'],
  ['triangle', 'circle'],
  ['square', 'diamond'],
  ['diamond', 'circle'],
];

export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.max(0, Math.min(ODD.maxLevel, Math.round(level)));
}

/** The staircase: finer after a hit, coarser after a miss. */
export function nextLevel(level: number, hit: boolean): number {
  return clampLevel(level + (hit ? 1 : -1));
}

/** Level → tier (0–1 → 1, 2–3 → 2, 4+ → 3). */
export function tierForLevel(level: number): GlassesTier {
  const l = clampLevel(level);
  return l <= 1 ? 1 : l <= 3 ? 2 : 3;
}

export function gemsForTier(tier: GlassesTier): number {
  return ODD.gems[tier];
}

/** Size, gap and stroke for a level (gap and size shrink from level 3 to the floor). */
export function detailForLevel(level: number): Detail {
  const l = clampLevel(level);
  const k = Math.max(0, Math.min(1, (l - 2) / Math.max(1, ODD.maxLevel - 2)));
  const size = ODD.size.base + (ODD.size.floor - ODD.size.base) * k;
  const gap = ODD.gap.base + (ODD.gap.floor - ODD.gap.base) * Math.sqrt(k);
  return { size, gap, stroke: Math.max(gap, size * 0.17) };
}

const pickInt = (rng: () => number, n: number): number => Math.min(n - 1, Math.floor(rng() * n));

/** A new round at `level`. `answer` defaults to a random position. */
export function makeRound(level: number, rng: () => number, answer?: number): Round {
  const l = clampLevel(level);
  let common: ShapeSpec;
  let odd: ShapeSpec;
  if (l === 0) {
    const [a, b] = SHAPE_PAIRS[pickInt(rng, SHAPE_PAIRS.length)];
    common = { kind: a, dir: 0 };
    odd = { kind: b, dir: 0 };
  } else {
    const kind: ShapeKind = l === 1 ? 'arrow' : 'ring';
    const dir = pickInt(rng, 4);
    common = { kind, dir };
    odd = { kind, dir: (dir + 1 + pickInt(rng, 3)) % 4 };
  }
  const pos = answer === undefined ? pickInt(rng, 3) : Math.max(0, Math.min(2, Math.round(answer)));
  return { level: l, tier: tierForLevel(l), answer: pos, common, odd, detail: detailForLevel(l) };
}

/** The same round with the odd shape moved to another position (nothing else changes). */
export function withAnswer(round: Round, answer: number): Round {
  return { ...round, answer: Math.max(0, Math.min(2, Math.round(answer))) };
}

/** The three shapes left to right. */
export function shapesOf(round: Round): ShapeSpec[] {
  return [0, 1, 2].map((i) => (i === round.answer ? round.odd : round.common));
}

/** True if the two specs look different (the round is solvable). */
export function differs(a: ShapeSpec, b: ShapeSpec): boolean {
  if (a.kind !== b.kind) return true;
  if (a.kind === 'circle' || a.kind === 'square' || a.kind === 'diamond' || a.kind === 'triangle') return false;
  return ((a.dir % 4) + 4) % 4 !== ((b.dir % 4) + 4) % 4;
}
