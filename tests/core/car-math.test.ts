import { describe, expect, it } from 'vitest';
import {
  DRIVE, closestOnPolyline, driveAccel, engineSound, gripRate, integrateSpeed, smoothSteer, steerAngle, waterSpeedCap, yawRateFor,
} from '../../src/core/vehicles/car-math';
import { isPaved, nearestRoad } from '../../src/core/vehicles/surface';

/** Integrate speed on flat ground with the arcade drive model. */
function simulate(v0: number, throttle: number, top: number, seconds: number): number {
  let v = v0;
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) v = integrateSpeed(v, driveAccel(v, throttle, top), dt, throttle);
  return v;
}

describe('car drive maths', () => {
  it('launches hard and settles on the top speed without overshooting', () => {
    expect(simulate(0, 1, 16, 1)).toBeGreaterThan(9);
    const v = simulate(0, 1, 16, 5);
    expect(v).toBeGreaterThan(15.5);
    expect(v).toBeLessThanOrEqual(16.01);
  });

  it('half throttle cruises at about half speed', () => {
    expect(simulate(0, 0.5, 16, 6)).toBeCloseTo(8, 0);
  });

  it('above the cap (road → grass) it slows down gently, not instantly', () => {
    const after = simulate(16, 1, 11, 0.5);
    expect(after).toBeLessThan(16);
    expect(after).toBeGreaterThan(12);
    expect(simulate(16, 1, 11, 4)).toBeCloseTo(11, 0);
  });

  it('brake pedal stops without reversing on the same frame, then reverses slowly', () => {
    expect(simulate(16, -1, 16, 0.6)).toBeLessThan(4);
    expect(integrateSpeed(1, -80, 1 / 60, -1)).toBe(0);
    const rev = simulate(0, -1, 16, 3);
    expect(rev).toBeLessThan(-5);
    expect(rev).toBeGreaterThanOrEqual(-DRIVE.reverseTopSpeed - 0.01);
  });

  it('with no throttle it rolls to a stop and holds', () => {
    expect(simulate(10, 0, 16, 4)).toBeCloseTo(0, 4);
    expect(simulate(-3, 0, 16, 1)).toBeCloseTo(0, 4);
  });

  it('steering is tight at low speed and softer at top speed', () => {
    expect(steerAngle(1, 0, 16)).toBeCloseTo(DRIVE.steerLow, 5);
    expect(steerAngle(1, 16, 16)).toBeCloseTo(DRIVE.steerHigh, 5);
    expect(Math.abs(steerAngle(-1, 8, 16))).toBeLessThan(DRIVE.steerLow);
    expect(steerAngle(-1, 8, 16)).toBeLessThan(0);
  });

  it('bicycle-model yaw rate: sign follows speed, capped', () => {
    expect(yawRateFor(10, 0.3)).toBeGreaterThan(0);
    expect(yawRateFor(-5, 0.3)).toBeLessThan(0); // reversing turns the other way, like a real car
    expect(yawRateFor(100, 0.6)).toBe(DRIVE.maxYawRate);
    expect(yawRateFor(0, 0.6)).toBe(0);
  });

  it('grip drops a little in fast full-lock turns and a lot with the handbrake', () => {
    const straight = gripRate(16, 0, 16, false);
    const fastTurn = gripRate(16, 1, 16, false);
    expect(fastTurn).toBeLessThan(straight);
    expect(fastTurn).toBeGreaterThan(straight * 0.5);
    expect(gripRate(16, 1, 16, true)).toBeLessThan(fastTurn * 0.3);
  });

  it('keyboard steering ramps in and snaps back faster', () => {
    const dt = 1 / 60;
    let s = 0;
    for (let i = 0; i < 6; i++) s = smoothSteer(s, 1, dt);
    expect(s).toBeGreaterThan(0.4);
    expect(s).toBeLessThan(0.75);
    let back = 1;
    for (let i = 0; i < 6; i++) back = smoothSteer(back, 0, dt);
    expect(1 - back).toBeGreaterThan(s); // returning is quicker than steering in
  });

  it('water caps the speed: shallow slows, deep nearly stops', () => {
    expect(waterSpeedCap(16, -1)).toBe(16);
    expect(waterSpeedCap(16, 0.3)).toBeLessThan(10);
    expect(waterSpeedCap(16, 2)).toBe(1.5);
  });

  it('engine sound rises with speed and throttle', () => {
    const idle = engineSound(0, 0, 16);
    const fast = engineSound(16, 1, 16);
    expect(fast.pitch).toBeGreaterThan(idle.pitch + 0.8);
    expect(fast.intensity).toBeGreaterThan(idle.intensity);
    expect(fast.intensity).toBeLessThanOrEqual(1);
  });

  it('closest point on a polyline', () => {
    const c = closestOnPolyline(5, 3, [[0, 0], [10, 0], [10, 10]]);
    expect(c.x).toBeCloseTo(5);
    expect(c.z).toBeCloseTo(0);
    expect(c.dist).toBeCloseTo(3);
    expect(c.dirX).toBeCloseTo(1);
  });
});

describe('surfaces', () => {
  it('the south road and the garage forecourt are paved; open meadow is not', () => {
    expect(isPaved(2, 40)).toBe(true);
    expect(isPaved(34, 22)).toBe(true);
    expect(isPaved(30, 50)).toBe(false);
  });

  it('nearest road from the meadow points at a ground-level road', () => {
    const r = nearestRoad(16, 40);
    expect(r.dist).toBeLessThan(16);
    expect(Math.hypot(r.dirX, r.dirZ)).toBeCloseTo(1);
  });
});
