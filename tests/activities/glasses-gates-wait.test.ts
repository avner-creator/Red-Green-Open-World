/**
 * Half-symbol gates, waiting for the pad (QA6 m3): a child who stays past the arch is called back
 * and then popped back onto the pad; an earned hit is never cancelled. Plus the ground trail.
 */
import { describe, expect, it } from 'vitest';
import { ROUND_DEFAULTS, RoundMachine } from '../../src/activities/glasses/booth/round';
import type { RoundEvent } from '../../src/activities/glasses/booth/round';
import { layoutTrail } from '../../src/activities/glasses/booth/trail';
import { GATE_PRIZE, GATE_RULES } from '../../src/activities/glasses/gates/constants';

const step = (m: RoundMachine, secs: number, ready: boolean): RoundEvent[] => {
  const out: RoundEvent[] = [];
  for (let t = 0; t < secs; t += 1 / 30) out.push(...m.step(1 / 30, ready));
  return out;
};

describe('waiting for the pad never loses a round (QA6 m3)', () => {
  it('a child who stays past the arch is called back, then popped back to the pad; the hit is kept', () => {
    const m = new RoundMachine(GATE_RULES);
    m.start();
    step(m, 3, true);
    m.report(true);
    const ev = step(m, ROUND_DEFAULTS.waitFetch + 1.5, false);
    const t = ev.map((e) => e.type);
    expect(t).toContain('wait');
    expect(t.indexOf('nudge')).toBeGreaterThan(t.indexOf('wait'));
    expect(t.indexOf('fetch')).toBeGreaterThan(t.indexOf('nudge'));
    expect(t).not.toContain('cancel');
    // The kit put the hero on the pad: the next run starts.
    const next = step(m, 0.2, true);
    expect(next.map((e) => e.type)).toContain('try');
    expect(m.results).toEqual([true]);
  });

  it('if the hero cannot be fetched (riding), the round ends with the hits so far: never a cancel', () => {
    const m = new RoundMachine(GATE_RULES);
    m.start();
    step(m, 3, true);
    m.report(true);
    step(m, 1.5, true);
    m.report(true);
    const ev = step(m, ROUND_DEFAULTS.waitFetch + 3, false);
    expect(ev.map((e) => e.type)).not.toContain('cancel');
    expect(ev.at(-1)).toEqual({ type: 'end', hits: 2, gems: GATE_PRIZE[1][2] });
  });

  it('the wait is much shorter than the old 34 s stall', () => {
    expect(ROUND_DEFAULTS.waitFetch).toBeLessThanOrEqual(12);
    expect(ROUND_DEFAULTS.waitNudge).toBeLessThan(ROUND_DEFAULTS.waitFetch);
  });

  it('an unanswered run still stalls out quietly', () => {
    const m = new RoundMachine({ ...GATE_RULES, stall: 10 });
    m.start();
    expect(step(m, 14, true).map((e) => e.type).slice(-2)).toEqual(['cancel', 'idle']);
  });
});

describe('back-to-the-pad trail', () => {
  it('arrows march along the path toward the pad and stop short of it', () => {
    const path = [{ x: 0, z: -4 }, { x: 0, z: 0 }, { x: 3, z: 4 }];
    const a = layoutTrail(path, 0, 14, 1.2);
    const b = layoutTrail(path, 0.3, 14, 1.2);
    expect(a.length).toBeGreaterThan(4);
    expect(a[0].yaw).toBeCloseTo(0, 5);
    expect(a.at(-1)!.yaw).toBeCloseTo(Math.atan2(3, 4), 5);
    // Marching: the first arrow moved on along the path.
    expect(b[0].z).toBeGreaterThan(a[0].z);
    for (const s of a) expect(Math.hypot(s.x - 3, s.z - 4)).toBeGreaterThan(1.1);
  });

  it('no trail when the child is already by the pad', () => {
    expect(layoutTrail([{ x: 0, z: 0 }, { x: 0, z: 1.5 }], 0, 14, 1.2)).toEqual([]);
  });
});
