/**
 * The Scoops friends as friendly, solid customers (QA6 M2), as pure functions on the parlour's
 * local frame (x, z on the floor, y up):
 * - `stepAside`: a friend makes room when the hero comes close (never into the counter, a wall,
 *   the terrace table or off the terrace).
 * - `blockerSolid`: each friend has a round blocker the hero slides around, switched off while the
 *   hero already overlaps it (a friend stepping into the hero never traps or shoves them).
 * - `fadeFor`: a friend between the camera and the hero, or around the camera, fades out.
 */
import { PLAYER } from '../../config';
import { GROUP_AVATAR, GROUP_VEHICLE, groups } from '../../core/physics';

/** Solid for the walking hero only; camera and gameplay rays pass through (like the vault stones). */
export const HERO_ONLY = groups(GROUP_VEHICLE, GROUP_AVATAR);

export const CROWD = {
  /** Friend blocker radius and half height (m). */
  friendR: 0.32,
  halfHeight: 0.8,
  /** A friend keeps this far from the hero when it can (centre to centre, m). */
  avoidR: 1.15,
  /** ...but strays at most this far from its spot. */
  maxStep: 1.1,
  /** Walking speed when making room (m/s). */
  stepSpeed: 2.6,
  /** Customer-side area a friend may stand in (local). */
  area: { x: 3.35, z0: 2.5, z1: 5.0 },
  /** The fade: a friend this close (m) to the camera→hero line fades to `ghost`. */
  lineR: 0.55,
  ghost: 0.25,
  /** Camera this close (horizontal, m) to a friend's axis: the friend is hidden. */
  camInside: 0.75,
} as const;

export interface P2 {
  x: number;
  z: number;
}

/** Where a friend whose spot is `home` should stand while the hero is at `hero`. */
export function stepAside(home: P2, hero: P2, table: P2 | null, out: P2 = { x: 0, z: 0 }): P2 {
  const dx = home.x - hero.x;
  const dz = home.z - hero.z;
  const d = Math.hypot(dx, dz);
  out.x = home.x;
  out.z = home.z;
  if (d < CROWD.avoidR) {
    // Away from the hero; straight on → sideways, toward the middle of the terrace.
    let ux = dx;
    let uz = dz;
    if (d < 1e-3) {
      ux = home.x >= 0 ? -1 : 1;
      uz = 0;
    } else {
      ux /= d;
      uz /= d;
    }
    let tx = hero.x + ux * CROWD.avoidR - home.x;
    let tz = hero.z + uz * CROWD.avoidR - home.z;
    const l = Math.hypot(tx, tz);
    if (l > CROWD.maxStep) {
      tx *= CROWD.maxStep / l;
      tz *= CROWD.maxStep / l;
    }
    out.x = home.x + tx;
    out.z = home.z + tz;
  }
  return clampToArea(out, table);
}

/** Keep a friend's centre on the customer side, off the counter, walls and terrace table. */
export function clampToArea(p: P2, table: P2 | null): P2 {
  const a = CROWD.area;
  p.x = Math.max(-a.x, Math.min(a.x, p.x));
  p.z = Math.max(a.z0, Math.min(a.z1, p.z));
  if (table) {
    const min = 0.5 + CROWD.friendR + 0.05;
    const dx = p.x - table.x;
    const dz = p.z - table.z;
    const d = Math.hypot(dx, dz);
    if (d < min) {
      const ux = d < 1e-3 ? 1 : dx / d;
      const uz = d < 1e-3 ? 0 : dz / d;
      p.x = table.x + ux * min;
      p.z = table.z + uz * min;
    }
  }
  return p;
}

/**
 * Blocker on/off with a little hysteresis: off as soon as the hero's capsule overlaps it (the hero
 * walks out freely), back on once the hero is clear.
 */
export function blockerSolid(wasSolid: boolean, heroDist: number): boolean {
  const touch = CROWD.friendR + PLAYER.radius;
  if (heroDist < touch - 0.03) return false;
  if (heroDist > touch + 0.12) return true;
  return wasSolid;
}

/** Shortest distance from point (px, py, pz) to segment a→b. */
function segDist(px: number, py: number, pz: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const vz = bz - az;
  const l2 = vx * vx + vy * vy + vz * vz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy + (pz - az) * vz) / l2)) : 0;
  return Math.hypot(ax + vx * t - px, ay + vy * t - py, az + vz * t - pz);
}

/**
 * Wanted opacity (0..1) of a friend standing at `f` (feet) for a camera at `cam` looking at the
 * hero's pivot `pivot` (all local, y up): 0 when the camera is inside the friend, `ghost` when the
 * friend stands across the camera→hero line, else 1.
 */
export function fadeFor(f: { x: number; y: number; z: number }, cam: { x: number; y: number; z: number }, pivot: { x: number; y: number; z: number }): number {
  const top = f.y + 1.75;
  if (Math.hypot(cam.x - f.x, cam.z - f.z) < CROWD.camInside && cam.y > f.y - 0.3 && cam.y < top + 0.4) return 0;
  // The friend's body as three points up its axis vs. the lines of sight to the hero's head
  // (the pivot) and middle.
  let best = Infinity;
  for (const h of [0.5, 1.0, 1.5]) {
    best = Math.min(best, segDist(f.x, f.y + h, f.z, cam.x, cam.y, cam.z, pivot.x, pivot.y, pivot.z));
    best = Math.min(best, segDist(f.x, f.y + h, f.z, cam.x, cam.y, cam.z, pivot.x, pivot.y - 0.85, pivot.z));
  }
  // Only between the two: a friend behind the hero never hides them.
  const toHero = Math.hypot(pivot.x - cam.x, pivot.z - cam.z);
  const toFriend = Math.hypot(f.x - cam.x, f.z - cam.z);
  if (toFriend > toHero) return 1;
  return best < CROWD.lineR ? CROWD.ghost : 1;
}
