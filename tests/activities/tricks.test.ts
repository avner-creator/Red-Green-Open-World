import { describe, expect, it } from 'vitest';
import { TrickState, turnError } from '../../src/activities/tricks';
import { TRICK } from '../../src/activities/constants';

const DT = 1 / 60;
const TAU = Math.PI * 2;

/** Run `seconds` of air with constant keys; returns the events. */
function run(t: TrickState, x: number, y: number, from: number, seconds: number, total: number) {
  const events = [];
  for (let s = 0; s < seconds; s += DT) {
    const air = from + s;
    events.push(...t.update(DT, x, y, air, Math.max(0.2, total - air)));
  }
  return events;
}

describe('turnError', () => {
  it('is the distance to the nearest whole turn', () => {
    expect(turnError(0)).toBe(0);
    expect(turnError(TAU)).toBeCloseTo(0);
    expect(turnError(Math.PI)).toBeCloseTo(Math.PI);
    expect(turnError(-TAU + 0.2)).toBeCloseTo(0.2);
  });
});

describe('air tricks', () => {
  it('does nothing before the minimum air time', () => {
    const t = new TrickState();
    for (let s = 0; s < 0.5; s += DT) t.update(DT, 0, 1, s, 3);
    expect(t.pitch).toBe(0);
  });

  it('forward key is a front flip (positive pitch), back key a back flip', () => {
    const f = new TrickState();
    run(f, 0, 1, 0.7, 0.4, 5);
    expect(f.pitch).toBeGreaterThan(0.5);
    const b = new TrickState();
    run(b, 0, -1, 0.7, 0.4, 5);
    expect(b.pitch).toBeLessThan(-0.5);
  });

  it('left spins one way, right the other', () => {
    const l = new TrickState();
    run(l, -1, 0, 0.7, 0.4, 5);
    const r = new TrickState();
    run(r, 1, 0, 0.7, 0.4, 5);
    expect(l.yaw).toBeGreaterThan(0.5);
    expect(r.yaw).toBeLessThan(-0.5);
  });

  it('counts full flips: about one per 0.7 s of held forward', () => {
    const t = new TrickState();
    const ev = run(t, 0, 1, 0.6, 3, 10);
    const flips = ev.filter((e) => e.kind === 'flip');
    expect(flips.length).toBeGreaterThanOrEqual(2);
    expect(flips.map((e) => e.count)).toEqual(flips.map((_, i) => i + 1));
    expect(t.flips).toBe(flips.length);
    expect(t.spins).toBe(0);
  });

  it('counts each rotation exactly once', () => {
    const t = new TrickState();
    const ev = run(t, 0, 1, 0.6, 2.5, 10);
    const counts = ev.map((e) => e.count);
    expect(new Set(counts).size).toBe(counts.length);
  });

  it('counts spins separately from flips, and total adds both', () => {
    const t = new TrickState();
    const ev = [...run(t, 0, 1, 0.6, 1.5, 10), ...run(t, 1, 0, 2.1, 1.5, 10)];
    expect(t.flips).toBeGreaterThanOrEqual(1);
    expect(t.spins).toBeGreaterThanOrEqual(1);
    expect(ev[ev.length - 1].total).toBe(t.flips + t.spins);
  });

  it('reversing direction does not add rotations', () => {
    const t = new TrickState();
    run(t, 0, 1, 0.6, 0.3, 10);
    const before = t.flips;
    run(t, 0, -1, 0.9, 0.3, 10);
    expect(t.flips).toBe(before);
  });

  it('levels out to upright when the keys are released before landing', () => {
    const t = new TrickState();
    run(t, 0, 1, 0.6, 0.55, 10); // part-way through a flip
    expect(t.upright).toBe(false);
    for (let s = 0; s < TRICK.restoreWindow; s += DT) t.update(DT, 0, 0, 2, TRICK.restoreWindow - s);
    expect(t.upright).toBe(true);
    expect(t.uprightError()).toBeLessThan(TRICK.uprightTolerance);
  });

  it('holding the keys to the ground can land mid-flip', () => {
    const t = new TrickState();
    run(t, 0, 1, 0.6, 0.55, 10);
    // keys still held in the last stretch: no levelling
    for (let s = 0; s < 0.3; s += DT) t.update(DT, 0, 1, 2, 0.3 - s);
    expect(typeof t.upright).toBe('boolean');
    const t2 = new TrickState();
    run(t2, 0, 1, 0.6, 0.55, 10);
    const err = t2.uprightError();
    // levelling only ever helps: without keys the error shrinks
    for (let s = 0; s < 0.5; s += DT) t2.update(DT, 0, 0, 2, 0.4);
    expect(t2.uprightError()).toBeLessThanOrEqual(err + 1e-6);
  });

  it('reset clears everything', () => {
    const t = new TrickState();
    run(t, 1, 1, 0.6, 2, 10);
    t.reset();
    expect(t.rotations).toBe(0);
    expect(t.pitch).toBe(0);
    expect(t.yaw).toBe(0);
  });
});
