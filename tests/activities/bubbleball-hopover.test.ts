/**
 * Bubble Ball near-sideline walk-over (QA6 m9): pushing into the puffy wall from either side boings
 * a walker over it; nothing happens in the walk-in gate, beyond the corners or when not pushing.
 */
import { describe, expect, it } from 'vitest';
import { gateSpan } from '../../src/activities/bubbleball/arena';
import { HOP, HopWatch, NEAR_WALL, hopSide } from '../../src/activities/bubbleball/hopover';
import { PLAYER } from '../../src/config';
import { ARENA } from '../../src/activities/bubbleball/arena';

const gate = gateSpan();

describe('bubble ball walk-over (QA6 m9)', () => {
  it('pushing onto the pitch from outside the near wall boings you on (+1); from inside, off (−1)', () => {
    expect(hopSide(2, NEAR_WALL.outer - 0.35, { x: 0, z: 1 }, gate)).toBe(1);
    expect(hopSide(-2, NEAR_WALL.outer - 0.35, { x: 0.5, z: 0.8 }, gate)).toBe(1);
    expect(hopSide(2, NEAR_WALL.inner + 0.35, { x: 0, z: -1 }, gate)).toBe(-1);
  });

  it('no boing walking along the wall, away from it, in the gate or past the corners', () => {
    expect(hopSide(2, NEAR_WALL.outer - 0.35, { x: 1, z: 0 }, gate)).toBe(0);
    expect(hopSide(2, NEAR_WALL.outer - 0.35, { x: 0, z: -1 }, gate)).toBe(0);
    expect(hopSide((gate.x0 + gate.x1) / 2, NEAR_WALL.outer - 0.35, { x: 0, z: 1 }, gate)).toBe(0);
    expect(hopSide(20, NEAR_WALL.outer - 0.35, { x: 0, z: 1 }, gate)).toBe(0);
    expect(hopSide(2, NEAR_WALL.outer - 3, { x: 0, z: 1 }, gate)).toBe(0);
    expect(hopSide(2, NEAR_WALL.outer - 0.35, { x: 0, z: 0 }, gate)).toBe(0);
  });

  it('the boing needs a short steady push, then fires once', () => {
    const w = new HopWatch();
    let fired = 0;
    for (let i = 0; i < 30; i++) if (w.update(1 / 60, 1)) fired++;
    expect(fired).toBeGreaterThanOrEqual(1);
    const w2 = new HopWatch();
    expect(w2.update(HOP.push / 2, 1)).toBe(0);
    expect(w2.update(HOP.push / 2, 0)).toBe(0);
  });

  it('the take-off clears the wall', () => {
    expect((HOP.vy * HOP.vy) / (2 * PLAYER.gravity)).toBeGreaterThan(ARENA.wallH + 0.3);
  });
});
