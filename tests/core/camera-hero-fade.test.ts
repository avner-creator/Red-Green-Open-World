import { describe, expect, it } from 'vitest';
import { distToBody, HERO_FADE_FULL, HERO_FADE_NONE, heroFadeAmount } from '../../src/core/camera-hero-fade';

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
});
