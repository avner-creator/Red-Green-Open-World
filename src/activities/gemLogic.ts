/** Pure glow-gem logic (pickup tests, near hints, reset). No three, no DOM. */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Does the segment a to b pass within radius r of centre c? (Stops fast fallers tunnelling.) */
export function segmentSphereHit(a: Vec3, b: Vec3, c: Vec3, r: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = 0;
  if (len2 > 1e-12) {
    t = ((c.x - a.x) * dx + (c.y - a.y) * dy + (c.z - a.z) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
  }
  const px = a.x + dx * t - c.x;
  const py = a.y + dy * t - c.y;
  const pz = a.z + dz * t - c.z;
  return px * px + py * py + pz * pz <= r * r;
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export interface GemFieldOptions {
  pickupRadius: number;
  nearRadius: number;
  nearInterval: number;
}

export class GemField {
  readonly collected: boolean[];
  count = 0;
  private nearTimer = 0;

  constructor(
    readonly spots: readonly Vec3[],
    private readonly opts: GemFieldOptions,
  ) {
    this.collected = spots.map(() => false);
  }

  get total(): number {
    return this.spots.length;
  }

  reset(): void {
    this.collected.fill(false);
    this.count = 0;
    this.nearTimer = 0;
  }

  /** Collect every uncollected gem touched by the segment prev to cur. Returns their indices. */
  collect(prev: Vec3, cur: Vec3): number[] {
    const hit: number[] = [];
    for (let i = 0; i < this.spots.length; i++) {
      if (this.collected[i]) continue;
      if (segmentSphereHit(prev, cur, this.spots[i], this.opts.pickupRadius)) {
        this.collected[i] = true;
        this.count++;
        hit.push(i);
      }
    }
    return hit;
  }

  nearest(pos: Vec3): { index: number; distance: number } | null {
    let best: { index: number; distance: number } | null = null;
    for (let i = 0; i < this.spots.length; i++) {
      if (this.collected[i]) continue;
      const d = distance(pos, this.spots[i]);
      if (d <= this.opts.nearRadius && (!best || d < best.distance)) best = { index: i, distance: d };
    }
    return best;
  }

  /** Throttled near hint: returns the nearest gem at most once per `nearInterval` seconds. */
  tickNear(dt: number, pos: Vec3): { index: number; distance: number } | null {
    this.nearTimer -= dt;
    if (this.nearTimer > 0) return null;
    const n = this.nearest(pos);
    if (n) this.nearTimer = this.opts.nearInterval;
    return n;
  }
}
