import { describe, expect, it } from 'vitest';
import { CHALLENGE } from '../../src/vision/challenge/constants';
import {
  IDENTITY_MODIFIERS,
  createStaircase,
  easeModifiers,
  forcedModifiers,
  levelModifiers,
  resetStaircase,
  staircaseElapse,
  staircaseResult,
} from '../../src/vision/challenge/staircase';
import { LayerFade } from '../../src/vision/challenge/fade';
import { SessionTally } from '../../src/vision/challenge/tally';

const hits = (s: ReturnType<typeof createStaircase>, n: number): void => {
  for (let i = 0; i < n; i++) staircaseResult(s, true);
};

describe('staircase rules', () => {
  it('3 hits in a row → one step harder', () => {
    const s = createStaircase();
    expect(staircaseResult(s, true)).toBe(0);
    expect(staircaseResult(s, true)).toBe(0);
    expect(staircaseResult(s, true)).toBe(1);
    expect(s.level).toBe(1);
    expect(s.stepsUp).toBe(1);
    expect(s.streak).toBe(0);
  });
  it('1 miss → one step easier and the streak resets', () => {
    const s = createStaircase();
    hits(s, 6);
    expect(s.level).toBe(2);
    hits(s, 2);
    expect(staircaseResult(s, false)).toBe(-1);
    expect(s.level).toBe(1);
    expect(s.streak).toBe(0);
    expect(s.stepsDown).toBe(1);
    hits(s, 2);
    expect(s.level).toBe(1); // the 2 hits before the miss do not count
  });
  it('clamps at both ends and only counts real steps', () => {
    const s = createStaircase();
    expect(staircaseResult(s, false)).toBe(0);
    expect(s.level).toBe(0);
    expect(s.stepsDown).toBe(0);
    hits(s, 3 * 20);
    expect(s.level).toBe(CHALLENGE.maxLevel);
    expect(s.stepsUp).toBe(CHALLENGE.maxLevel);
  });
  it('no hit for 40 s of playing time → one step easier (not a miss)', () => {
    const s = createStaircase();
    hits(s, 6);
    expect(staircaseElapse(s, 39.9)).toBe(0);
    expect(staircaseElapse(s, 0.2)).toBe(-1);
    expect(s.level).toBe(1);
    expect(s.sinceHit).toBe(0);
    expect(staircaseElapse(s, 39)).toBe(0);
    staircaseResult(s, true); // a hit restarts the clock
    expect(staircaseElapse(s, 39)).toBe(0);
    expect(staircaseElapse(s, 1)).toBe(-1);
    expect(s.level).toBe(0);
    expect(staircaseElapse(s, 100)).toBe(0); // already at the bottom
    expect(staircaseElapse(s, -5)).toBe(0);
  });
  it('reset returns to level 0 with zero counters', () => {
    const s = createStaircase();
    hits(s, 7);
    staircaseResult(s, false);
    resetStaircase(s);
    expect(s).toEqual(createStaircase());
  });
});

describe('level → modifiers', () => {
  it('level 0 is identity', () => {
    expect(levelModifiers(0)).toEqual({ level: 0, maxLevel: 6, weakScale: 1, strongScale: 1, sizeScale: 1 });
    expect(IDENTITY_MODIFIERS).toEqual(levelModifiers(0));
  });
  it('floors at the top level', () => {
    const m = levelModifiers(CHALLENGE.maxLevel);
    expect(m.weakScale).toBeCloseTo(0.58);
    expect(m.strongScale).toBeCloseTo(0.7);
    expect(m.sizeScale).toBeCloseTo(0.76);
    expect(levelModifiers(99)).toEqual(m);
    expect(levelModifiers(-3)).toEqual(levelModifiers(0));
  });
  it('is monotonic', () => {
    for (let l = 1; l <= CHALLENGE.maxLevel; l++) {
      expect(levelModifiers(l).weakScale).toBeLessThan(levelModifiers(l - 1).weakScale);
      expect(levelModifiers(l).strongScale).toBeLessThan(levelModifiers(l - 1).strongScale);
    }
  });
  it('forced modifiers are clamped', () => {
    const f = forcedModifiers({ level: 12, weakScale: 1.5, strongScale: -1 });
    expect(f.level).toBe(6);
    expect(f.weakScale).toBe(1);
    expect(f.strongScale).toBe(0);
    expect(forcedModifiers({ weakScale: 0.6 })).toEqual({ ...IDENTITY_MODIFIERS, weakScale: 0.6 });
  });
});

describe('easing', () => {
  it('glides one level in easeSeconds, lands exactly, and dt 0 never moves it', () => {
    const target = levelModifiers(1);
    let m = { ...IDENTITY_MODIFIERS };
    m = easeModifiers(m, target, 0);
    expect(m.weakScale).toBe(1);
    m = easeModifiers(m, target, CHALLENGE.easeSeconds / 2);
    expect(m.weakScale).toBeCloseTo(1 - CHALLENGE.weakPerLevel / 2);
    expect(m.strongScale).toBeCloseTo(1 - CHALLENGE.strongPerLevel / 2);
    expect(m.level).toBe(1);
    m = easeModifiers(m, target, CHALLENGE.easeSeconds);
    expect(m).toEqual(target);
    m = easeModifiers(m, levelModifiers(0), 100);
    expect(m).toEqual(IDENTITY_MODIFIERS);
  });
});

describe('LayerFade', () => {
  it('applies at once with 0 seconds and clamps', () => {
    const f = new LayerFade();
    f.set(0.3);
    expect(f.value).toBe(0.3);
    f.set(4);
    expect(f.value).toBe(1);
    f.set(-1);
    expect(f.value).toBe(0);
  });
  it('eases smoothly over the given time, only by dt', () => {
    const f = new LayerFade();
    f.set(0, 1);
    expect(f.update(0)).toBe(1);
    expect(f.update(0.5)).toBeCloseTo(0.5);
    const q = f.update(0.25);
    expect(q).toBeGreaterThan(0);
    expect(q).toBeLessThan(0.5);
    expect(f.update(1)).toBe(0);
  });
});

describe('SessionTally', () => {
  it('groups by mechanic and tier', () => {
    const t = new SessionTally();
    t.record({ mechanic: 'gems', kind: 'find', tier: 1, hit: true });
    t.record({ mechanic: 'gems', kind: 'find', tier: 1, hit: true });
    t.record({ mechanic: 'glowflies', kind: 'follow', tier: 3, hit: false });
    t.record({ mechanic: 'gems', kind: 'find', tier: 2, hit: true });
    t.record({ mechanic: 'glowflies', kind: 'follow', tier: 3, hit: true });
    expect(t.rows()).toEqual([
      { mechanic: 'gems', kind: 'find', tier: 1, hits: 2, misses: 0 },
      { mechanic: 'glowflies', kind: 'follow', tier: 3, hits: 1, misses: 1 },
      { mechanic: 'gems', kind: 'find', tier: 2, hits: 1, misses: 0 },
    ]);
    t.clear();
    expect(t.rows()).toEqual([]);
  });
});
