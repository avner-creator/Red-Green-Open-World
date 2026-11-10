import { describe, expect, it } from 'vitest';
import {
  ChestLock,
  Loadout,
  keyCandidates,
  keyholeSide,
  onKeyholeSide,
  pickKeySpot,
  playerSide,
  rightSymbol,
  sideDirection,
} from '../../src/activities/chests/logic';
import { OUTFITS, outfitForChest } from '../../src/activities/chests/outfits';
import { symbolShape } from '../../src/activities/chests/lockModel';

describe('keyhole side', () => {
  it('is deterministic and shows all four sides across six chests', () => {
    const sides = Array.from({ length: 6 }, (_, i) => keyholeSide(i, 6));
    expect(sides).toEqual(Array.from({ length: 6 }, (_, i) => keyholeSide(i, 6)));
    expect(new Set(sides).size).toBe(4);
    for (let i = 0; i < 6; i++) expect(rightSymbol(i)).toBeGreaterThanOrEqual(0);
  });

  it('sideDirection points +Z, +X, -Z, -X', () => {
    expect([0, 1, 2, 3].map(sideDirection)).toEqual([
      { x: 0, z: 1 },
      { x: 1, z: 0 },
      { x: 0, z: -1 },
      { x: -1, z: 0 },
    ]);
  });
});

describe('side test', () => {
  it('finds the quadrant in the chest frame (yaw 0)', () => {
    expect(playerSide(0, 0, 0, 0, 2).side).toBe(0);
    expect(playerSide(0, 0, 0, 2, 0).side).toBe(1);
    expect(playerSide(0, 0, 0, 0, -2).side).toBe(2);
    expect(playerSide(0, 0, 0, -2, 0).side).toBe(3);
  });

  it('follows the chest yaw', () => {
    // Chest turned 90 degrees: its front (+Z local) now faces world +X.
    expect(playerSide(0, 0, Math.PI / 2, 2, 0).side).toBe(0);
    expect(playerSide(0, 0, Math.PI / 2, 0, -2).side).toBe(1);
    expect(onKeyholeSide(5, 5, 1.1, 2, 5 + Math.sin(1.1) * -2, 5 + Math.cos(1.1) * -2)).toBe(true);
  });

  it('accepts only the keyhole side, not the neighbours or the far side', () => {
    for (let keyhole = 0; keyhole < 4; keyhole++) {
      for (let s = 0; s < 4; s++) {
        const d = sideDirection(s);
        expect(onKeyholeSide(10, -4, 0.7, keyhole, 10 + (Math.cos(0.7) * d.x + Math.sin(0.7) * d.z) * 2, -4 + (-Math.sin(0.7) * d.x + Math.cos(0.7) * d.z) * 2)).toBe(s === keyhole);
      }
    }
  });

  it('is forgiving near the edge of the quadrant but not on the diagonal', () => {
    const near = Math.PI / 4 - 0.05;
    expect(onKeyholeSide(0, 0, 0, 0, Math.sin(near) * 2, Math.cos(near) * 2)).toBe(true);
    const diag = Math.PI / 4 + 0.3;
    expect(onKeyholeSide(0, 0, 0, 0, Math.sin(diag) * 2, Math.cos(diag) * 2)).toBe(false);
  });

  it('stands exactly on the chest: no side', () => {
    expect(onKeyholeSide(1, 1, 0, 0, 1, 1)).toBe(false);
  });
});

describe('ChestLock state machine', () => {
  it('needs the key first', () => {
    const l = new ChestLock(2);
    expect(l.use(true)).toBe('no-key');
    expect(l.opened).toBe(false);
  });

  it('picks the key up once', () => {
    const l = new ChestLock(0);
    expect(l.pickUp()).toBe(true);
    expect(l.pickUp()).toBe(false);
    expect(l.hasKey).toBe(true);
  });

  it('a wrong side wobbles and keeps the key (no penalty), the right side opens', () => {
    const l = new ChestLock(1);
    l.pickUp();
    expect(l.use(false)).toBe('wrong-side');
    expect(l.use(false)).toBe('wrong-side');
    expect(l.hasKey).toBe(true);
    expect(l.use(true)).toBe('opened');
    expect(l.opened).toBe(true);
    expect(l.key).toBe('used');
    expect(l.use(true)).toBe('already-open');
  });

  it('reset restores the start state', () => {
    const l = new ChestLock(3);
    l.pickUp();
    l.use(true);
    l.reset();
    expect(l.key).toBe('ground');
    expect(l.opened).toBe(false);
  });
});

