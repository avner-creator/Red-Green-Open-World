import { describe, expect, it } from 'vitest';
import {
  HORSE,
  approachSpeed,
  clipRate,
  gaitFor,
  hoofSound,
  jumpAirTime,
  jumpVelocity,
  rearPitch,
  slopeFactor,
  targetSpeed,
  turnRate,
  waterResponse,
} from '../../src/core/vehicles/horse-math';

/** Integrate speed toward the stick's target for `seconds`. */
function ride(throttle: number, sprint: boolean, seconds: number, v0 = 0): number {
  let v = v0;
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) v = approachSpeed(v, targetSpeed(throttle, sprint), dt);
  return v;
}

describe('horse gaits and speed', () => {
  it('walks on a gentle stick, trots on full stick, gallops with Shift at ~13 m/s', () => {
    expect(gaitFor(targetSpeed(0.4, false))).toBe('walk');
    expect(gaitFor(targetSpeed(1, false))).toBe('trot');
    expect(targetSpeed(1, true)).toBeCloseTo(13, 5);
    expect(gaitFor(targetSpeed(1, true))).toBe('gallop');
    expect(targetSpeed(0, true)).toBe(0);
    // Faster than sprinting on foot (11 m/s).
    expect(HORSE.gallopSpeed).toBeGreaterThan(11);
  });

  it('gait thresholds go idle → walk → trot → gallop, and backing up is a walk', () => {
    expect(gaitFor(0)).toBe('idle');
    expect(gaitFor(2)).toBe('walk');
    expect(gaitFor(7)).toBe('trot');
    expect(gaitFor(12)).toBe('gallop');
    expect(gaitFor(-2)).toBe('walk');
    expect(targetSpeed(-1, true)).toBeCloseTo(-HORSE.reverseSpeed, 5);
  });

  it('target speed rises monotonically with the stick', () => {
    let prev = -Infinity;
    for (let t = 0.1; t <= 1.0001; t += 0.05) {
      const v = targetSpeed(t, true);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('reaches gallop in under 2.5 s, never overshoots, and coasts to a stop', () => {
    expect(ride(1, true, 1)).toBeGreaterThan(6);
    const top = ride(1, true, 2.5);
    expect(top).toBeCloseTo(13, 3);
    expect(ride(1, true, 5)).toBeLessThanOrEqual(13 + 1e-9);
    expect(ride(0, false, 3, 13)).toBe(0);
    // Pulling back brakes harder than letting go.
    expect(ride(-1, false, 0.5, 13)).toBeLessThan(ride(0, false, 0.5, 13));
  });

  it('turns nimbly when slow and in wide arcs at a gallop', () => {
    expect(turnRate(0)).toBeCloseTo(HORSE.turnSlow, 5);
    expect(turnRate(13)).toBeCloseTo(HORSE.turnFast, 5);
    expect(turnRate(8)).toBeLessThan(turnRate(4));
    // Full-gallop turning circle radius v/ω: wide but not a battleship.
    const r = 13 / turnRate(13);
    expect(r).toBeGreaterThan(6);
    expect(r).toBeLessThan(12);
  });
});

describe('horse jump', () => {
  it('clears a ~1.6 m fence', () => {
    const v = jumpVelocity();
    const apex = (v * v) / (2 * HORSE.gravity);
    expect(apex).toBeGreaterThanOrEqual(1.6);
    expect(apex).toBeLessThan(2.2);
  });

  it('is airborne long enough at a gallop to cover a fence and a gap', () => {
    const t = jumpAirTime();
    expect(t).toBeGreaterThan(0.6);
    expect(t).toBeLessThan(1.1);
    expect(t * HORSE.gallopSpeed).toBeGreaterThan(8);
  });
});

describe('horse terrain response', () => {
  it('is sure-footed: slopes slow it down a little, never to a stop', () => {
    expect(slopeFactor(0, 2)).toBe(1);
    expect(slopeFactor(-1, 2)).toBe(1); // downhill
    expect(slopeFactor(1, 2)).toBeLessThan(1);
    expect(slopeFactor(10, 2)).toBeGreaterThanOrEqual(HORSE.slopeMinFactor);
  });

  it('wades in shallow water, slows, and turns back before deep water', () => {
    expect(waterResponse(-1)).toEqual({ factor: 1, turnBack: false });
    expect(waterResponse(0.1).factor).toBe(1);
    const wade = waterResponse(0.35);
    expect(wade.factor).toBeLessThan(0.55);
    expect(wade.factor).toBeGreaterThan(0);
    expect(wade.turnBack).toBe(false);
    const deep = waterResponse(HORSE.refuseDepth);
    expect(deep.factor).toBe(0);
    expect(deep.turnBack).toBe(true);
  });
});

describe('horse animation and sound sync', () => {
  it('clip rates follow the ground speed within limits', () => {
    expect(clipRate('idle', 0)).toBe(1);
    expect(clipRate('gallop', 13)).toBeGreaterThan(clipRate('gallop', 10));
    for (const [g, s] of [['walk', 3], ['trot', 7.5], ['gallop', 13]] as const) {
      const r = clipRate(g, s);
      expect(r).toBeGreaterThanOrEqual(HORSE.rateRange[g][0]);
      expect(r).toBeLessThanOrEqual(HORSE.rateRange[g][1]);
    }
  });

  it('hooves are silent when idle and clop faster at a gallop', () => {
    expect(hoofSound('idle', 0).intensity).toBe(0);
    const walk = hoofSound('walk', 3);
    const gallop = hoofSound('gallop', 13);
    expect(walk.intensity).toBeGreaterThan(0);
    expect(gallop.intensity).toBeGreaterThan(walk.intensity);
    // Four clops per gallop cycle: 0.64 / pitch s per 4 beats ≈ the clip cycle at that rate.
    expect(0.64 / gallop.pitch).toBeCloseTo(0.583 / clipRate('gallop', 13), 2);
  });

  it('rear-up rises, holds and lands back to zero', () => {
    expect(rearPitch(0)).toBe(0);
    expect(rearPitch(1.6)).toBe(0);
    expect(rearPitch(0.8)).toBeGreaterThan(0.5);
    let peak = 0;
    for (let t = 0; t < 1.6; t += 0.01) peak = Math.max(peak, rearPitch(t));
    expect(peak).toBeLessThan(0.75);
  });
});
