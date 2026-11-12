import { describe, expect, it } from 'vitest';
import { HERO_LUCK, HeroLuck } from '../../src/activities/glasses/weave/hero/logic';
import type { SparkKind } from '../../src/activities/glasses/weave/hero/logic';
import { mulberry32 } from '../../src/vision/toolkit/rng';

const DT = 1 / 60;
const BOTH = { skill: true, combo: true } as const;
const SKILL_ONLY = { skill: true, combo: false } as const;
const NONE = { skill: false, combo: false } as const;

/** Step until a sparkle opens (or `max` s); returns the seconds it took. */
function untilOpen(l: HeroLuck, showing: Readonly<Record<SparkKind, boolean>>, max = 60): number {
  let t = 0;
  while (t < max) {
    t += DT;
    if (l.update(DT, showing) === 'opened') return t;
  }
  return Infinity;
}

describe('hero lucky-moment scheduler', () => {
  it('sparkles every 20–40 s of play, only while a helper is showing', () => {
    const l = new HeroLuck(mulberry32(3));
    untilOpen(l, SKILL_ONLY);
    for (let i = 0; i < 40; i++) {
      // From one sparkle start to the next: the window, then 20–40 s of countdown.
      const t = untilOpen(l, SKILL_ONLY);
      expect(t).toBeGreaterThanOrEqual(HERO_LUCK.gapMin);
      expect(t).toBeLessThanOrEqual(HERO_LUCK.gapMax + HERO_LUCK.window[1] + 0.1);
      expect(l.spark?.kind).toBe('skill');
    }
    for (let k = 0; k < 4 * 60; k++) l.update(DT, SKILL_ONLY);
    expect(l.spark).toBeNull();
    // With no helper showing the countdown stands still.
    const before = l.nextIn;
    for (let k = 0; k < 120 * 60; k++) expect(l.update(DT, NONE)).toBeNull();
    expect(l.nextIn).toBe(before);
  });

  it('a skill sparkle waits until the skill has been unused for the calm time', () => {
    const l = new HeroLuck(mulberry32(4));
    l.nextIn = 0.5;
    let t = 0;
    while (t < 10) {
      // Fire the skill every 2 s: never calm long enough.
      if (Math.round(t / DT) % 120 === 0) l.act('skill');
      expect(l.update(DT, SKILL_ONLY)).not.toBe('opened');
      t += DT;
    }
    expect(untilOpen(l, SKILL_ONLY, 5)).toBeLessThanOrEqual(HERO_LUCK.calm + 0.1);
  });

  it('picks only helpers that can sparkle; the combo number when only it shows', () => {
    const l = new HeroLuck(mulberry32(5));
    l.nextIn = 0;
    l.act('skill'); // not calm: only the combo can sparkle
    expect(l.update(DT, BOTH)).toBe('opened');
    expect(l.spark?.kind).toBe('combo');
  });

  it('hit in the window, miss within 1.5 s after it, nothing otherwise; a spammed press spoils', () => {
    const l = new HeroLuck(mulberry32(6));
    // Hit.
    l.open('skill');
    for (let i = 0; i < 30; i++) l.update(DT, SKILL_ONLY);
    expect(l.act('skill')).toEqual({ grade: 'hit', kind: 'skill', tier: 1 });
    expect(l.act('skill')).toBeNull(); // one result per window
    // Wrong action during a sparkle: nothing, and the sparkle stays.
    l.open('combo');
    for (let i = 0; i < 30; i++) l.update(DT, BOTH);
    expect(l.act('skill')).toBeNull();
    expect(l.spark?.kind).toBe('combo');
    // Late = miss.
    while (l.spark) l.update(DT, BOTH);
    for (let i = 0; i < 60; i++) l.update(DT, BOTH);
    expect(l.act('combo')).toEqual({ grade: 'miss', kind: 'combo', tier: 1 });
    // Too late: nothing.
    l.open('combo');
    while (l.spark) l.update(DT, BOTH);
    for (let i = 0; i < 100; i++) l.update(DT, BOTH);
    expect(l.act('combo')).toBeNull();
    // Too soon after the sparkle started (no reaction possible): spoiled, no result.
    l.open('skill');
    l.update(DT, SKILL_ONLY);
    expect(l.act('skill')).toBeNull();
    expect(l.spark).toBeNull();
    expect(l.spoiled).toBe(1);
  });

  it('the helper going away cancels the sparkle without a result (after a short grace)', () => {
    const l = new HeroLuck(mulberry32(7));
    l.open('skill');
    l.update(DT, SKILL_ONLY);
    let res: string | null = null;
    for (let t = 0; t < HERO_LUCK.grace + 0.1 && res === null; t += DT) res = l.update(DT, NONE);
    expect(res).toBe('cancelled');
    expect(l.cancelled).toBe(1);
    expect(l.act('skill')).toBeNull();
  });

  it('QA8 M4: firing the skill during the ring sparkle is a hit even when "not ready" is seen first', () => {
    const l = new HeroLuck(mulberry32(9));
    l.open('skill');
    for (let i = 0; i < 30; i++) l.update(DT, SKILL_ONLY);
    // The skill fired: it stops being ready this frame, and the game updates the helper before
    // it handles the `player:skill` event (one or a few frames later).
    expect(l.update(DT, NONE)).toBeNull();
    expect(l.update(DT, NONE)).toBeNull();
    expect(l.act('skill')).toEqual({ grade: 'hit', kind: 'skill', tier: 1 });
    expect(l.cancelled).toBe(0);
    for (let i = 0; i < 60; i++) expect(l.update(DT, NONE)).toBeNull();
    expect(l.cancelled).toBe(0);
    // The same order straight away after the sparkle starts is still a spoiled spam press.
    l.open('skill');
    l.update(DT, NONE);
    expect(l.act('skill')).toBeNull();
    expect(l.spoiled).toBe(1);
  });

  it('tier rises after two hits, falls after a miss; the window shortens 1.5 / 1.0 / 0.7 s', () => {
    const l = new HeroLuck(mulberry32(8));
    const hit = (): void => {
      l.open('skill', 0.5);
      expect(l.act('skill')?.grade).toBe('hit');
    };
    expect(l.open('skill').len).toBe(1.5);
    l.spark = null;
    hit();
    hit();
    expect(l.tier).toBe(2);
    expect(l.open('skill').len).toBe(1.0);
    l.spark = null;
    hit();
    hit();
    expect(l.tier).toBe(3);
    expect(l.open('combo').len).toBe(0.7);
    while (l.spark) l.update(DT, BOTH);
    expect(l.act('combo')?.grade).toBe('miss');
    expect(l.tier).toBe(2);
  });
});

