/**
 * Mega gem spots (pure): computed from the world anchors and the terrain height, never from
 * hard-coded world coordinates. They sit where the attractions carry the player, so the fun and
 * the eye work go together.
 */
import { PADS, MAT, MEGA } from '../constants';
import { padLocalPositions } from '../bounceLogic';
import { BALLOON, TRAMPOLINE } from '../../config';
import type { Anchor, AnchorName } from '../../types';

export interface MegaSpot {
  x: number;
  y: number;
  z: number;
  tag: string;
}

type Anchors = Readonly<Record<AnchorName, Anchor>>;
type HeightFn = (x: number, z: number) => number;

/** Typical apexes of the trampoline's growing bounces (first, then x growth each time). */
export function trampolinePeaks(): number[] {
  const out: number[] = [];
  let a: number = TRAMPOLINE.firstBounce;
  for (let i = 0; i < 12 && a < TRAMPOLINE.maxHeight; i++) {
    out.push(Math.min(a, TRAMPOLINE.maxHeight));
    a *= TRAMPOLINE.growth;
  }
  out.push(TRAMPOLINE.maxHeight);
  return out;
}

export function computeMegaSpots(anchors: Anchors, heightAt: HeightFn): MegaSpot[] {
  const spots: MegaSpot[] = [];
  const add = (x: number, y: number, z: number, tag: string): void => void spots.push({ x, y, z, tag });
  // The player's chest is about this far above the feet; the pickup test uses the chest.
  const chest = MEGA.chestAboveFeet;

  // 1. Above the trampoline: the peaks of the 5th, 7th and 9th-ish bounces (the big ones).
  const t = anchors.trampoline.position;
  const matTop = heightAt(t.x, t.z) + MAT.top;
  const peaks = trampolinePeaks();
  for (const k of [peaks.length - 5, peaks.length - 3, peaks.length - 1]) {
    const apex = peaks[Math.max(0, k)];
    add(t.x, matTop + apex * 0.92 + chest, t.z, 'trampoline');
  }

  // 2. Bounce pads: between the 2nd and 3rd pad (peak of the 6 m launch) and beyond the last
  // pad (peak of the 10 m launch, carried forward).
  const bp = anchors.bouncePads;
  const sin = Math.sin(bp.yaw);
  const cos = Math.cos(bp.yaw);
  const local = padLocalPositions(PADS.heights.length, PADS.spacing);
  const world = local.map((l) => {
    const x = bp.position.x + l.x * cos + l.z * sin;
    const z = bp.position.z - l.x * sin + l.z * cos;
    return { x, z, top: heightAt(x, z) + PADS.top };
  });
  const last = world.length - 1;
  if (last >= 2) {
    const a = world[last - 1];
    const b = world[last];
    add((a.x + b.x) / 2, a.top + PADS.heights[last - 1] * 0.9 + chest, (a.z + b.z) / 2, 'pads');
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz) || 1;
    const ahead = MEGA.padsAhead;
    const px = b.x + (dx / len) * ahead;
    const pz = b.z + (dz / len) * ahead;
    add(px, b.top + PADS.heights[last] * 0.9 + chest, pz, 'pads');
  }

  // 3. Mid-air over the launch pads: where a big launch would carry you.
  const lp = anchors.launchPads;
  const lGround = heightAt(lp.position.x, lp.position.z);
  add(lp.position.x, lGround + MEGA.launchLow, lp.position.z, 'launch');
  add(lp.position.x + Math.sin(lp.yaw) * MEGA.launchAhead, lGround + MEGA.launchHigh, lp.position.z + Math.cos(lp.yaw) * MEGA.launchAhead, 'launch');

  // 4. A line along the road in front of the garage, for the buggy.
  const g = anchors.garage;
  const fx = Math.sin(g.yaw);
  const fz = Math.cos(g.yaw);
  const rx = Math.cos(g.yaw);
  const rz = -Math.sin(g.yaw);
  for (const side of MEGA.roadOffsets) {
    const x = g.position.x + fx * MEGA.roadFront + rx * side;
    const z = g.position.z + fz * MEGA.roadFront + rz * side;
    add(x, heightAt(x, z) + MEGA.roadHeight, z, 'road');
  }

  // 5. Skydive: three on the descent from the balloon towards the landing rings, a few metres
  // beside the normal trail gems (same curve as the world's skydive trail).
  const b = anchors.balloon.position;
  const r = anchors.landingRings.position;
  const top = heightAt(b.x, b.z) + BALLOON.topHeight - 10;
  const bottom = heightAt(r.x, r.z) + 24;
  const dirX = r.x - b.x;
  const dirZ = r.z - b.z;
  const dlen = Math.hypot(dirX, dirZ) || 1;
  for (const t of MEGA.skyT) {
    const x = b.x + dirX * t + Math.sin(t * 5) * 6 * (1 - t) - (dirZ / dlen) * MEGA.skySide;
    const z = b.z + dirZ * t + Math.cos(t * 4) * 5 * (1 - t) + (dirX / dlen) * MEGA.skySide;
    add(x, top + (bottom - top) * Math.pow(t, 0.85), z, 'skydive');
  }
  return spots;
}
