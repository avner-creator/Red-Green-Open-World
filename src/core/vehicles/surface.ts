/**
 * What the wheels are on (road vs grass) and the nearest drivable road spot for rescues.
 * Reads the island plan's pure road data (`src/world/layout.ts`); WorldApi has no surface query yet.
 */
import { ANCHORS, PADS, ROADS } from '../../world/layout';
import { closestOnPolyline, segmentDistSq } from './car-math';

interface Seg {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** (half width + shoulder)² */
  r2: number;
}

const segs: Seg[] = [];
/** Polylines that are on the ground (no bridge-deck points), usable as rescue spots. */
const groundRoads: [number, number][][] = [];
for (const road of ROADS) {
  const hw = road.width / 2 + 0.6;
  for (let i = 0; i < road.points.length - 1; i++) {
    const a = road.points[i];
    const b = road.points[i + 1];
    segs.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], r2: hw * hw });
  }
  if (road.kind !== 'path' && road.points.every((p) => p.length === 2)) {
    groundRoads.push(road.points.map((p) => [p[0], p[1]] as [number, number]));
  }
}
/** Paved pads count as road (plaza, garage forecourt). */
const paved = PADS.filter((p) => p.id === 'plaza' || p.id === 'garage');

/** True when (x, z) is on a road, street, path or paved pad. */
export function isPaved(x: number, z: number): boolean {
  for (const s of segs) if (segmentDistSq(x, z, s.ax, s.az, s.bx, s.bz) <= s.r2) return true;
  for (const p of paved) {
    if (p.shape === 'circle' && Math.hypot(x - p.x, z - p.z) <= (p.r ?? 0)) return true;
    if (p.shape === 'rect' && Math.abs(x - p.x) <= (p.hx ?? 0) && Math.abs(z - p.z) <= (p.hz ?? 0)) return true;
  }
  return false;
}

/** Nearest point on a ground-level road centreline, with the road direction there. */
export function nearestRoad(x: number, z: number): { x: number; z: number; dist: number; dirX: number; dirZ: number } {
  let best = { x: ANCHORS.garage.x, z: ANCHORS.garage.z, dist: Infinity, dirX: 0, dirZ: -1 };
  for (const pts of groundRoads) {
    const c = closestOnPolyline(x, z, pts);
    if (c.dist < best.dist) best = c;
  }
  return best;
}
