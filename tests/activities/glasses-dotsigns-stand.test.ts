/**
 * QA r7 M3 / m9: dot-sign answer pedestals. E answers only the pedestal the hero stands at and
 * faces; there is room to walk between the pedestals; the layout faces the plaza approach.
 */
import { describe, expect, it } from 'vitest';
import { DOTSIGNS } from '../../src/activities/glasses/dotsigns/constants';
import { standingButton } from '../../src/activities/glasses/dotsigns/round';
import { PLAYER } from '../../src/config';

const D = DOTSIGNS;
const AT_SIGN = Math.PI; // facing local −Z (the sign)

describe('dot signs: E answers the pedestal the hero stands at and faces (m9)', () => {
  it('standing in front of each pedestal and facing the sign answers that one', () => {
    D.buttonX.forEach((x, i) => {
      expect(standingButton(x, D.heroZ, AT_SIGN)).toBe(i);
      expect(standingButton(x + 0.4, D.heroZ + 0.5, AT_SIGN + 0.6)).toBe(i);
    });
  });

  it('standing at a pedestal sideways (walked along the row) answers it too (QA8 m3)', () => {
    D.buttonX.forEach((x, i) => {
      expect(standingButton(x, D.heroZ, Math.PI / 2)).toBe(i);
      expect(standingButton(x, D.heroZ, -Math.PI / 2)).toBe(i);
    });
  });

  it('a clear walkway along the pedestal fronts: the pad and its drum start ≥ 1.2 m out', () => {
    const front = D.pedZ + D.pedD / 2 + 0.05; // collider front
    const drum = D.pad.r + 0.16 + 0.12; // drum radius + bollard ring margin
    expect(D.pad.z - drum - front).toBeGreaterThanOrEqual(D.walkway);
    expect(D.heroZ - front).toBeGreaterThan(PLAYER.radius + 0.1);
  });

  it('walking between pedestals, turned away, behind them or from the pad answers nothing', () => {
    const gapX = (D.buttonX[0] + D.buttonX[1]) / 2;
    // In a gap between two pedestals.
    expect(standingButton(gapX, D.pedZ, AT_SIGN)).toBe(-1);
    // Facing away from the sign.
    expect(standingButton(0, D.heroZ, 0)).toBe(-1);
    // Behind the pedestals (between them and the sign).
    expect(standingButton(0, D.pedZ - D.pedD, AT_SIGN)).toBe(-1);
    // On the start pad.
    expect(standingButton(D.pad.x, D.pad.z, AT_SIGN)).toBe(-1);
  });

  it('the gaps between pedestals are wider than the hero', () => {
    const gaps = [D.buttonX[1] - D.buttonX[0], D.buttonX[2] - D.buttonX[1]].map((c) => c - D.pedEach);
    for (const g of gaps) expect(g).toBeGreaterThan(2 * PLAYER.radius + 0.3);
    expect(D.buttonX[2] + D.pedEach / 2).toBeCloseTo(D.pedW / 2, 6);
  });
});
