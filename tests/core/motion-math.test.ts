import { describe, expect, it } from 'vitest';
import { PLAYER } from '../../src/config';
import {
  angleDelta, apexHeight, approachVec2, cameraRelative, canJump, integrateVertical, speedForApex,
} from '../../src/core/motion-math';
import { flopPose } from '../../src/core/player-fx';

describe('jump maths', () => {
  it('normal jump apex is about 1.4 m and a sprint jump flies 7-8 m', () => {
    expect(apexHeight(PLAYER.jumpSpeed, PLAYER.gravity)).toBeCloseTo(1.383, 2);
    const airTime = (2 * PLAYER.jumpSpeed) / PLAYER.gravity;
    expect(PLAYER.sprintSpeed * airTime).toBeGreaterThan(6);
    expect(PLAYER.sprintSpeed * airTime).toBeLessThan(8.5);
  });
  it('speedForApex inverts apexHeight', () => {
    const v = speedForApex(45, PLAYER.gravity);
    expect(apexHeight(v, PLAYER.gravity)).toBeCloseTo(45, 6);
  });
  it('frame integration reaches the analytic apex at any frame rate', () => {
    for (const dt of [1 / 30, 1 / 60, 1 / 144, 1 / 20]) {
      let vy = speedForApex(40, PLAYER.gravity);
      let y = 0;
      let peak = 0;
      while (vy > -1) {
        const s = integrateVertical(vy, PLAYER.gravity, dt);
        y += s.dy;
        vy = s.vy;
        peak = Math.max(peak, y);
      }
      expect(peak).toBeGreaterThan(39.5);
      expect(peak).toBeLessThanOrEqual(40 + 1e-6);
    }
  });
  it('coyote time and jump buffer are forgiving but bounded', () => {
    expect(canJump(0.1, 0.05, 0.15, 0.15)).toBe(true);
    expect(canJump(0.2, 0.0, 0.15, 0.15)).toBe(false);
    expect(canJump(0.0, 0.2, 0.15, 0.15)).toBe(false);
  });
});

describe('movement helpers', () => {
  it('camera-relative forward follows camera yaw; right is to the right', () => {
    // Camera looking down −Z (yaw π): forward is −Z, right is +X.
    const f = cameraRelative(0, 1, Math.PI);
    expect(f.x).toBeCloseTo(0);
    expect(f.z).toBeCloseTo(-1);
    const r = cameraRelative(1, 0, Math.PI);
    expect(r.x).toBeCloseTo(1);
    expect(r.z).toBeCloseTo(0);
  });
  it('angleDelta takes the short way round', () => {
    expect(angleDelta(3, -3)).toBeCloseTo(2 * Math.PI - 6);
    expect(angleDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
  });
  it('approachVec2 is limited by max delta', () => {
    const v = approachVec2({ x: 0, z: 0 }, 10, 0, 1);
    expect(v).toEqual({ x: 1, z: 0 });
    expect(approachVec2({ x: 9.5, z: 0 }, 10, 0, 1)).toEqual({ x: 10, z: 0 });
  });
});

describe('flop pose', () => {
  it('starts and ends upright at normal size', () => {
    for (const t of [0, 1.2]) {
      const p = flopPose(t, 1.2);
      expect(p.sy).toBeCloseTo(1);
      expect(p.sxz).toBeCloseTo(1);
      expect(p.flip % (2 * Math.PI)).toBeCloseTo(0);
    }
  });
  it('squashes into a pancake in the middle', () => {
    expect(flopPose(0.65, 1.2).sy).toBeLessThan(0.7);
  });
});
