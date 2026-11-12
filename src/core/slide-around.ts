/**
 * Slide-around hints (QA8 m1): invisible helper walls round a structure (the Gear Shack's hull)
 * can say which way to go round. A hero pushing into such a wall nearly head-on would otherwise
 * stand there (the character controller only slides by the sideways part of the push); with a
 * hint the push is turned along the wall toward the structure's front, so a child holding the
 * stick at a kiosk from behind walks round it to the counter.
 *
 * World code marks colliders (`markSlideAround`); the player reads them from its controller's
 * contacts (`slideEdge`) and steers with `slideSteer` (pure).
 */

export interface SlideEdge {
  /** Outward unit normal of the wall (world x, z). */
  nx: number;
  nz: number;
  /** Unit direction along the wall to slide in (world x, z). */
  tx: number;
  tz: number;
}

const edges = new Map<number, SlideEdge>();

/** Give a (real Rapier) collider a slide hint. Test stubs without a handle are ignored. */
export function markSlideAround(collider: unknown, edge: SlideEdge): void {
  const h = (collider as { handle?: unknown } | null)?.handle;
  if (typeof h === 'number') edges.set(h, edge);
}

/** The slide hint of a collider handle, if any. */
export function slideEdge(handle: number): SlideEdge | undefined {
  return edges.get(handle);
}

/** Forget every hint (a world rebuilt in tests). */
export function clearSlideAround(): void {
  edges.clear();
}

/**
 * The slide direction along a wall with unit direction (tx, tz): the sense that heads toward the
 * front (fx, fz); for a wall square to the front, the +t sense.
 */
export function slideToward(tx: number, tz: number, fx: number, fz: number): { tx: number; tz: number } {
  const s = tx * fx + tz * fz < -0.05 ? -1 : 1;
  return { tx: tx * s, tz: tz * s };
}

/** Pushing at least this much into the wall (cosine to the inward normal) turns the push. */
export const SLIDE_INTO = 0.3;
/** A little of the push stays into the wall so the contact (and the hint) holds. */
const KEEP_INTO = 0.2;

/**
 * Steer a move direction `d` (world x, z; length = stick magnitude) that pushes into `e` along the
 * wall instead, keeping its magnitude. Null when it does not push into the wall (enough).
 */
export function slideSteer(d: { x: number; z: number }, e: SlideEdge): { x: number; z: number } | null {
  const m = Math.hypot(d.x, d.z);
  if (m < 1e-4) return null;
  const into = -(d.x * e.nx + d.z * e.nz) / m;
  if (into < SLIDE_INTO) return null;
  // Already heading along the hint more than across it: the controller's own slide does the rest.
  const along = (d.x * e.tx + d.z * e.tz) / m;
  if (along > 0.8) return null;
  const x = e.tx - e.nx * KEEP_INTO;
  const z = e.tz - e.nz * KEEP_INTO;
  const l = Math.hypot(x, z);
  return { x: (x / l) * m, z: (z / l) * m };
}
