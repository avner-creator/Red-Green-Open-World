/**
 * The race lap: a closed loop on the island roads around the garage (east road → loop road →
 * south road → across the plaza's east edge), resampled into an evenly spaced centreline with
 * distances, headings and curvature. Pure maths (unit-tested): progress along the lap, the racing
 * line (cuts to the inside of corners), checkpoint and boost-pad positions.
 */

export interface TrackPoint {
  x: number;
  z: number;
  /** Unit direction of travel. */
  dx: number;
  dz: number;
  /** Distance from the start line along the lap, metres. */
  s: number;
  /** Signed curvature (1/m): + = turning left (towards +left normal). */
  k: number;
}

export interface Track {
  readonly points: readonly TrackPoint[];
  readonly length: number;
  /** Interpolated point at lap distance `s` (wraps). */
  at(s: number): TrackPoint;
  /** Closest lap distance to (x, z), the signed lateral offset (+ = left of travel) and distance. */
  project(x: number, z: number): { s: number; lateral: number; dist: number };
  /** Average |curvature| over [s − r, s + r]. */
  curvatureNear(s: number, r?: number): number;
}

/**
 * Lap control points [x, z] in driving order (from the island plan's roads; see world/layout.ts
 * ROADS east, loop, south), with a grass cut from the south road to the east road that stays off
 * the plaza (benches, bins, the spawn point). Props on the roads are avoided by the safe line
 * (corridor.ts), not by moving these points.
 */
export const LAP_POINTS: readonly (readonly [number, number])[] = [
  [26, 11], [46, 12], [60, 24], [67, 40], [69, 47], [68.6, 53], [68, 58], [66, 70], [60, 78],
  [46, 82], [28, 80], [17.5, 77], [7, 74], [5, 60], [2, 40], [3, 27], [9.5, 17.5], [17.5, 11.2],
];

/** Where the start/finish line goes (the lap is rotated so s = 0 is the closest point). */
export const START_NEAR: readonly [number, number] = [34, 11.4];

