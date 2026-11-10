/** Weak-eye arrow trails (pure): from the nearest road to a target, evenly spaced, pointing at it. */

export interface XZ {
  x: number;
  z: number;
}

export interface ArrowPlace {
  x: number;
  z: number;
  /** Heading (three rotation.y) that points the arrow's +Z tip at the target. */
  yaw: number;
  /** 0 at the road end .. 1 at the target (for the chasing pulse). */
  t: number;
}

export const ARROWS = {
  spacing: 2.6,
  /** Leave the road itself clear. */
  startSkip: 2.5,
  /** Stop short of the target. */
  endSkip: 2.2,
  /** Longest trail; a far target gets only the last part of the line. */
  maxLength: 40,
  /** A target right by the road still gets a short trail this long (extended back past the road). */
  minLength: 12,
} as const;

/** Closest point on a set of polylines (XZ only). */
export function nearestOnPolylines(lines: readonly (readonly XZ[])[], x: number, z: number): XZ & { distance: number } {
  let best: XZ & { distance: number } = { x, z, distance: Infinity };
  for (const pts of lines) {
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0;
      const px = a.x + dx * t;
      const pz = a.z + dz * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < best.distance) best = { x: px, z: pz, distance: d };
    }
  }
  return best;
}

/** Arrow placements along the straight line from `from` (road) to `to` (target). */
export function arrowTrail(from: XZ, to: XZ, opts: Partial<typeof ARROWS> = {}): ArrowPlace[] {
  const o = { ...ARROWS, ...opts };
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  let len = Math.hypot(dx, dz);
  if (len < 0.5) return [];
  const ux = dx / len;
  const uz = dz / len;
  if (len < o.minLength) {
    // Too close to the road for a trail: start further back along the same line.
    from = { x: to.x - ux * o.minLength, z: to.z - uz * o.minLength };
    len = o.minLength;
  }
  const yaw = Math.atan2(ux, uz);
  const end = len - o.endSkip;
  const begin = Math.max(o.startSkip, end - o.maxLength);
  const out: ArrowPlace[] = [];
  // Anchor the spacing at the target end so the last arrow always sits right before it.
  for (let d = end; d >= begin - 1e-6; d -= o.spacing) {
    out.push({ x: from.x + ux * d, z: from.z + uz * d, yaw, t: 0 });
  }
  out.reverse();
  const n = out.length;
  out.forEach((a, i) => (a.t = n > 1 ? i / (n - 1) : 1));
  return out;
}
