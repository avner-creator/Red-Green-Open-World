/**
 * Half-symbol gate rounds (pure). The answer symbol is split down its axis: one half goes to the
 * weak eye, the other to the strong eye. The three arch symbols come from `pickCandidates`: one
 * decoy shares the answer's left half and the other its right half, so either half alone leaves
 * two arches possible and only both eyes together pick the answer.
 */
import { pickCandidates, randomSymbol } from '../../../vision/toolkit';
import type { HalfShape, HalfSymbol } from '../../../vision/toolkit';

export type Side = 'left' | 'right';

export interface GateRound {
  /** The three arch symbols, arch 0..2 from left to right. */
  candidates: HalfSymbol[];
  /** Index of the answer arch. */
  answer: number;
  /** Which half of the answer the weak eye gets. */
  weakSide: Side;
}

export function makeGateRound(rng: () => number, weakSide: Side): GateRound {
  const symbol = randomSymbol(rng);
  const { candidates, answerIndex } = pickCandidates(symbol, rng);
  return { candidates, answer: answerIndex, weakSide };
}

const halfOf = (s: HalfSymbol, side: Side): HalfShape => (side === 'left' ? s.left : s.right);
export const otherSide = (s: Side): Side => (s === 'left' ? 'right' : 'left');

/** The half shapes each eye sees for a round. */
export function halvesFor(r: GateRound): { weak: HalfShape; strong: HalfShape } {
  const a = r.candidates[r.answer];
  return { weak: halfOf(a, r.weakSide), strong: halfOf(a, otherSide(r.weakSide)) };
}

/** Arches consistent with what ONE eye sees (its half on its side). */
export function archesMatching(r: GateRound, eye: 'weak' | 'strong'): number[] {
  const side = eye === 'weak' ? r.weakSide : otherSide(r.weakSide);
  const want = halfOf(r.candidates[r.answer], side);
  const out: number[] = [];
  r.candidates.forEach((c, i) => {
    if (halfOf(c, side) === want) out.push(i);
  });
  return out;
}

/** Arches consistent with both halves together (always exactly the answer). */
export function archesMatchingBoth(r: GateRound): number[] {
  const w = archesMatching(r, 'weak');
  return archesMatching(r, 'strong').filter((i) => w.includes(i));
}

/** Validate a forced round (tests): three symbols, answer in range. */
export function isGateRound(v: unknown): v is GateRound {
  const r = v as Partial<GateRound> | null;
  return (
    !!r &&
    Array.isArray(r.candidates) &&
    r.candidates.length === 3 &&
    typeof r.answer === 'number' &&
    r.answer >= 0 &&
    r.answer < 3 &&
    (r.weakSide === 'left' || r.weakSide === 'right')
  );
}
