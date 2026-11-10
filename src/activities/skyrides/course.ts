/**
 * Closed sky courses (pure): a Catmull-Rom loop through control points, sampled into a polyline
 * with arc length, so racers, hoops, trails and the autopilot can all say "s metres along".
 */
import type { V3 } from './flightModel';

export interface Course {
  /** Polyline samples (closed: the last joins the first). */
  readonly pts: readonly V3[];
  /** Arc length at each sample. */
  readonly cum: readonly number[];
  readonly length: number;
  /** Point at arc length s (wraps). */
  at(s: number, out?: V3): V3;
  /** Unit tangent at arc length s (wraps). */
  tangent(s: number, out?: V3): V3;
  /**
   * Arc length of the course point nearest to p. With `near`, only looks within ±window metres of
   * it (continuous tracking); returns an unwrapped value close to `near`.
   */
  nearest(p: V3, near?: number, window?: number): number;
}

function catmull(p0: V3, p1: V3, p2: V3, p3: V3, t: number): V3 {
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a: number, b: number, c: number, d: number): number =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y), z: f(p0.z, p1.z, p2.z, p3.z) };
}

export function wrap(s: number, length: number): number {
  const m = s % length;
  return m < 0 ? m + length : m;
}

export function createCourse(control: readonly V3[], samplesPerSpan = 24): Course {
  const n = control.length;
  const pts: V3[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = control[(i - 1 + n) % n];
    const p1 = control[i];
    const p2 = control[(i + 1) % n];
    const p3 = control[(i + 2) % n];
    for (let k = 0; k < samplesPerSpan; k++) pts.push(catmull(p0, p1, p2, p3, k / samplesPerSpan));
  }
  const cum: number[] = [0];
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i % pts.length];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  const length = cum[pts.length];

  const seg = (s: number): { i: number; f: number } => {
    const w = wrap(s, length);
    // Binary search the segment.
    let lo = 0;
    let hi = pts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cum[mid] <= w) lo = mid;
      else hi = mid - 1;
    }
    const len = cum[lo + 1] - cum[lo];
    return { i: lo, f: len > 1e-9 ? (w - cum[lo]) / len : 0 };
  };

  const course: Course = {
    pts,
    cum,
    length,
    at(s, out = { x: 0, y: 0, z: 0 }) {
      const { i, f } = seg(s);
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      out.x = a.x + (b.x - a.x) * f;
      out.y = a.y + (b.y - a.y) * f;
      out.z = a.z + (b.z - a.z) * f;
      return out;
    },
    tangent(s, out = { x: 0, y: 0, z: 1 }) {
      const { i } = seg(s);
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const l = Math.hypot(dx, dy, dz) || 1;
      out.x = dx / l;
      out.y = dy / l;
      out.z = dz / l;
      return out;
    },
    nearest(p, near, window = 60) {
      let best = 0;
      let bestD = Infinity;
      const tmp: V3 = { x: 0, y: 0, z: 0 };
      if (near === undefined) {
        for (let i = 0; i < pts.length; i++) {
          const q = pts[i];
          const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2 + (q.z - p.z) ** 2;
          if (d < bestD) {
            bestD = d;
            best = cum[i];
          }
        }
        return best;
      }
      const step = 1.5;
      for (let s = near - window; s <= near + window; s += step) {
        course.at(s, tmp);
        const d = (tmp.x - p.x) ** 2 + (tmp.y - p.y) ** 2 + (tmp.z - p.z) ** 2;
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
      return best;
    },
  };
  return course;
}

/**
 * Lateral offset frame at s: `side` is horizontal, to the right of the direction of travel.
 * Places things "next to the line".
 */
export function offsetAt(course: Course, s: number, side: number, up: number, out: V3 = { x: 0, y: 0, z: 0 }): V3 {
  const t = course.tangent(s);
  course.at(s, out);
  const h = Math.hypot(t.x, t.z) || 1;
  // Right of travel = forward × up = (-tz, 0, tx) (facing +Z, right is -X).
  out.x += (-t.z / h) * side;
  out.z += (t.x / h) * side;
  out.y += up;
  return out;
}
