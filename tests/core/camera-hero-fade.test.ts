import { describe, expect, it } from 'vitest';
import { distToBody, HERO_FADE_FULL, HERO_FADE_NONE, heroAxisTop, heroFadeAmount } from '../../src/core/camera-hero-fade';

describe('hero fade (QA6 M2)', () => {
  it('is off beyond the near distance and full inside the body margin', () => {
    expect(heroFadeAmount(HERO_FADE_NONE + 0.01)).toBe(0);
    expect(heroFadeAmount(3)).toBe(0);
    expect(heroFadeAmount(HERO_FADE_FULL)).toBe(1);
    expect(heroFadeAmount(0)).toBe(1);
    const mid = heroFadeAmount((HERO_FADE_FULL + HERO_FADE_NONE) / 2);
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
  });

  it('measures the camera against the hero body axis, not just the head', () => {
    // Level with the hero's chest, 1 m out: 1 m minus the radius.
    expect(distToBody({ x: 1, y: 1, z: 0 }, 0, 0, 0.25, 1.5, 0.3)).toBeCloseTo(0.7);
    // Above the head: distance to the top of the axis.
    expect(distToBody({ x: 0, y: 2.5, z: 0 }, 0, 0, 0.25, 1.5, 0.3)).toBeCloseTo(0.7);
    // Inside the body: 0.
    expect(distToBody({ x: 0.1, y: 1, z: 0 }, 0, 0, 0.25, 1.5, 0.3)).toBe(0);
  });

  it('reaches up into a worn hat (QA7 m2), never below the head and at most 1.5 m above it', () => {
    expect(heroAxisTop(1.8, null)).toBeCloseTo(1.6);
    expect(heroAxisTop(1.8, 1.7)).toBeCloseTo(1.6);
    expect(heroAxisTop(1.8, 2.6)).toBeCloseTo(2.45);
    expect(heroAxisTop(1.8, 9)).toBeCloseTo(3.15);
    // A camera beside a tall top hat is now "at the hero": faded.
    const top = heroAxisTop(1.8, 2.6);
    expect(heroFadeAmount(distToBody({ x: 0.6, y: 2.4, z: 0 }, 0, 0, 0.25, top, 0.3))).toBe(1);
    expect(heroFadeAmount(distToBody({ x: 0.6, y: 2.4, z: 0 }, 0, 0, 0.25, heroAxisTop(1.8, null), 0.3))).toBeLessThan(0.6);
  });
});
