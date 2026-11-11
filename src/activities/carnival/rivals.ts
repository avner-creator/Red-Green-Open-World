/**
 * Friendly rival AI. Rivals are cheerful and a bit clumsy: they act on a relaxed tempo and miss
 * often, so a child who tries beats them. Pure and seeded (unit-tested).
 */
import type { Rng } from './rng';
import { range } from './rng';

export interface RivalSkill {
  /** Chance an action succeeds. */
  accuracy: number;
  /** Seconds between actions (min, max). */
  tempo: readonly [number, number];
}

/** Two friends: one a little better than the other, both beatable. */
export const RIVAL_SKILLS: readonly RivalSkill[] = [
  { accuracy: 0.5, tempo: [1.6, 2.6] },
  { accuracy: 0.38, tempo: [1.9, 3.0] },
];

export class RivalBrain {
  private wait: number;
  constructor(
    readonly skill: RivalSkill,
    private readonly rng: Rng,
    firstDelay = 0.6,
  ) {
    this.wait = firstDelay + range(rng, 0, skill.tempo[0]);
  }

  /** Advance; true when the rival acts this frame. */
  tick(dt: number): boolean {
    this.wait -= dt;
    if (this.wait > 0) return false;
    this.wait = range(this.rng, this.skill.tempo[0], this.skill.tempo[1]);
    return true;
  }

  /** Does this action succeed? */
  roll(bonus = 0): boolean {
    return this.rng() < Math.min(0.95, this.skill.accuracy + bonus);
  }

  /** A random number 0..1 from this rival's stream (aim jitter etc.). */
  random(): number {
    return this.rng();
  }
}

/** Expected points of a rival in `seconds` (for tuning tests). */
export function expectedRivalPoints(skill: RivalSkill, seconds: number, pointsPerHit: number): number {
  const tempo = (skill.tempo[0] + skill.tempo[1]) / 2;
  return (seconds / tempo) * skill.accuracy * pointsPerHit;
}