/** Centripetal-ish closed Catmull-Rom through the control points, sampled every `step` metres. */
export function buildTrack(ctrl: readonly (readonly [number, number])[] = LAP_POINTS, start: readonly [number, number] = START_NEAR, step = 2): Track {
  const n = ctrl.length;
  // Dense polyline first.
  const dense: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n];
    const p1 = ctrl[i];
    const p2 = ctrl[(i + 1) % n];
    const p3 = ctrl[(i + 2) % n];
    const segs = 24;
    for (let j = 0; j < segs; j++) {
      const t = j / segs;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number): number =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  // Rotate so the start is first.
  let best = 0;
  let bestD = Infinity;
  dense.forEach((p, i) => {
    const d = (p[0] - start[0]) ** 2 + (p[1] - start[1]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  const ring = [...dense.slice(best), ...dense.slice(0, best)];
  // Cumulative length.
  const cum: number[] = [0];
  for (let i = 1; i <= ring.length; i++) {
    const a = ring[i - 1];
    const b = ring[i % ring.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const length = cum[ring.length];
  // Even resample.
  const count = Math.max(8, Math.round(length / step));
  const pts: TrackPoint[] = [];
  let seg = 0;
  for (let i = 0; i < count; i++) {
    const s = (i / count) * length;
    while (cum[seg + 1] < s) seg++;
    const a = ring[seg];
    const b = ring[(seg + 1) % ring.length];
    const t = (s - cum[seg]) / Math.max(1e-6, cum[seg + 1] - cum[seg]);
    pts.push({ x: a[0] + (b[0] - a[0]) * t, z: a[1] + (b[1] - a[1]) * t, dx: 0, dz: 0, s, k: 0 });
  }
  for (let i = 0; i < count; i++) {
    const p = pts[i];
    const nx = pts[(i + 1) % count];
    const pv = pts[(i - 1 + count) % count];
    const dx = nx.x - pv.x;
    const dz = nx.z - pv.z;
    const l = Math.hypot(dx, dz) || 1;
    p.dx = dx / l;
    p.dz = dz / l;
  }
  for (let i = 0; i < count; i++) {
    const a = pts[(i - 1 + count) % count];
    const b = pts[(i + 1) % count];
    // Heading change per metre from the cross product of the neighbouring directions; + = left turn
    // (facing (sin y, cos y) has its left at (cos y, −sin y), see `leftOf`).
    const cross = a.dx * b.dz - a.dz * b.dx;
    const dot = a.dx * b.dx + a.dz * b.dz;
    pts[i].k = -Math.atan2(cross, dot) / (2 * (length / count));
  }

  const wrap = (s: number): number => ((s % length) + length) % length;
  const at = (s: number): TrackPoint => {
    const w = wrap(s);
    const f = (w / length) * count;
    const i = Math.floor(f) % count;
    const j = (i + 1) % count;
    const t = f - Math.floor(f);
    const a = pts[i];
    const b = pts[j];
    const dx = a.dx + (b.dx - a.dx) * t;
    const dz = a.dz + (b.dz - a.dz) * t;
    const l = Math.hypot(dx, dz) || 1;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx: dx / l, dz: dz / l, s: w, k: a.k + (b.k - a.k) * t };
  };
  const project = (x: number, z: number): { s: number; lateral: number; dist: number } => {
    let bi = 0;
    let bd = Infinity;
    for (let i = 0; i < count; i++) {
      const d = (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2;
      if (d < bd) {
        bd = d;
        bi = i;
      }
    }
    // Refine on the two neighbouring segments.
    let bestS = pts[bi].s;
    let bestLat = 0;
    let bestDist = Math.sqrt(bd);
    for (const [i0, i1] of [[(bi - 1 + count) % count, bi], [bi, (bi + 1) % count]]) {
      const a = pts[i0];
      const b = pts[i1];
      const ex = b.x - a.x;
      const ez = b.z - a.z;
      const l2 = ex * ex + ez * ez || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / l2));
      const px = a.x + ex * t;
      const pz = a.z + ez * t;
      const d = Math.hypot(x - px, z - pz);
      if (d <= bestDist + 1e-9) {
        bestDist = d;
        const segLen = Math.sqrt(l2);
        bestS = wrap(a.s + t * segLen);
        // Left of travel (see `leftOf`).
        const lx = ez / segLen;
        const lz = -ex / segLen;
        bestLat = (x - px) * lx + (z - pz) * lz;
      }
    }
    return { s: bestS, lateral: bestLat, dist: bestDist };
  };
  const curvatureNear = (s: number, r = 8): number => {
    let sum = 0;
    let n2 = 0;
    for (let d = -r; d <= r; d += 2) {
      sum += Math.abs(at(s + d).k);
      n2++;
    }
    return sum / n2;
  };
  return { points: pts, length, at, project, curvatureNear };
}

/** Left normal of a direction (dx, dz): facing (sin y, cos y) has its left at (cos y, −sin y). */
export function leftOf(dx: number, dz: number): { x: number; z: number } {
  return { x: dz, z: -dx };
}

/**
 * Racing line: lateral offset (+ = left) at each sample, cutting to the inside of corners and
 * smoothed so it flows; clamped to stay on a 7 m road.
 */
export function racingLine(track: Track, maxOffset = 2.2, gain = 60): number[] {
  const pts = track.points;
  const n = pts.length;
  // Inside of a left turn (k > 0) is the left side.
  let off = pts.map((p) => Math.max(-maxOffset, Math.min(maxOffset, p.k * gain)));
  for (let pass = 0; pass < 6; pass++) {
    off = off.map((_, i) => (off[(i - 2 + n) % n] + off[(i - 1 + n) % n] * 2 + off[i] * 3 + off[(i + 1) % n] * 2 + off[(i + 2) % n]) / 9);
  }
  return off.map((o) => Math.max(-maxOffset, Math.min(maxOffset, o)));
}

/** Evenly spaced lap distances for `count` checkpoints (index 0 = the start/finish line). */
export function checkpointDistances(length: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i / count) * length);
}

/**
 * Boost pads: on the straightest stretches, spread out, never within `clear` metres of the start
 * line (the grid) or of each other. Returns lap distances in driving order.
 */
export function boostPadDistances(track: Track, count = 6, clear = 18): number[] {
  const L = track.length;
  const cand = track.points.map((p) => ({ s: p.s, k: track.curvatureNear(p.s, 6) }));
  cand.sort((a, b) => a.k - b.k);
  const chosen: number[] = [];
  const gap = Math.min(L / (count + 1), 34);
  const lapDist = (a: number, b: number): number => {
    const d = Math.abs(a - b) % L;
    return Math.min(d, L - d);
  };
  for (const c of cand) {
    if (chosen.length >= count) break;
    if (lapDist(c.s, 0) < clear) continue;
    if (chosen.some((s) => lapDist(s, c.s) < gap)) continue;
    chosen.push(c.s);
  }
  return chosen.sort((a, b) => a - b);
}

/**
 * Unwrapped race progress: feed the projected lap distance every frame; jumps (teleports,
 * shortcuts across the loop) larger than `maxJump` are ignored, and nothing counts while far off
 * the track.
 */
export class Progress {
  value: number;
  private last: number;
  constructor(private readonly length: number, start = 0, private readonly maxJump = 25) {
    this.value = start;
    this.last = ((start % length) + length) % length;
  }
  update(s: number, distFromTrack: number, maxDist = 16): number {
    let ds = s - this.last;
    if (ds > this.length / 2) ds -= this.length;
    if (ds < -this.length / 2) ds += this.length;
    if (Math.abs(ds) <= this.maxJump && distFromTrack <= maxDist) this.value += ds;
    this.last = s;
    return this.value;
  }
  /** Re-anchor without counting distance (after a rescue). */
  reset(s: number): void {
    this.last = s;
  }
}