describe('hero lucky-moment simulation', () => {
  /**
   * A child who ignores the layer and fires the skill at random moments (Poisson, mean gap `gap`
   * s, a press while the skill recharges does nothing). The ring helper is always showing.
   */
  function blindSkill(gap: number, minutes = 600, seed = 21): { windows: number; hits: number; misses: number } {
    const rng = mulberry32(seed);
    const l = new HeroLuck(mulberry32(seed + 1));
    const cooldown = 1.5;
    let cd = 0;
    let windows = 0;
    let hits = 0;
    let misses = 0;
    for (let t = 0; t < minutes * 60; t += DT) {
      cd = Math.max(0, cd - DT);
      if (l.update(DT, { skill: cd <= 0, combo: false }) === 'opened') windows++;
      if (cd <= 0 && rng() < DT / gap) {
        cd = cooldown;
        const r = l.act('skill');
        if (r?.grade === 'hit') hits++;
        if (r?.grade === 'miss') misses++;
      }
    }
    return { windows, hits, misses };
  }

  it('a child who uses the skill at random times hits fewer than 10 % of the windows', () => {
    const r = blindSkill(15);
    expect(r.windows).toBeGreaterThan(200);
    expect(r.hits / r.windows).toBeLessThan(0.1);
    console.info(`hero blind (skill every ~15 s): ${r.windows} windows, hit ${((100 * r.hits) / r.windows).toFixed(1)} %, miss ${((100 * r.misses) / r.windows).toFixed(1)} %`);
    const busy = blindSkill(8);
    console.info(`hero blind (skill every ~8 s): hit ${((100 * busy.hits) / busy.windows).toFixed(1)} %`);
  });

  it('a child who fires when the ring sparkles (0.35–0.9 s reaction) hits nearly every window', () => {
    const rng = mulberry32(31);
    const l = new HeroLuck(mulberry32(32));
    let windows = 0;
    let hits = 0;
    let fireAt = -1;
    for (let t = 0; t < 600 * 60; t += DT) {
      if (l.update(DT, SKILL_ONLY) === 'opened') {
        windows++;
        // Reaction time; the window shrinks with the tier, so the child is quicker at higher tiers.
        fireAt = t + Math.min(0.35 + 0.55 * rng(), l.spark!.len - 0.1);
      }
      if (fireAt >= 0 && t >= fireAt) {
        fireAt = -1;
        if (l.act('skill')?.grade === 'hit') hits++;
      }
    }
    expect(hits / windows).toBeGreaterThan(0.9);
  });
});
