/**
 * Odd one out: pure round logic (no three.js, unit-tested).
 *
 * A gentle staircase that runs through every try of every round of a session: every hit makes the
 * difference finer (level + 1), every miss coarser (level − 1). The try's tier (results and the
 * round's prize) follows the level.
 *   level 0: a different shape (a circle among squares…)
 *   level 1: the same arrow pointing another way
 *   level 2: a ring whose gap is on another side
 *   level 3+: the same ring with a narrower gap and a smaller size, down to a floor that still reads
 *             at 640×360 from the buttons.
 * Every answer position gets the same set of shapes: only WHERE the odd one sits changes.
 */
import type { GlassesTier } from '../../../types';
import { RoundMachine } from '../booth/round';
import type { RoundRules } from '../booth/types';
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

// ───────────────────────────── the staircase on the booth's rounds (pure; mechanic + bot tests) ─────────────────────────────

/**
 * The level a session is at; it runs through every try of every round. A try's result carries
 * `tierForLevel` of the level it was asked at (`kit.report(hit, at, tier)`); the round's prize
 * uses the kit's round tier (up after 5 of 5, down below 3).
 */
export class OddStaircase {
  level = 0;
  /** Fixed level (bot tests); null = the staircase. */
  lockLevel: number | null = null;

  /** The level the next try is asked at. */
  current(): number {
    return clampLevel(this.lockLevel ?? this.level);
  }

  /** Finer after a hit, coarser after a miss. */
  answer(hit: boolean): void {
    this.level = nextLevel(this.level, hit);
  }

  reset(): void {
    this.level = 0;
  }
}

export interface OddSimPlayer {
  /** Probability of a right answer at a level (a random-guess bot: 1/3 everywhere). */
  hitP: (level: number) => number;
  /** Seconds from a try's start to the press, and from idle to the next start. */
  tryTime: number;
  restart: number;
  /** Keep the staircase at this level (e.g. the top level: the bot's worst case). */
  lockLevel?: number;
  minutes: number;
  seed?: number;
}

/**
 * Gems per minute of a player at the odd one out booth: the real round machine (5 tries, a prize
 * from 3) with the staircase setting each try's tier, exactly as the mechanic does.
 */
export function simulateOddOne(rules: RoundRules, p: OddSimPlayer): { gemsPerMinute: number; rounds: number; levelEnd: number } {
  const m = new RoundMachine(rules);
  const stairs = new OddStaircase();
  stairs.lockLevel = p.lockLevel ?? null;
  let a = (p.seed ?? 1) >>> 0;
  const rng = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const dt = 1 / 20;
  let gems = 0;
  let sinceTry = 0;
  let idleFor = 0;
  for (let t = 0; t < p.minutes * 60; t += dt) {
    if (m.phase === 'idle') {
      idleFor += dt;
      if (idleFor >= p.restart) {
        m.start();
        idleFor = 0;
      }
      continue;
    }
    if (m.phase === 'play') {
      sinceTry += dt;
      if (sinceTry >= p.tryTime) {
        const level = stairs.current();
        const hit = rng() < p.hitP(level);
        if (p.lockLevel !== undefined) m.tier = tierForLevel(level);
        m.report(hit, tierForLevel(level));
        stairs.answer(hit);
      }
    }
    for (const e of m.step(dt, true)) {
      if (e.type === 'try') sinceTry = 0;
      if (e.type === 'pay') gems += e.gems;
    }
  }
  return { gemsPerMinute: gems / p.minutes, rounds: m.rounds, levelEnd: stairs.level };
}

