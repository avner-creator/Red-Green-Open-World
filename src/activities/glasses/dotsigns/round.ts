/**
 * Dot-picture rounds (pure). Three different shapes go on the buttons in an order drawn from the
 * rng; the answer is then drawn independently (uniform over the three buttons), so the button
 * order says nothing about which one is right. The dot seed is drawn from the rng too, and the
 * strong-eye dots depend on that seed only (toolkit `strongPattern`).
 */
import { SHAPE_IDS } from '../../../vision/toolkit';
import type { ShapeId } from '../../../vision/toolkit';
import { randInt } from '../gates/kit';

export interface DotRound {
  /** Shapes on the three buttons, left to right. */
  shapes: ShapeId[];
  /** Index of the hidden shape among `shapes`. */
  answer: number;
  /** Dot seed (strong pattern = f(seed) only). */
  seed: number;
}

export function makeDotRound(rng: () => number): DotRound {
  const pool = [...SHAPE_IDS];
  const shapes: ShapeId[] = [];
  for (let k = 0; k < 3; k++) shapes.push(pool.splice(randInt(rng, pool.length), 1)[0]);
  const answer = randInt(rng, 3);
  const seed = (Math.floor(rng() * 0x7fffffff) + 1) >>> 0;
  return { shapes, answer, seed };
}

export const answerShape = (r: DotRound): ShapeId => r.shapes[r.answer];

export function isDotRound(v: unknown): v is DotRound {
  const r = v as Partial<DotRound> | null;
  return (
    !!r &&
    Array.isArray(r.shapes) &&
    r.shapes.length === 3 &&
    r.shapes.every((s) => SHAPE_IDS.includes(s)) &&
    new Set(r.shapes).size === 3 &&
    typeof r.answer === 'number' &&
    r.answer >= 0 &&
    r.answer < 3 &&
    typeof r.seed === 'number'
  );
}
