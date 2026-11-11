import { describe, expect, it } from 'vitest';
import { StickStepper, UPGRADES, UPGRADE_IDS, cardAction, gemsShort, itemId, tuningFor, upgradeDef, wrapIndex, type UpgradeId } from '../../src/activities/workshop/upgrades';
import { clearance, createCorridor, lineAt, safeLine, steerClear } from '../../src/activities/race/corridor';

describe('workshop catalog', () => {
  it('has the seven silly upgrades with kid-sized prices', () => {
    expect(UPGRADE_IDS).toEqual(
      expect.arrayContaining(['monsterWheels', 'springBumper', 'bubbleExhaust', 'rocketBoost', 'musicalHorns', 'duckOrnament', 'confettiCannon']),
    );
    expect(UPGRADES).toHaveLength(7);
    for (const u of UPGRADES) {
      expect(u.price).toBeGreaterThanOrEqual(3);
      expect(u.price).toBeLessThanOrEqual(25);
    }
    // Cheapest first, so the first card is always within reach.
    const prices = UPGRADES.map((u) => u.price);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    expect(upgradeDef('rocketBoost')?.key).toBe('skill');
    expect(itemId('duckOrnament')).toBe('buggy-duckOrnament');
  });

  it('only monster wheels and the spring bumper change the handling', () => {
    expect(tuningFor(new Set())).toEqual({ wheelScale: 1, hopScale: 1, bounceScale: 1, offroadAsRoad: false });
    const mw = tuningFor(new Set<UpgradeId>(['monsterWheels']));
    expect(mw.wheelScale).toBeGreaterThan(1.2);
    expect(mw.hopScale).toBeGreaterThan(1);
    expect(mw.offroadAsRoad).toBe(true);
    const sb = tuningFor(new Set<UpgradeId>(['springBumper']));
    expect(sb.bounceScale).toBeGreaterThan(1.5);
    expect(tuningFor(new Set<UpgradeId>(['springBumper', 'monsterWheels'])).bounceScale).toBeGreaterThan(sb.bounceScale);
    expect(tuningFor(new Set<UpgradeId>(['duckOrnament', 'musicalHorns']))).toEqual(tuningFor(new Set()));
  });

  it('a card buys, fits or takes off, and never charges a child who cannot pay', () => {
    expect(cardAction(false, false, 10, 8)).toBe('bought');
    expect(cardAction(false, false, 3, 8)).toBe('tooPoor');
    expect(cardAction(true, false, 0, 8)).toBe('fitted');
    expect(cardAction(true, true, 0, 8)).toBe('removed');
    expect(gemsShort(3, 8)).toBe(5);
    expect(gemsShort(30, 8)).toBe(0);
  });

  it('menu stepping: one step per press, then repeats while held', () => {
    const s = new StickStepper(0.4, 0.2);
    expect(s.step(1, 0.016)).toBe(1);
    expect(s.step(1, 0.1)).toBe(0);
    expect(s.step(1, 0.35)).toBe(1);
    expect(s.step(1, 0.21)).toBe(1);
    expect(s.step(0, 0.016)).toBe(0);
    expect(s.step(-1, 0.016)).toBe(-1);
    expect(wrapIndex(-1, 9)).toBe(8);
    expect(wrapIndex(9, 9)).toBe(0);
  });
});

describe('race corridor (safe line around props)', () => {
  const L = 100;
  const make = (): ReturnType<typeof createCorridor> => createCorridor(L, 1, 6, 0.25);
  const block = (c: ReturnType<typeof createCorridor>, s0: number, s1: number, l0: number, l1: number): void => {
    for (let i = s0; i <= s1; i++) c.lats.forEach((l, j) => {
      if (l >= l0 && l <= l1) c.blocked[i * c.lats.length + j] = 1;
    });
  };

  it('stays on the ideal line when nothing is in the way', () => {
    const c = make();
    const line = safeLine(c, () => -1);
    for (const v of line) expect(Math.abs(v + 1)).toBeLessThan(0.15);
  });

  it('goes around a stall in the road smoothly and comes back', () => {
    const c = make();
    block(c, 40, 44, -2.5, 1.5); // a kiosk across the centre and the right half
    const line = safeLine(c, () => 0);
    for (let i = 38; i <= 46; i++) expect(clearance(c, i, line[i])).toBeGreaterThanOrEqual(1.9);
    // Never jumps sideways faster than a buggy can steer (≤ 0.5 m per metre).
    for (let i = 1; i < line.length; i++) expect(Math.abs(line[i] - line[i - 1])).toBeLessThanOrEqual(0.51);
    expect(Math.abs(line[5])).toBeLessThan(0.2);
    expect(Math.abs(line[90])).toBeLessThan(0.2);
    expect(lineAt(line, L, 42)).toBeGreaterThan(3);
  });

  it('a thin post in a friend’s lane makes it move over towards the safe line', () => {
    const c = make();
    block(c, 50, 50, 1.75, 2);
    let lat = 1.8;
    for (let k = 0; k < 60; k++) lat = steerClear(c, 46, lat, -1, 1 / 30);
    expect(lat).toBeLessThan(0.5);
    // Clear lane: untouched.
    expect(steerClear(c, 10, 1.8, -1, 1 / 30)).toBe(1.8);
  });
});
