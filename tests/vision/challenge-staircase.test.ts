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

type Stair = ReturnType<typeof createStaircase>;
const GAP = CHALLENGE.hitSpacingSeconds;
/** Playing-time clock for the tests: every hit through `hits` is spaced so it counts. */
let now = 0;
const hit = (s: Stair, t = (now += GAP)): ReturnType<typeof staircaseResult> => staircaseResult(s, true, t);
const miss = (s: Stair): ReturnType<typeof staircaseResult> => staircaseResult(s, false, now);
const hits = (s: Stair, n: number): void => {
  for (let i = 0; i < n; i++) hit(s);
};

describe('staircase rules', () => {
  it('3 hits in a row → one step harder', () => {
    const s = createStaircase();
    expect(hit(s)).toBe(0);
    expect(hit(s)).toBe(0);
    expect(hit(s)).toBe(1);
    expect(s.level).toBe(1);
    expect(s.stepsUp).toBe(1);
    expect(s.streak).toBe(0);
  });
  it('1 miss → one step easier and the streak resets', () => {
    const s = createStaircase();
    hits(s, 6);
    expect(s.level).toBe(2);
    hits(s, 2);
    expect(miss(s)).toBe(-1);
    expect(s.level).toBe(1);
    expect(s.streak).toBe(0);
    expect(s.stepsDown).toBe(1);
    hits(s, 2);
    expect(s.level).toBe(1); // the 2 hits before the miss do not count
  });
  it('clamps at both ends and only counts real steps', () => {
    const s = createStaircase();
    expect(miss(s)).toBe(0);
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
    hit(s); // a hit restarts the clock
    expect(staircaseElapse(s, 39)).toBe(0);
    expect(staircaseElapse(s, 1)).toBe(-1);
    expect(s.level).toBe(0);
    expect(staircaseElapse(s, 100)).toBe(0); // already at the bottom
    expect(staircaseElapse(s, -5)).toBe(0);
  });
  it('reset returns to level 0 with zero counters', () => {
    const s = createStaircase();
    hits(s, 7);
    miss(s);
    resetStaircase(s);
    expect(s).toEqual(createStaircase());
  });
});

describe('hit pacing (bursts)', () => {
  it(`counts a hit only ${CHALLENGE.hitSpacingSeconds} s of play after the last counted one`, () => {
    expect(CHALLENGE.hitSpacingSeconds).toBe(4);
  });
  it('a burst of 14 hits in 2 s moves the staircase by at most one counted hit', () => {
    const s = createStaircase();
    for (let i = 0; i < 14; i++) expect(staircaseResult(s, true, 10 + (2 * i) / 13)).toBe(0);
    expect(s.streak).toBe(1);
    expect(s.level).toBe(0);
    // Even mid-streak a burst adds only one.
    const t = createStaircase();
    staircaseResult(t, true, 0);
    staircaseResult(t, true, 4);
    for (let i = 0; i < 14; i++) staircaseResult(t, true, 8 + (2 * i) / 13);
    expect(t.level).toBe(1);
    expect(t.stepsUp).toBe(1);
    expect(t.streak).toBe(0);
  });
  it('three hits spaced 4 s apart step one level; 3.9 s is too soon', () => {
    const s = createStaircase();
    expect(staircaseResult(s, true, 100)).toBe(0);
    expect(staircaseResult(s, true, 103.9)).toBe(0);
    expect(staircaseResult(s, true, 104)).toBe(0);
    expect(staircaseResult(s, true, 107.95)).toBe(0);
    expect(staircaseResult(s, true, 108)).toBe(1);
    expect(s.level).toBe(1);
  });
  it('the fastest climb is one level per 8 s, six levels in no less than 48 s', () => {
    const s = createStaircase();
    let t = 0;
    while (s.level < CHALLENGE.maxLevel) {
      t += 0.5; // a hit every half second
      staircaseResult(s, true, t);
    }
    expect(t).toBeGreaterThanOrEqual(2 * CHALLENGE.hitSpacingSeconds * CHALLENGE.maxLevel);
  });
  it('a miss inside a burst still steps down at once and resets the streak', () => {
    const s = createStaircase();
    for (let i = 0; i < 6; i++) staircaseResult(s, true, i * 4);
    expect(s.level).toBe(2);
    staircaseResult(s, true, 24);
    staircaseResult(s, true, 24.1);
    expect(staircaseResult(s, false, 24.2)).toBe(-1);
    expect(s.level).toBe(1);
    expect(s.streak).toBe(0);
    staircaseResult(s, true, 24.3); // still inside the spacing: not counted
    expect(s.streak).toBe(0);
    staircaseResult(s, true, 28);
    expect(s.streak).toBe(1);
  });
  it('an ignored hit still resets the drought timer', () => {
    const s = createStaircase();
    for (let i = 0; i < 3; i++) staircaseResult(s, true, i * 4); // counted at 0, 4, 8
    expect(s.level).toBe(1);
    expect(staircaseElapse(s, 3)).toBe(0); // t = 11
    expect(staircaseResult(s, true, 11)).toBe(0); // ignored: 3 s after the counted hit at 8
    expect(s.streak).toBe(0);
    expect(s.lastCountedHit).toBe(8);
    expect(s.sinceHit).toBe(0); // the child is succeeding: not a drought
    expect(staircaseElapse(s, 39)).toBe(0); // 42 s after the last counted hit, 39 s after any hit
    expect(s.level).toBe(1);
    expect(staircaseElapse(s, 1)).toBe(-1);
    expect(s.level).toBe(0);
  });
  it('the tally still counts every hit of a burst', () => {
    const s = createStaircase();
    const tally = new SessionTally();
    for (let i = 0; i < 14; i++) {
      tally.record({ mechanic: 'foamSecret', kind: 'find', tier: 2, hit: true });
      staircaseResult(s, true, (2 * i) / 13);
    }
    expect(tally.rows()).toEqual([{ mechanic: 'foamSecret', kind: 'find', tier: 2, hits: 14, misses: 0 }]);
    expect(s.streak).toBe(1);
  });
});

