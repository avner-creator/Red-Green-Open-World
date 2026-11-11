/**
 * Pure "Auto challenge" staircase (no three.js, no DOM): 3 hits in a row → one step harder,
 * 1 miss → one step easier (streak resets), no hit for `droughtSeconds` of playing time → one
 * step easier (counted as a step down, not as a miss). Level is clamped to 0..maxLevel.
 */
import { CHALLENGE } from './constants';
import type { ChallengeModifiers } from '../../types';

export interface StaircaseState {
  level: number;
  maxLevel: number;
  /** Hits in a row since the last step or miss. */
  streak: number;
  /** Playing seconds since the last hit (or the last drought step). */
  sinceHit: number;
  stepsUp: number;
  stepsDown: number;
}

export type StepDir = -1 | 0 | 1;

/** What `VisionApi.setChallenge` accepts. */
export type ForcedPatch = Partial<Pick<ChallengeModifiers, 'level' | 'weakScale' | 'strongScale' | 'sizeScale'>>;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function createStaircase(): StaircaseState {
  return { level: 0, maxLevel: CHALLENGE.maxLevel, streak: 0, sinceHit: 0, stepsUp: 0, stepsDown: 0 };
}

export function resetStaircase(s: StaircaseState): void {
  Object.assign(s, createStaircase());
}

function step(s: StaircaseState, dir: -1 | 1): StepDir {
  const next = clamp(s.level + dir, 0, s.maxLevel);
  if (next === s.level) return 0;
  s.level = next;
  if (dir > 0) s.stepsUp += 1;
  else s.stepsDown += 1;
  return dir;
}

/** A hit or a miss. Returns the level change (−1, 0, +1). */
export function staircaseResult(s: StaircaseState, hit: boolean): StepDir {
  if (!hit) {
    s.streak = 0;
    return step(s, -1);
  }
  s.sinceHit = 0;
  s.streak += 1;
  if (s.streak < CHALLENGE.hitsToStepUp) return 0;
  s.streak = 0;
  return step(s, 1);
}

/** Playing time passes. Returns −1 when the drought stepped it easier. */
export function staircaseElapse(s: StaircaseState, seconds: number): StepDir {
  if (!(seconds > 0)) return 0;
  s.sinceHit += seconds;
  if (s.sinceHit < CHALLENGE.droughtSeconds) return 0;
  s.sinceHit = 0;
  return step(s, -1);
}

/** Level → modifiers (identity at level 0). */
export function levelModifiers(level: number): ChallengeModifiers {
  const l = clamp(Math.round(level), 0, CHALLENGE.maxLevel);
  return {
    level: l,
    maxLevel: CHALLENGE.maxLevel,
    weakScale: 1 - CHALLENGE.weakPerLevel * l,
    strongScale: 1 - CHALLENGE.strongPerLevel * l,
    sizeScale: 1 - CHALLENGE.sizePerLevel * l,
  };
}

export const IDENTITY_MODIFIERS: Readonly<ChallengeModifiers> = Object.freeze(levelModifiers(0));

type ScaleKey = 'weakScale' | 'strongScale' | 'sizeScale';
const SCALE_KEYS: readonly ScaleKey[] = ['weakScale', 'strongScale', 'sizeScale'];
const PER_LEVEL: Record<ScaleKey, number> = {
  weakScale: CHALLENGE.weakPerLevel,
  strongScale: CHALLENGE.strongPerLevel,
  sizeScale: CHALLENGE.sizePerLevel,
};

/**
 * Move the applied scales toward `target` at a steady rate (one level's change per
 * `easeSeconds`); lands exactly on the target. `level`/`maxLevel` are taken from the target.
 */
export function easeModifiers(current: ChallengeModifiers, target: Readonly<ChallengeModifiers>, dt: number): ChallengeModifiers {
  const out: ChallengeModifiers = { ...current, level: target.level, maxLevel: target.maxLevel };
  const t = Math.max(0, dt);
  for (const k of SCALE_KEYS) {
    const maxMove = (PER_LEVEL[k] / CHALLENGE.easeSeconds) * t;
    const d = target[k] - current[k];
    out[k] = Math.abs(d) <= maxMove ? target[k] : current[k] + Math.sign(d) * maxMove;
  }
  return out;
}

/** Clamp a forced (test/debug) modifier patch: scales to 0..1, level to 0..maxLevel. */
export function forcedModifiers(mods: ForcedPatch): ChallengeModifiers {
  const base = levelModifiers(Number.isFinite(mods.level) ? (mods.level as number) : 0);
  for (const k of SCALE_KEYS) {
    const v = mods[k];
    if (typeof v === 'number' && Number.isFinite(v)) base[k] = clamp(v, 0, 1);
  }
  return base;
}
