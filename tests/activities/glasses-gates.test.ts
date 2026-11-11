import { describe, expect, it } from 'vitest';
import { GATE_PRIZE, GATES } from '../../src/activities/glasses/gates/constants';
import { crossesOpening, nextTier, siteFrame } from '../../src/activities/glasses/gates/kit';
import { archesMatching, archesMatchingBoth, halvesFor, isGateRound, makeGateRound } from '../../src/activities/glasses/gates/round';
import { sameSymbol } from '../../src/vision/toolkit/halfSymbols';
import { mulberry32 } from '../../src/vision/toolkit/rng';

describe('gate rounds', () => {
  it('the answer is always one of three different arch symbols; only both halves pick it', () => {
    const rng = mulberry32(7);
    for (let n = 0; n < 2000; n++) {
      const r = makeGateRound(rng, n % 2 ? 'right' : 'left');
      expect(isGateRound(r)).toBe(true);
      expect(r.answer).toBeGreaterThanOrEqual(0);
      expect(r.answer).toBeLessThan(3);
      for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) expect(sameSymbol(r.candidates[a], r.candidates[b])).toBe(false);
      // Either eye alone: two arches fit. Both eyes: exactly the answer.
      const weak = archesMatching(r, 'weak');
      const strong = archesMatching(r, 'strong');
      expect(weak).toHaveLength(2);
      expect(strong).toHaveLength(2);
      expect(weak).toContain(r.answer);
      expect(strong).toContain(r.answer);
      expect(archesMatchingBoth(r)).toEqual([r.answer]);
      // The halves are the answer's halves on the right sides.
      const h = halvesFor(r);
      const a = r.candidates[r.answer];
      expect(h.weak).toBe(r.weakSide === 'left' ? a.left : a.right);
      expect(h.strong).toBe(r.weakSide === 'left' ? a.right : a.left);
    }
  });

  it('the arch order does not depend on the answer (uniform position, no bias within one eye)', () => {
    const rng = mulberry32(99);
    const N = 6000;
    const pos = [0, 0, 0];
    let strongFirst = 0;
    let weakFirst = 0;
    for (let n = 0; n < N; n++) {
      const r = makeGateRound(rng, 'left');
      pos[r.answer]++;
      // Among the two arches one eye cannot tell apart, is the answer the left one?
      if (archesMatching(r, 'strong')[0] === r.answer) strongFirst++;
      if (archesMatching(r, 'weak')[0] === r.answer) weakFirst++;
    }
    for (const p of pos) expect(Math.abs(p / N - 1 / 3)).toBeLessThan(0.03);
    expect(Math.abs(strongFirst / N - 0.5)).toBeLessThan(0.03);
    expect(Math.abs(weakFirst / N - 0.5)).toBeLessThan(0.03);
  });

  it('rejects malformed forced rounds', () => {
    expect(isGateRound(null)).toBe(false);
    expect(isGateRound({ candidates: [], answer: 0, weakSide: 'left' })).toBe(false);
    const c = [{ left: 'round', right: 'round' }, { left: 'round', right: 'point' }, { left: 'spiky', right: 'round' }];
    expect(isGateRound({ candidates: c, answer: 3, weakSide: 'left' })).toBe(false);
    expect(isGateRound({ candidates: c, answer: 1, weakSide: 'up' })).toBe(false);
    expect(isGateRound({ candidates: c, answer: 1, weakSide: 'right' })).toBe(true);
  });
});

describe('crossing an arch opening', () => {
  const o = { cx: 0, z: 0, halfWidth: 0.9, height: 2.2 };
  const p = (x: number, z: number, y = 0): { x: number; y: number; z: number } => ({ x, y, z });

  it('counts running through in either direction, fast or slow', () => {
    expect(crossesOpening(p(0, 0.3), p(0, -0.3), o)).toBe(true);
    expect(crossesOpening(p(0.5, -0.1), p(0.6, 0.1), o)).toBe(true);
    // Sprinting: a long step that jumps the plane in one frame.
    expect(crossesOpening(p(-0.2, 1.5), p(0.3, -1.4), o)).toBe(true);
  });

  it('counts a jump through the opening, not a jump over the top', () => {
    expect(crossesOpening(p(0, 0.2, 1.5), p(0, -0.2, 1.7), o)).toBe(true);
    expect(crossesOpening(p(0, 0.2, 2.6), p(0, -0.2, 2.8), o)).toBe(false);
  });

  it('does not count walking round the posts, staying on one side, or a teleport', () => {
    expect(crossesOpening(p(1.2, 0.3), p(1.3, -0.3), o)).toBe(false);
    expect(crossesOpening(p(-1.0, 0.3), p(-1.4, -0.3), o)).toBe(false);
    expect(crossesOpening(p(0, 0.5), p(0, 0.1), o)).toBe(false);
    expect(crossesOpening(p(0, -0.5), p(0, -0.1), o)).toBe(false);
    expect(crossesOpening(p(0, 3), p(0, -3), o)).toBe(false);
  });

  it('counts a pass that stops exactly on the plane only once', () => {
    expect(crossesOpening(p(0, 0.2), p(0, 0), o)).toBe(true);
    expect(crossesOpening(p(0, 0), p(0, -0.2), o)).toBe(false);
  });

  it('works in the site frame (world ↔ local round trip)', () => {
    const f = siteFrame({ x: 10, z: -4, yaw: 1.1 });
    const w = f.toWorld(GATES.archX[2], GATES.archZ);
    const l = f.toLocal(w.x, w.z);
    expect(l.x).toBeCloseTo(GATES.archX[2], 9);
    expect(l.z).toBeCloseTo(GATES.archZ, 9);
  });
});

describe('progression and rewards', () => {
  it('a hit is one step finer, a miss one step coarser, clamped to 1..3', () => {
    expect(nextTier(1, true)).toBe(2);
    expect(nextTier(2, true)).toBe(3);
    expect(nextTier(3, true)).toBe(3);
    expect(nextTier(3, false)).toBe(2);
    expect(nextTier(2, false)).toBe(1);
    expect(nextTier(1, false)).toBe(1);
  });

  it('finer tiers pay more gems', () => {
    expect(GATE_PRIZE[1][3]).toBeGreaterThan(0);
    expect(GATE_PRIZE[2][3]).toBeGreaterThan(GATE_PRIZE[1][3]);
    expect(GATE_PRIZE[3][3]).toBeGreaterThan(GATE_PRIZE[2][3]);
  });

  it('the layout stays inside the site radius', () => {
    const r = Math.hypot(Math.abs(GATES.archX[0]) + GATES.outerHalf + 0.8, GATES.archZ - 0.6);
    expect(r).toBeLessThan(6.5);
  });
});