describe('miss pacing (per mechanic)', () => {
  /** A staircase at level 3 (9 counted hits, 4 s apart, ending at t = 32). */
  const atLevel3 = (): Stair => {
    const s = createStaircase();
    for (let i = 0; i < 9; i++) staircaseResult(s, true, i * 4);
    expect(s.level).toBe(3);
    return s;
  };
  it('pins the number', () => {
    expect(CHALLENGE.missSpacingSeconds).toBe(4);
  });
  it('6 misses from one mechanic within 3 s → exactly one step down', () => {
    const s = atLevel3();
    const dirs = [0, 0.5, 1, 1.5, 2, 3].map((d) => staircaseResult(s, false, 40 + d, 'bellSweet'));
    expect(dirs).toEqual([-1, 0, 0, 0, 0, 0]);
    expect(s.level).toBe(2);
    expect(s.stepsDown).toBe(1);
  });
  it('two misses 5 s apart → two steps', () => {
    const s = atLevel3();
    expect(staircaseResult(s, false, 40, 'vaultDoor')).toBe(-1);
    expect(staircaseResult(s, false, 45, 'vaultDoor')).toBe(-1);
    expect(s.level).toBe(1);
  });
  it('misses from two different mechanics within 1 s → two steps', () => {
    const s = atLevel3();
    expect(staircaseResult(s, false, 40, 'vaultDoor')).toBe(-1);
    expect(staircaseResult(s, false, 40.8, 'scoopsSecret')).toBe(-1);
    expect(s.level).toBe(1);
  });
  it('an ignored miss does not reset the hit streak', () => {
    const s = atLevel3();
    staircaseResult(s, false, 40, 'glowDodge'); // counted: level 2, streak 0
    staircaseResult(s, true, 40.5); // counted hit (8.5 s after the last): streak 1
    staircaseResult(s, false, 41, 'glowDodge'); // ignored
    expect(s.streak).toBe(1);
    expect(s.level).toBe(2);
  });
  it('the first miss always counts, and a reset forgets every mechanic', () => {
    const s = atLevel3();
    expect(staircaseResult(s, false, 0, 'x')).toBe(-1);
    resetStaircase(s);
    expect(s.lastCountedMiss).toEqual({});
    for (let i = 0; i < 6; i++) staircaseResult(s, true, i * 4);
    expect(staircaseResult(s, false, 21, 'x')).toBe(-1);
  });
  it('the tally counts every miss of a spree', () => {
    const s = atLevel3();
    const tally = new SessionTally();
    for (let i = 0; i < 6; i++) {
      tally.record({ mechanic: 'bellSweet', kind: 'timeIt', tier: 2, hit: false });
      staircaseResult(s, false, 40 + i * 0.5, 'bellSweet');
    }
    expect(tally.rows()).toEqual([{ mechanic: 'bellSweet', kind: 'timeIt', tier: 2, hits: 0, misses: 6 }]);
    expect(s.level).toBe(2);
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
