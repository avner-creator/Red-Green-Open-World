import { describe, expect, it } from 'vitest';
import {
  clampBase,
  followBase,
  isPhoneViewport,
  lookFromDrag,
  lookStep,
  prefersTouch,
  stickRadius,
  stickVector,
  TOUCH,
  touchPixelRatioCap,
  touchQuality,
} from '../../src/core/input-touch-math';

describe('stickVector', () => {
  it('is zero at the base and inside the dead zone', () => {
    expect(stickVector(100, 100, 100, 100, 60)).toEqual({ x: 0, y: 0 });
    expect(stickVector(100, 100, 105, 103, 60)).toEqual({ x: 0, y: 0 });
  });
  it('finger above the base walks forward, right of it walks right', () => {
    const up = stickVector(100, 100, 100, 40, 60);
    expect(up.y).toBeCloseTo(1);
    expect(up.x).toBeCloseTo(0);
    const r = stickVector(100, 100, 160, 100, 60);
    expect(r.x).toBeCloseTo(1);
    expect(r.y).toBeCloseTo(0);
    const down = stickVector(100, 100, 100, 160, 60);
    expect(down.y).toBeCloseTo(-1);
  });
  it('half travel gives a partial push (fine control past the dead zone)', () => {
    const v = stickVector(0, 0, 30, 0, 60);
    expect(v.x).toBeGreaterThan(0.3);
    expect(v.x).toBeLessThan(0.5);
  });
  it('clamps to length 1 past the ring and keeps the direction', () => {
    const v = stickVector(0, 0, 300, -300, 60);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
    expect(v.x).toBeCloseTo(v.y);
  });
  it('a zero or broken radius gives no movement', () => {
    expect(stickVector(0, 0, 50, 50, 0)).toEqual({ x: 0, y: 0 });
    expect(stickVector(0, 0, 50, 50, NaN)).toEqual({ x: 0, y: 0 });
  });
});

describe('followBase', () => {
  it('stays put while the finger is inside the ring', () => {
    expect(followBase(10, 10, 40, 10, 60)).toEqual({ x: 10, y: 10 });
  });
  it('is dragged behind the finger to exactly one radius away', () => {
    const b = followBase(0, 0, 100, 0, 60);
    expect(b.x).toBeCloseTo(40);
    expect(b.y).toBeCloseTo(0);
    const d = followBase(0, 0, 80, 60, 50);
    expect(Math.hypot(80 - d.x, 60 - d.y)).toBeCloseTo(50);
  });
  it('lets a reversed swipe act instantly after the base followed', () => {
    const b = followBase(0, 0, 200, 0, 60);
    const back = stickVector(b.x, b.y, b.x - 50, b.y, 60);
    expect(back.x).toBeLessThan(-0.7);
  });
});

describe('clampBase', () => {
  it('keeps the whole ring on screen', () => {
    expect(clampBase(5, 370, 50, 667, 375)).toEqual({ x: 50, y: 325 });
    expect(clampBase(300, 200, 50, 667, 375)).toEqual({ x: 300, y: 200 });
  });
  it('honours an inset', () => {
    expect(clampBase(0, 0, 40, 667, 375, 20)).toEqual({ x: 60, y: 60 });
  });
  it('centres when the screen is smaller than the ring', () => {
    expect(clampBase(3, 3, 100, 150, 150)).toEqual({ x: 75, y: 75 });
  });
});

describe('stickRadius', () => {
  it('scales with the short side within limits', () => {
    expect(stickRadius(667, 375)).toBeCloseTo(375 * TOUCH.stickRadiusFrac);
    expect(stickRadius(300, 200)).toBe(TOUCH.stickRadiusMin);
    expect(stickRadius(2732, 2048)).toBe(TOUCH.stickRadiusMax);
  });
});

describe('lookFromDrag', () => {
  it('a swipe across the short side turns the configured angle', () => {
    const l = lookFromDrag(375, 0, 667, 375);
    expect(l.x).toBeCloseTo(TOUCH.lookYawPerShortSide);
    expect(l.y).toBe(0);
  });
  it('feels the same on phone and tablet (scaled by the short side)', () => {
    const phone = lookFromDrag(37.5, 0, 667, 375);
    const tablet = lookFromDrag(76.8, 0, 1024, 768);
    expect(phone.x).toBeCloseTo(tablet.x);
  });
  it('down drag pitches positive (same sign as the mouse)', () => {
    expect(lookFromDrag(0, 20, 667, 375).y).toBeGreaterThan(0);
  });
  it('drops absurd single steps but keeps normal ones', () => {
    expect(lookStep(TOUCH.maxLookStep + 1)).toBe(0);
    expect(lookStep(-900)).toBe(0);
    expect(lookStep(NaN)).toBe(0);
    expect(lookStep(-12)).toBe(-12);
  });
});

describe('device class', () => {
  it('touch-first only with touch points, a coarse pointer and no mouse', () => {
    expect(prefersTouch({ maxTouchPoints: 5, coarse: true, fine: false })).toBe(true);
    expect(prefersTouch({ maxTouchPoints: 10, coarse: false, fine: true })).toBe(false);
    expect(prefersTouch({ maxTouchPoints: 0, coarse: false, fine: true })).toBe(false);
    expect(prefersTouch({ maxTouchPoints: 5, coarse: true, fine: true })).toBe(false);
  });
  it('phones are judged by the short side', () => {
    expect(isPhoneViewport(667, 375)).toBe(true);
    expect(isPhoneViewport(375, 667)).toBe(true);
    expect(isPhoneViewport(1024, 768)).toBe(false);
  });
  it('quality: phones Low, tablets Medium, desktops untouched', () => {
    expect(touchQuality(true, true)).toBe('low');
    expect(touchQuality(true, false)).toBe('medium');
    expect(touchQuality(false, true)).toBeNull();
  });
  it('phones get a lower pixel-ratio cap', () => {
    expect(touchPixelRatioCap('high', true)).toBeLessThan(touchPixelRatioCap('high', false));
    expect(touchPixelRatioCap('low', true)).toBe(1);
    expect(touchPixelRatioCap('medium', false)).toBe(1.5);
  });
});
