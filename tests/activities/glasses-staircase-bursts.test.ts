/**
 * QA measurement for the Auto challenge staircase: how many levels can one round of each result
 * source move it? (Phase 2 results: foam reports every landing on a hidden tile, carnival booths each
 * prize, the boost part reports every pad crossed cold.) The assertions are loose guards; the numbers
 * are printed for the QA report (`npx vitest run tests/activities/glasses-staircase-bursts.test.ts`).
 */
import { describe, expect, it } from 'vitest';
import { perfectRange, windowHalf } from '../../src/activities/glasses/weave/bounce/logic';
import { CHUTE } from '../../src/activities/glasses/weave/chute/logic';
import { createStaircase, staircaseElapse, staircaseResult } from '../../src/vision/challenge/staircase';

/** Run a sequence of [hit, secondsBefore] from level `start`; returns {max, min, end, up, down}. */
function run(seq: readonly (readonly [boolean, number])[], start = 0): { max: number; min: number; end: number } {
  const s = createStaircase();
  s.level = start;
  let max = start;
  let min = start;
  for (const [hit, dt] of seq) {
    staircaseElapse(s, dt);
    staircaseResult(s, hit);
    max = Math.max(max, s.level);
    min = Math.min(min, s.level);
  }
  return { max, min, end: s.level };
}

const hits = (n: number, gap: number): [boolean, number][] => Array.from({ length: n }, () => [true, gap] as [boolean, number]);
const pattern = (n: number, pHit: number, gap: number, seed = 1): [boolean, number][] => {
  let x = seed;
  const rnd = (): number => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
  return Array.from({ length: n }, () => [rnd() < pHit, gap] as [boolean, number]);
};

describe('blind-guess odds (weak eye shut, best fixed strategy)', () => {
  it('bounce: best fixed press time per fall length; chute ring: best fixed open height', () => {
    const rows: Record<string, number> = {};
    for (const fall of [1.28, 1.6, 2.0, 2.5, 3.0]) {
      for (const tier of [1, 2, 3] as const) {
        const r = perfectRange(fall, tier);
        if (!r) continue;
        const half = windowHalf(fall, tier);
        // The perfect moment is uniform in [lo, hi]; a press at the range centre covers 2*half of it.
        rows[`bounce fall ${fall}s tier ${tier}`] = Math.min(1, (2 * half) / (r.hi - r.lo));
      }
    }
    for (const tier of [1, 2, 3] as const) rows[`chute ring tier ${tier}`] = Math.min(1, (2 * CHUTE.window[tier]) / (CHUTE.targetMax - CHUTE.targetMin));
    console.log(JSON.stringify(rows, null, 1));
    expect(rows['chute ring tier 1']).toBeGreaterThan(0.12); // the notes claim ~12 %; a fixed open height does better
  });
});

describe('auto challenge: bursts from result sources', () => {
  it('prints levels moved per source', () => {
    const rows: Record<string, unknown> = {
      'foam shortcut run, 14 landings 0.4 s apart': run(hits(14, 0.4)),
      'foam shortcut run, 14 landings, start 3': run(hits(14, 0.4), 3),
      'carnival 5 booths, 1 hit each 8 s apart': run(hits(5, 8)),
      'dino sumo 6 balloons 2 s apart': run(hits(6, 2)),
      'boost: 18 pads, blind (28% hit)': run(pattern(18, 0.28, 6), 3),
      'boost: 18 pads, on the beat (90% hit)': run(pattern(18, 0.9, 6), 3),
      'gems alone: 20 pickups 3 s apart (existing)': run(hits(20, 3)),
      'bounce tapping: 20 presses, 15% hit': run(pattern(20, 0.15, 2), 3),
    };
    console.log(JSON.stringify(rows, null, 1));
    expect(run(hits(14, 0.4)).max).toBeGreaterThanOrEqual(4); // a foam shortcut run alone climbs 4 of 6 levels
  });

  it('with a 4 s minimum gap between counted hits (proposed)', () => {
    // Hits closer than 4 s are dropped (the time still passes).
    const drop = (seq: readonly (readonly [boolean, number])[]): { max: number; end: number } => {
      const s = createStaircase();
      let since = 99;
      let max = 0;
      for (const [hit, dt] of seq) {
        staircaseElapse(s, dt);
        since += dt;
        if (hit) {
          if (since < 4) continue;
          since = 0;
        }
        staircaseResult(s, hit);
        max = Math.max(max, s.level);
      }
      return { max, end: s.level };
    };
    const rows = {
      'foam 14 landings 0.4 s apart': drop(hits(14, 0.4)),
      'sumo 6 balloons 2 s apart': drop(hits(6, 2)),
      'gems 20 pickups 3 s apart': drop(hits(20, 3)),
      'carnival 5 booths 8 s apart': drop(hits(5, 8)),
    };
    console.log(JSON.stringify(rows, null, 1));
    expect(drop(hits(14, 0.4)).max).toBeLessThanOrEqual(1);
  });
});
