import { describe, expect, it } from 'vitest';
import { castCapsule, crownCapsule, rayTriangleFront, type Capsule } from '../../src/core/occluder-math';
import { resolveArm } from '../../src/core/camera-math';

const crown: Capsule = { ax: 0, ay: 3, az: 0, bx: 0, by: 4, bz: 0, r: 1.5 };

describe('castCapsule', () => {
  it('hits a crown in front, inflated by the cast radius', () => {
    const t = castCapsule(crown, { x: -5, y: 3.5, z: 0 }, { x: 1, y: 0, z: 0 }, 10, 0.2);
    expect(t).not.toBeNull();
    expect(t!).toBeCloseTo(5 - 1.5 - 0.2, 2);
  });
  it('misses when out of reach or passing beside it', () => {
    expect(castCapsule(crown, { x: -5, y: 3.5, z: 0 }, { x: 1, y: 0, z: 0 }, 2, 0.2)).toBeNull();
    expect(castCapsule(crown, { x: -5, y: 3.5, z: 3 }, { x: 1, y: 0, z: 0 }, 10, 0.2)).toBeNull();
  });
  it('ignores a ray that starts inside (hero under the crown)', () => {
    expect(castCapsule(crown, { x: 0.5, y: 3.5, z: 0 }, { x: 1, y: 0, z: 0 }, 10, 0.2)).toBeNull();
  });
});

describe('rayTriangleFront', () => {
  // Triangle in the x=2 plane facing -x (towards the origin).
  const tri = [2, -1, -1, 2, -1, 1, 2, 1, 0];
  it('hits the front face', () => {
    expect(rayTriangleFront(tri, 0, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 10)).toBeCloseTo(2, 5);
  });
  it('ignores the back face and far hits', () => {
    expect(rayTriangleFront(tri, 0, { x: 4, y: 0, z: 0 }, { x: -1, y: 0, z: 0 }, 10)).toBeNull();
    expect(rayTriangleFront(tri, 0, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 1.5)).toBeNull();
  });
});

describe('crownCapsule', () => {
  it('fits a tree crown above the trunk and skips grass', () => {
    // Trunk: thin column 0..2.5 m; crown: a 4 m wide blob from 2 to 6 m.
    const pos = [0.2, 0, 0, -0.2, 0, 0, 0.2, 2.5, 0, 2, 2, 0, -2, 4, 0, 0, 6, 2, 0, 4, -2, 0, 3, 0];
    const c = crownCapsule(pos)!;
    expect(c.ay - c.r).toBeGreaterThan(1.8);
    expect(c.by + c.r).toBeLessThanOrEqual(6.01);
    expect(crownCapsule([0, 0, 0, 0.2, 0.5, 0.1, -0.1, 0.3, 0])).toBeNull();
  });
});

describe('resolveArm', () => {
  it('snaps in to a hard limit and eases out', () => {
    expect(resolveArm(5, 5, 2, null, 7, 3, 1 / 60)).toBe(2);
    const d = resolveArm(2, 5, null, null, 7, 3, 1 / 60);
    expect(d).toBeGreaterThan(2);
    expect(d).toBeLessThan(2.2);
  });
  it('eases in towards a soft limit without snapping', () => {
    const d = resolveArm(5, 5, null, 3, 7, 3, 1 / 60);
    expect(d).toBeLessThan(5);
    expect(d).toBeGreaterThan(4.6);
  });
});
