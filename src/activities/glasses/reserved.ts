/**
 * Places kept free for attractions that are being built in other streams (or that stand on the
 * plaza already without an anchor). Glasses sites keep their centre ≥ `RESERVED_POINT_CLEAR` from
 * every reserved point and their whole circle (+ margin) out of every footprint; the toys trail
 * keeps its prints out of the footprints (`isReserved`). Pure data, coordinates in metres.
 */

export type Footprint =
  | { shape: 'circle'; x: number; z: number; r: number }
  | { shape: 'rect'; x0: number; x1: number; z0: number; z1: number };

export interface Reserved {
  name: string;
  x: number;
  z: number;
  footprints: readonly Footprint[];
}

const circle = (x: number, z: number, r: number): Footprint => ({ shape: 'circle', x, z, r });
const rect = (x0: number, x1: number, z0: number, z1: number): Footprint => ({ shape: 'rect', x0, x1, z0, z1 });

export const RESERVED: readonly Reserved[] = [
  { name: 'carnivalRow', x: 21, z: -42, footprints: [circle(21, -42, 17), rect(13, 29, -58, -26)] },
  { name: 'iceCream', x: 24, z: -2, footprints: [circle(24, -2, 5)] },
  // The race lap itself uses the roads east, loop and south (see ROAD_EXTRA_MARGIN in ./sites.ts).
  { name: 'raceStart', x: 29.5, z: 11.2, footprints: [circle(29.5, 11.2, 6), circle(33, 2.6, 4), circle(45, 2, 3)] },
  { name: 'foamCourse', x: -25.5, z: -18.5, footprints: [rect(-32.5, -18.5, -63.5, -12.5)] },
  // Runway, then its approach and climb-out in the same x band.
  { name: 'airstrip', x: -12, z: 46, footprints: [circle(-12, 46, 22), rect(-19, -5, 26, 66), rect(-19, -5, 1, 91)] },
  { name: 'dragonRoost', x: -34, z: -130, footprints: [circle(-34, -130, 7)] },
  { name: 'bubbleArena', x: 35, z: 57.5, footprints: [circle(35, 57.5, 13), rect(23.4, 46.6, 50.9, 64.1), circle(28.5, 48.2, 3)] },
  { name: 'dinoRing', x: 16, z: 58.5, footprints: [circle(16, 58.5, 7), circle(16, 49.9, 3)] },
  { name: 'gearShack', x: 14, z: 2, footprints: [circle(14, 2, 4)] },
];

/** Site centres stay at least this far from every reserved point. */
export const RESERVED_POINT_CLEAR = 20;

/** Distance from (x, z) to a footprint's edge (negative inside). */
export function footprintDistance(f: Footprint, x: number, z: number): number {
  if (f.shape === 'circle') return Math.hypot(x - f.x, z - f.z) - f.r;
  const dx = Math.max(f.x0 - x, 0, x - f.x1);
  const dz = Math.max(f.z0 - z, 0, z - f.z1);
  if (dx === 0 && dz === 0) return -Math.min(x - f.x0, f.x1 - x, z - f.z0, f.z1 - z);
  return Math.hypot(dx, dz);
}

/** Smallest distance from (x, z) to any footprint of `r`. */
export function reservedDistance(r: Reserved, x: number, z: number): number {
  let best = Infinity;
  for (const f of r.footprints) best = Math.min(best, footprintDistance(f, x, z));
  return best;
}

/** True when (x, z) is inside (or within `pad` metres of) a reserved footprint. */
export function isReserved(x: number, z: number, pad = 0): boolean {
  for (const r of RESERVED) if (reservedDistance(r, x, z) < pad) return true;
  return false;
}
