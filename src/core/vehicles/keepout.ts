/**
 * Places a horse will not go (QA8 m11): the Foam Lava course. A horse ridden in over the inflatable
 * rim could not get back out (an 8 s stall), so the course is a soft boundary instead: a horse
 * heading in is turned along the edge (a whinny and a boing) and its inward motion is dropped, so
 * it slides round the course and never stands still against it. A horse already well inside (put
 * there by something else) is left free to ride out.
 *
 * Pure (unit-tested); the zones come from the island plan's paved pads (`src/world/layout.ts`).
 */
import { PADS } from '../../world/layout';

export interface Zone {
  /** Centre and half extents (axis-aligned, world x / z). */
  x: number;
  z: number;
  hx: number;
  hz: number;
}

/** Margin round the course pad (m): the horse turns before its nose reaches the rim. */
const MARGIN = 0.8;
/** Deeper inside than this (m) the horse is left alone (it is let out, not shut in). */
const INSIDE_FREE = 1.5;

/** The keep-out zones for horses: the Foam Lava course pad (with its rim). */
export function horseZones(): Zone[] {
  return PADS.filter((p) => p.id === 'foamCourse' && p.shape === 'rect').map((p) => ({ x: p.x, z: p.z, hx: (p.hx ?? 0) + MARGIN, hz: (p.hz ?? 0) + MARGIN }));
}

/** Signed distance from (x, z) to the zone's edge (negative inside) and the outward normal there. */
export function zoneEdge(zn: Zone, x: number, z: number): { d: number; nx: number; nz: number } {
  const dx = x - zn.x;
  const dz = z - zn.z;
  const ex = Math.abs(dx) - zn.hx;
  const ez = Math.abs(dz) - zn.hz;
  if (ex > 0 || ez > 0) {
    const ox = Math.max(ex, 0) * Math.sign(dx);
    const oz = Math.max(ez, 0) * Math.sign(dz);
    const l = Math.hypot(ox, oz) || 1;
    return { d: Math.hypot(Math.max(ex, 0), Math.max(ez, 0)), nx: ox / l, nz: oz / l };
  }
  // Inside: the nearest edge.
  return ex > ez ? { d: ex, nx: Math.sign(dx) || 1, nz: 0 } : { d: ez, nx: 0, nz: Math.sign(dz) || 1 };
}

export interface KeepOut {
  /** Heading to turn toward (rad), or null when the zone does not care. */
  yaw: number | null;
  /** The move with its inward part dropped. */
  mx: number;
  mz: number;
  /** The horse was just turned away (play the whinny). */
  turned: boolean;
  /** Which way along the edge it was sent (+1 / −1: keep it, or flip it when that way is blocked). */
  side: number;
}

/**
 * Check a horse at (x, z) heading `yaw` about to move by (mx, mz) (nose `reach` m ahead) against
 * the zones. Inside `reach` of a zone and heading in: the move keeps only its part along the edge,
 * and the heading turns along the edge: the way `side` says (+1 = left-hand tangent of the outward
 * normal, −1 = right), or with `side` 0 the way nearer the current heading.
 */
export function keepOut(zones: readonly Zone[], x: number, z: number, yaw: number, mx: number, mz: number, reach: number, side = 0): KeepOut {
  const out: KeepOut = { yaw: null, mx, mz, turned: false, side };
  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  for (const zn of zones) {
    const e = zoneEdge(zn, x, z);
    if (e.d < -INSIDE_FREE || e.d > reach) continue;
    const inward = -(fx * e.nx + fz * e.nz);
    if (inward <= 0.05) continue;
    // Tangents along the edge: the one asked for, else the one nearer the heading.
    const s = side !== 0 ? Math.sign(side) : -e.nz * fx + e.nx * fz < 0 ? -1 : 1;
    const tx = -e.nz * s;
    const tz = e.nx * s;
    out.side = s;
    // A slight outward lean so the horse peels away from the rim.
    const yx = tx + e.nx * 0.35;
    const yz = tz + e.nz * 0.35;
    out.yaw = Math.atan2(yx, yz);
    const into = -(out.mx * e.nx + out.mz * e.nz);
    if (into > 0) {
      out.mx += e.nx * into;
      out.mz += e.nz * into;
    }
    out.turned = true;
  }
  return out;
}
