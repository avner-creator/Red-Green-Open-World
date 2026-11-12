/**
 * Dot-picture rounds (pure). Three different shapes go on the buttons in an order drawn from the
 * rng; the answer is then drawn independently (uniform over the three buttons), so the button
 * order says nothing about which one is right. The dot seed is drawn from the rng too, and the
 * strong-eye dots depend on that seed only (toolkit `strongPattern`).
 */
import { SHAPE_IDS } from '../../../vision/toolkit';
import type { ShapeId } from '../../../vision/toolkit';
import { randInt } from '../gates/kit';
import { DOTSIGNS } from './constants';

/**
 * The shapes a round uses. No circle: a filled disc on a round button face reads as a blank
 * button ("nothing"), so it is left out of the button set.
 */
export const DOT_SHAPES: readonly ShapeId[] = SHAPE_IDS.filter((s) => s !== 'circle');

export interface DotRound {
  /** Shapes on the three buttons, left to right. */
  shapes: ShapeId[];
  /** Index of the hidden shape among `shapes`. */
  answer: number;
  /** Dot seed (strong pattern = f(seed) only). */
  seed: number;
}

export function makeDotRound(rng: () => number): DotRound {
  const pool = [...DOT_SHAPES];
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
    r.shapes.every((s) => DOT_SHAPES.includes(s)) &&
    new Set(r.shapes).size === 3 &&
    typeof r.answer === 'number' &&
    r.answer >= 0 &&
    r.answer < 3 &&
    typeof r.seed === 'number'
  );
}

/**
 * The button E answers (QA r7 m9), or -1: only the one whose pedestal the hero stands at, in front
 * of it, facing the sign. Layout-local: `x`, `z` the hero's feet (+Z = the approach, the sign at
 * z ≈ 0), `yaw` the hero's facing in the layout frame (facing (sin, cos) on x/z). Walking past or
 * between the pedestals (beside them, behind them, or facing along them) answers nothing.
 */
export function standingButton(x: number, z: number, yaw: number): number {
  const D = DOTSIGNS;
  const front = D.pedZ + D.pedD / 2;
  if (z < front || z > front + D.standDepth) return -1;
  // Facing the sign: the facing vector points at −Z within the cone.
  if (-Math.cos(yaw) < Math.cos(D.faceCone)) return -1;
  let best = -1;
  let bestD: number = D.standHalf;
  D.buttonX.forEach((bx, i) => {
    const d = Math.abs(x - bx);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