describe('key placement', () => {
  it('candidates are 6.5..11.5 m from the chest and deterministic', () => {
    const a = keyCandidates(3, 10, 20);
    expect(a).toEqual(keyCandidates(3, 10, 20));
    for (const c of a) {
      const d = Math.hypot(c.x - 10, c.z - 20);
      expect(d).toBeGreaterThanOrEqual(6.4);
      expect(d).toBeLessThanOrEqual(11.6);
    }
    expect(a.length).toBeGreaterThan(50);
  });

  it('picks the first accepted candidate or null', () => {
    const cands = keyCandidates(0, 0, 0);
    expect(pickKeySpot(cands, () => true)).toBe(cands[0]);
    expect(pickKeySpot(cands, (c) => c === cands[5])).toBe(cands[5]);
    expect(pickKeySpot(cands, () => false)).toBeNull();
  });

  it('different chests start in different directions', () => {
    const firsts = new Set(Array.from({ length: 6 }, (_, i) => keyCandidates(i, 0, 0)[0].x.toFixed(2)));
    expect(firsts.size).toBeGreaterThan(3);
  });
});

describe('outfits and slots', () => {
  it('defines six outfits whose ids pick an icon', () => {
    expect(OUTFITS).toHaveLength(6);
    for (const o of OUTFITS) expect(o.id).toMatch(/hat|cape|glass|paint/);
    expect(new Set(OUTFITS.map((o) => o.id)).size).toBe(6);
    expect(OUTFITS.filter((o) => o.slot === 'carColor')).toHaveLength(2);
    expect(outfitForChest(7)).toBe(OUTFITS[1]);
  });

  it('keeps one item per slot: a newer one replaces the older one', () => {
    const l = new Loadout();
    const hatA = OUTFITS.find((o) => o.id === 'hat-explorer')!;
    const hatB = OUTFITS.find((o) => o.id === 'hat-party')!;
    const cape = OUTFITS.find((o) => o.id === 'cape-hero')!;
    expect(l.equip(hatA)).toEqual({ slot: 'head', replaced: null, unlocked: true });
    expect(l.equip(cape).replaced).toBeNull();
    const r = l.equip(hatB);
    expect(r.replaced).toBe('hat-explorer');
    expect(l.worn('head')).toBe('hat-party');
    expect(l.isWorn('hat-explorer')).toBe(false);
    expect(l.worn('back')).toBe('cape-hero');
    expect(l.unlockedIds()).toEqual(['hat-explorer', 'cape-hero', 'hat-party']);
  });

  it('re-equipping the same outfit is not a new unlock and replaces nothing', () => {
    const l = new Loadout();
    l.equip(OUTFITS[0]);
    expect(l.equip(OUTFITS[0])).toEqual({ slot: 'head', replaced: null, unlocked: false });
  });

  it('reset clears everything', () => {
    const l = new Loadout();
    for (const o of OUTFITS) l.equip(o);
    l.reset();
    expect(l.unlockedIds()).toEqual([]);
    expect(l.worn('head')).toBeNull();
  });
});

describe('symbol shapes', () => {
  it('builds star, moon and ring outlines', () => {
    for (const k of ['star', 'moon', 'circle'] as const) {
      const pts = symbolShape(k, 1).getPoints(12);
      expect(pts.length).toBeGreaterThan(8);
      for (const p of pts) expect(Number.isFinite(p.x + p.y)).toBe(true);
    }
  });
});
