/**
 * Mega gem spots (pure): computed from the world anchors and the terrain height, never from
 * hard-coded world coordinates. They sit where the attractions carry the player, so the fun and
 * the eye work go together.
 */
import { MEGA } from '../constants';
import { BALLOON } from '../../config';
import type { Anchor, AnchorName } from '../../types';

export interface MegaSpot {
  x: number;
  y: number;
  z: number;
  tag: string;
}

type Anchors = Readonly<Record<AnchorName, Anchor>>;
type HeightFn = (x: number, z: number) => number;

/** What main's thrills publish (`thrillSpots`): world positions on the real ride trajectories. */
export interface ThrillLike {
  tag: string;
  x: number;
  y: number;
  z: number;
}

/**
 * Pick the mega gems that ride along a real trajectory: where the trampoline's big bounces peak,
 * the tops of the two bigger pad-to-pad arcs, and two on the rocket arc either side of its apex.
 * The positions come from the thrill modules (so they follow their numbers); missing tags are skipped.
 */
export function thrillMegas(thrill: readonly ThrillLike[]): MegaSpot[] {
  const by = new Map(thrill.map((t) => [t.tag, t]));
  const out: MegaSpot[] = [];
  const take = (tag: string, group: string, dy = 0): void => {
    const t = by.get(tag);
    if (t) out.push({ x: t.x, y: t.y + dy, z: t.z, tag: group });
  };
  // Trampoline apexes are 12, 18, 27, 40, 45 m: 15 m is passed by every big bounce, 30 m by the
  // last two, and the top one sits just under the 45 m cap.
  take('trampoline15', 'trampoline', 3);
  take('trampoline30', 'trampoline');
  take('trampoline45', 'trampoline', -1.5);
  take('padArc1', 'pads');
  take('padArc2', 'pads');
  take('rocket1', 'rocket');
  take('rocket3', 'rocket');
  return out;
}

export function computeMegaSpots(anchors: Anchors, heightAt: HeightFn, thrill: readonly ThrillLike[] = []): MegaSpot[] {
  const spots: MegaSpot[] = thrillMegas(thrill);
  const add = (x: number, y: number, z: number, tag: string): void => void spots.push({ x, y, z, tag });

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
