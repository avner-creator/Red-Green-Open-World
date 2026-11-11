import { describe, expect, it } from 'vitest';
import {
  AREA,
  ApproachHints,
  ChestLock,
  E_PICK,
  Loadout,
  facedButton,
  RING,
  buttonWorld,
  keyArea,
  keyCandidates,
  nearestButton,
  pickKeySpot,
  ringButtons,
  rightSymbol,
  sideDirection,
} from '../../src/activities/chests/logic';
import { OUTFITS, outfitForChest } from '../../src/activities/chests/outfits';
import { symbolShape } from '../../src/activities/chests/lockModel';

describe('right symbol', () => {
  it('is deterministic per chest and valid', () => {
    const a = Array.from({ length: 6 }, (_, i) => rightSymbol(i));
    expect(a).toEqual(Array.from({ length: 6 }, (_, i) => rightSymbol(i)));
    for (const s of a) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(3);
    }
    expect(new Set(a).size).toBeGreaterThan(1);
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

describe('symbol ring', () => {
  it('has six buttons, each of the three symbols twice, twins opposite each other', () => {
    const r = ringButtons();
    expect(r).toHaveLength(6);
    for (const sym of [0, 1, 2]) {
      const mine = r.filter((b) => b.symbol === sym);
      expect(mine).toHaveLength(2);
      expect(Math.abs(mine[0].angle - mine[1].angle)).toBeCloseTo(Math.PI, 5);
    }
  });

  it('is evenly spaced with room for 1.2 m buttons', () => {
    const r = ringButtons();
    const gap = 2 * RING.radius * Math.sin(Math.PI / r.length);
    expect(gap).toBeGreaterThan(RING.size);
  });

  it('a right button is within 4.5 m of a player coming from any direction', () => {
    const right = rightSymbol(0);
    const mine = ringButtons().filter((b) => b.symbol === right);
    for (let a = 0; a < Math.PI * 2; a += 0.1) {
      const px = Math.sin(a) * (RING.radius + 1.5);
      const pz = Math.cos(a) * (RING.radius + 1.5);
      const best = Math.min(...mine.map((b) => Math.hypot(buttonWorld(0, 0, 0, b.angle).x - px, buttonWorld(0, 0, 0, b.angle).z - pz)));
      expect(best).toBeLessThan(4.5);
    }
  });

  it('buttonWorld follows the chest yaw and position', () => {
    const p = buttonWorld(10, 5, 0, 0);
    expect(p.x).toBeCloseTo(10);
    expect(p.z).toBeCloseTo(5 + RING.radius);
    const q = buttonWorld(10, 5, Math.PI / 2, 0); // chest front faces +X
    expect(q.x).toBeCloseTo(10 + RING.radius);
    expect(q.z).toBeCloseTo(5);
  });

  it('nearestButton picks the closest within reach, else -1', () => {
    const pts = [{ x: 0, z: 0 }, { x: 3, z: 0 }];
    expect(nearestButton(pts, 2.2, 0, 2.6)).toBe(1);
    expect(nearestButton(pts, 1.4, 0.1, 2.6)).toBe(0);
    expect(nearestButton(pts, 30, 0, 2.6)).toBe(-1);
  });
});

describe('E at a chest never spends a try by accident (QA6 m2)', () => {
  // The six tiles round a chest at the origin, like the game lays them out.
  const pts = Array.from({ length: RING.count }, (_, i) => {
    const a = (i / RING.count) * Math.PI * 2;
    return { x: Math.sin(a) * RING.radius, z: Math.cos(a) * RING.radius };
  });
  const yawTo = (fx: number, fz: number, tx: number, tz: number): number => Math.atan2(tx - fx, tz - fz);

  it('at the chest, facing it: no tile (E does nothing)', () => {
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      const px = Math.sin(ang) * 1.1;
      const pz = Math.cos(ang) * 1.1;
      expect(facedButton(pts, px, pz, yawTo(px, pz, 0, 0)), `from ${a}`).toBe(-1);
    }
  });

  it('standing on a tile: that tile, whichever way the hero faces', () => {
    for (const [i, p] of pts.entries()) {
      for (const yaw of [0, 1.5, 3, -2]) expect(facedButton(pts, p.x + 0.3, p.z - 0.2, yaw)).toBe(i);
    }
  });

  it('clearly facing one tile within reach: that tile', () => {
    for (const [i, p] of pts.entries()) {
      // 1.2 m outward from the tile, facing it.
      const l = Math.hypot(p.x, p.z);
      const px = p.x + (p.x / l) * 1.2;
      const pz = p.z + (p.z / l) * 1.2;
      expect(facedButton(pts, px, pz, yawTo(px, pz, p.x, p.z))).toBe(i);
      // Turned away: nothing.
      expect(facedButton(pts, px, pz, yawTo(px, pz, p.x, p.z) + Math.PI)).toBe(-1);
    }
  });

  it('between two tiles, or one too far away: nothing', () => {
    const [a, b] = [pts[0], pts[1]];
    const mx = (a.x + b.x) / 2;
    const mz = (a.z + b.z) / 2;
    const l = Math.hypot(mx, mz);
    const px = mx + (mx / l) * 0.9;
    const pz = mz + (mz / l) * 0.9;
    expect(facedButton(pts, px, pz, yawTo(px, pz, mx, mz))).toBe(-1);
    const far = { x: pts[2].x * 2.4, z: pts[2].z * 2.4 };
    expect(Math.hypot(far.x - pts[2].x, far.z - pts[2].z)).toBeGreaterThan(E_PICK.reach);
    expect(facedButton(pts, far.x, far.z, yawTo(far.x, far.z, pts[2].x, pts[2].z))).toBe(-1);
  });
});

describe('ChestLock state machine', () => {
  it('no key: any shape only boings and the chest stays locked', () => {
    const l = new ChestLock(2);
    for (const s of [0, 1, 2]) expect(l.press(s)).toBe('no-key');
    expect(l.opened).toBe(false);
    expect(l.wrongTries).toBe(0);
  });

  it('picks the key up once', () => {
    const l = new ChestLock(0);
    expect(l.pickUp()).toBe(true);
    expect(l.pickUp()).toBe(false);
    expect(l.hasKey).toBe(true);
  });

  it('key + wrong symbol wobbles and keeps the key (no penalty, unlimited tries); the right one opens', () => {
    const l = new ChestLock(1);
    l.pickUp();
    expect(l.press(0)).toBe('wrong-symbol');
    expect(l.press(2)).toBe('wrong-symbol');
    expect(l.press(0)).toBe('wrong-symbol');
    expect(l.wrongTries).toBe(3);
    expect(l.hasKey).toBe(true);
    expect(l.opened).toBe(false);
    expect(l.press(1)).toBe('opened');
    expect(l.opened).toBe(true);
    expect(l.key).toBe('used');
    expect(l.press(1)).toBe('already-open');
  });

  it('opens from every direction: any button of the right symbol works', () => {
    const right = rightSymbol(3);
    for (const b of ringButtons().filter((x) => x.symbol === right)) {
      const l = new ChestLock(right);
      l.pickUp();
      expect(l.press(b.symbol)).toBe('opened');
    }
  });

  it('reset restores the start state', () => {
    const l = new ChestLock(0);
    l.pickUp();
    l.press(1);
    l.press(0);
    l.reset();
    expect(l.key).toBe('ground');
    expect(l.opened).toBe(false);
    expect(l.wrongTries).toBe(0);
  });
});

describe('approach hints', () => {
  it('says "find the key" once per approach, not every frame', () => {
    const h = new ApproachHints();
    expect(h.update(20, false, false)).toBeNull();
    expect(h.update(4, false, false)).toBe('find-key');
    for (let i = 0; i < 100; i++) expect(h.update(3, false, false)).toBeNull();
    // Hovering around the edge does not re-arm it.
    expect(h.update(6.5, false, false)).toBeNull();
    expect(h.update(4, false, false)).toBeNull();
    // Leaving and coming back does.
    expect(h.update(9, false, false)).toBeNull();
    expect(h.update(4, false, false)).toBe('find-key');
  });

  it('with the key, says "step on the right shape" once (also when the key is picked up nearby)', () => {
    const h = new ApproachHints();
    expect(h.update(4, true, false)).toBe('step-shape');
    expect(h.update(3, true, false)).toBeNull();
    const g = new ApproachHints();
    expect(g.update(4, false, false)).toBe('find-key');
    expect(g.update(4, true, false)).toBe('step-shape');
    expect(g.update(4, true, false)).toBeNull();
  });

  it('says nothing once open, and isNear tells whether a guide may talk', () => {
    const h = new ApproachHints();
    h.update(4, false, false);
    expect(h.isNear).toBe(true);
    expect(h.update(4, true, true)).toBeNull();
    expect(h.isNear).toBe(false);
    h.reset();
    expect(h.update(4, false, false)).toBe('find-key');
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

describe('both-eye key area hint', () => {
  it('the key is inside the dotted circle but never at its centre; dots stay off the button ring', () => {
    for (let i = 0; i < 60; i++) {
      for (const c of keyCandidates(i, 3, -4).slice(0, 40)) {
        const a = keyArea(i, 3, -4, c.x, c.z);
        const fromCentre = Math.hypot(c.x - a.x, c.z - a.z);
        expect(fromCentre).toBeCloseTo(AREA.offset, 5);
        expect(fromCentre).toBeLessThan(a.r - 0.8);
        for (const d of [...a.trail, ...a.ring]) expect(Math.hypot(d.x - 3, d.z + 4)).toBeGreaterThan(RING.radius + RING.size / 2 + 0.3);
        expect(a.ring).toHaveLength(AREA.ringDots);
        // The trail runs out from the chest toward the circle and stops at its edge.
        for (const d of a.trail) expect(Math.hypot(d.x - a.x, d.z - a.z)).toBeGreaterThanOrEqual(a.r - 1e-6);
      }
    }
  });

  it('is the same every time for the same chest', () => {
    expect(keyArea(2, 0, 0, 8, 1)).toEqual(keyArea(2, 0, 0, 8, 1));
  });
});
