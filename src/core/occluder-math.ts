/**
 * Pure maths for camera occluders (unit-tested): ray vs capsule (sphere-traced signed distance),
 * one-sided ray vs triangle, and the canopy capsule fitted to a tree/bush/rock bounding box.
 * Vectors are plain {x,y,z} so the functions run without three.js objects.
 */

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** A vertical-ish capsule: segment a→b, radius r. Flat fields for cheap storage in arrays. */
export interface Capsule {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  r: number;
}

/** Signed distance from (px,py,pz) to the capsule surface (< 0 inside). */
export function capsuleSdf(c: Capsule, px: number, py: number, pz: number): number {
  const abx = c.bx - c.ax;
  const aby = c.by - c.ay;
  const abz = c.bz - c.az;
  const apx = px - c.ax;
  const apy = py - c.ay;
  const apz = pz - c.az;
  const ab2 = abx * abx + aby * aby + abz * abz;
  let t = ab2 > 1e-9 ? (apx * abx + apy * aby + apz * abz) / ab2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = apx - abx * t;
  const dy = apy - aby * t;
  const dz = apz - abz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - c.r;
}

/**
 * Distance along the unit ray `o + d·t` until a sphere of `radius` touches the capsule, or null
 * within `maxDist`. A ray that starts inside the (inflated) capsule returns null: the hero standing
 * under a canopy must not snap the camera into their head.
 */
export function castCapsule(c: Capsule, o: V3, d: V3, maxDist: number, radius: number): number | null {
  let t = 0;
  let s = capsuleSdf(c, o.x, o.y, o.z) - radius;
  if (s <= 0) return null;
  for (let i = 0; i < 48 && t <= maxDist; i++) {
    if (s < 1e-3) return t;
    t += s;
    s = capsuleSdf(c, o.x + d.x * t, o.y + d.y * t, o.z + d.z * t) - radius;
  }
  return null;
}

/**
 * One-sided Möller–Trumbore: distance to the triangle (a,b,c) for a ray that enters through its
 * front (counter-clockwise) face, or null. Rays leaving a closed shell from inside never hit.
 * `tri` holds 9 floats starting at `i`.
 */
export function rayTriangleFront(tri: ArrayLike<number>, i: number, o: V3, d: V3, maxDist: number): number | null {
  const ax = tri[i];
  const ay = tri[i + 1];
  const az = tri[i + 2];
  const e1x = tri[i + 3] - ax;
  const e1y = tri[i + 4] - ay;
  const e1z = tri[i + 5] - az;
  const e2x = tri[i + 6] - ax;
  const e2y = tri[i + 7] - ay;
  const e2z = tri[i + 8] - az;
  const px = d.y * e2z - d.z * e2y;
  const py = d.z * e2x - d.x * e2z;
  const pz = d.x * e2y - d.y * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  // det > 0: the ray hits the front face.
  if (det < 1e-9) return null;
  const inv = 1 / det;
  const tx = o.x - ax;
  const ty = o.y - ay;
  const tz = o.z - az;
  const u = (tx * px + ty * py + tz * pz) * inv;
  if (u < 0 || u > 1) return null;
  const qx = ty * e1z - tz * e1y;
  const qy = tz * e1x - tx * e1z;
  const qz = tx * e1y - ty * e1x;
  const v = (d.x * qx + d.y * qy + d.z * qz) * inv;
  if (v < 0 || u + v > 1) return null;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t >= 0 && t <= maxDist ? t : null;
}

/**
 * Local-space capsule for a vegetation/rock instance from its geometry's vertices (xyz triples).
 * Tall shapes (trees) get a capsule around the crown only: the crown is fitted to the vertices away
 * from the trunk axis, so the hero walking under it stays outside (the trunk has a physics
 * collider). Squat shapes (bushes, rocks) get a sphere around their box. Null for small things
 * (grass, flowers) that never hide the hero.
 */
export function crownCapsule(pos: ArrayLike<number>): Capsule | null {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let i = 0; i + 2 < pos.length; i += 3) {
    const x = pos[i];
    const y = pos[i + 1];
    const z = pos[i + 2];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  if (!(x1 >= x0)) return null;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const rx = Math.max(x1 - x0, z1 - z0) / 2;
  const h = y1 - y0;
  if (h < 1.1 && rx < 0.8) return null;
  if (h <= 2.2 * rx) {
    const r = Math.max(rx, h / 2) * 0.85;
    const cy = (y0 + y1) / 2;
    return { ax: cx, ay: cy, az: cz, bx: cx, by: cy, bz: cz, r };
  }
  // Crown: vertices away from the trunk axis.
  let cy0 = Infinity;
  let cy1 = -Infinity;
  const rr = (rx * 0.4) ** 2;
  for (let i = 0; i + 2 < pos.length; i += 3) {
    const dx = pos[i] - cx;
    const dz = pos[i + 2] - cz;
    if (dx * dx + dz * dz < rr) continue;
    const y = pos[i + 1];
    if (y < cy0) cy0 = y;
    if (y > cy1) cy1 = y;
  }
  if (!(cy1 > cy0)) return null;
  const r = Math.min(rx, (cy1 - cy0) / 2) * 0.9;
  const ay = cy0 + r;
  const by = Math.max(ay, cy1 - r);
  return { ax: cx, ay, az: cz, bx: cx, by, bz: cz, r };
}
