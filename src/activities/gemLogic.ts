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
  /** Seconds after pickup before a gem comes back (0 or missing = never). */
  respawnSeconds?: number;
  /** Per-spot pickup radius (mega gems are bigger). Defaults to `pickupRadius`. */
  radiusOf?: (index: number) => number;
}

export class GemField {
  readonly collected: boolean[];
  /** Gems picked up since the last reset (keeps rising when gems respawn). */
  count = 0;
  /** Seconds left until a collected gem comes back (0 for gems that are in place). */
  readonly respawnIn: number[];
  private nearTimer = 0;

  constructor(
    readonly spots: Vec3[],
    private readonly opts: GemFieldOptions,
  ) {
    this.collected = spots.map(() => false);
    this.respawnIn = spots.map(() => 0);
  }

  get total(): number {
    return this.spots.length;
  }

  /** Add a gem spot after construction (mega gems that wait for the rides to be built). */
  addSpot(p: Vec3): number {
    this.spots.push(p);
    this.collected.push(false);
    this.respawnIn.push(0);
    return this.spots.length - 1;
  }

  reset(): void {
    this.collected.fill(false);
    this.respawnIn.fill(0);
    this.count = 0;
    this.nearTimer = 0;
  }

  /** Collect every uncollected gem touched by the segment prev to cur. Returns their indices. */
  collect(prev: Vec3, cur: Vec3): number[] {
    const hit: number[] = [];
    for (let i = 0; i < this.spots.length; i++) {
      if (this.collected[i]) continue;
      if (segmentSphereHit(prev, cur, this.spots[i], this.opts.radiusOf ? this.opts.radiusOf(i) : this.opts.pickupRadius)) {
        this.collected[i] = true;
        this.respawnIn[i] = this.opts.respawnSeconds ?? 0;
        this.count++;
        hit.push(i);
      }
    }
    return hit;
  }

  /** Count down respawn timers (call only while playing). Returns the indices that came back. */
  tickRespawn(dt: number): number[] {
    const back: number[] = [];
    for (let i = 0; i < this.spots.length; i++) {
      if (!this.collected[i] || this.respawnIn[i] <= 0) continue;
      this.respawnIn[i] -= dt;
      if (this.respawnIn[i] <= 0) {
        this.respawnIn[i] = 0;
        this.collected[i] = false;
        back.push(i);
      }
    }
    return back;
  }

  /** Bring every collected gem back right now. Returns their indices. */
  respawnAll(): number[] {
    const back: number[] = [];
    for (let i = 0; i < this.spots.length; i++) {
      if (!this.collected[i]) continue;
      this.collected[i] = false;
      this.respawnIn[i] = 0;
      back.push(i);
    }
    return back;
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
