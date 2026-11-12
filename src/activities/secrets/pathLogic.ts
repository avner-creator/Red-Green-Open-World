/**
 * Secret stepping-stone paths (pure maths, no three.js). A path is a list of round stones; each
 * stone's `y` is its walkable TOP. The generators keep every hop easy for an 8-year-old with the
 * default jump (7.8 m/s, g 22 → ~1.38 m apex, ~3.5 m of reach at walking speed).
 */

export interface Stone {
  x: number;
  /** Walkable top of the stone. */
  y: number;
  z: number;
  r: number;
}

export interface P3 {
  x: number;
  y: number;
  z: number;
}

export const STONE = {
  /** Stone top radius, metres (0.9 since QA r7 m10: 0.8 was hard for 8-year-olds). */
  radius: 0.9,
  /** Slab thickness under the walkable top (collider + visual). */
  thickness: 0.42,
  /** Target centre-to-centre horizontal spacing. */
  spacing: 2.3,
  /** Target rise per stone (jump apex is ~1.38 m). */
  rise: 0.75,
  /** Largest drop per stone the generator makes. */
  drop: 1.4,
} as const;

/** Rules every path must satisfy (asserted in unit and e2e tests). */
export const PATH_RULES = {
  /** Max horizontal edge-to-edge gap between consecutive stones. */
  maxGap: 2.2,
  /** Max rise from one stone top to the next. */
  maxRise: 1.0,
  /** Min clearance of a stone's underside above ground or water. */
  minClearance: 0.05,
} as const;

/** Horizontal edge-to-edge gap between two stones (0 when they overlap). */
export function edgeGap(a: Stone, b: Stone): number {
  return Math.max(0, Math.hypot(b.x - a.x, b.z - a.z) - a.r - b.r);
}

/** Small deterministic wobble so a straight run doesn't look ruler-made. */
function wobble(i: number, seed: number): number {
  const s = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453;
  return s - Math.floor(s) - 0.5;
}

/**
 * Stones along a polyline of waypoints (each waypoint is a stone top). Every segment is split so
 * the horizontal step stays ≤ `spacing`, the rise ≤ `rise` and the drop ≤ `drop`. Interior stones
 * get a little sideways jitter (`jitter` metres at most) that never breaks the gap rule.
 */
export function stonesAlong(
  waypoints: readonly P3[],
  opts: { spacing?: number; rise?: number; drop?: number; radius?: number; jitter?: number; seed?: number; arc?: number } = {},
): Stone[] {
  const spacing = opts.spacing ?? STONE.spacing;
  const rise = opts.rise ?? STONE.rise;
  const drop = opts.drop ?? STONE.drop;
  const r = opts.radius ?? STONE.radius;
  const jitter = opts.jitter ?? 0.25;
  const seed = opts.seed ?? 1;
  const arc = opts.arc ?? 0;
  const out: Stone[] = [];
  if (waypoints.length === 0) return out;
  out.push({ x: waypoints[0].x, y: waypoints[0].y, z: waypoints[0].z, r });
  for (let s = 0; s + 1 < waypoints.length; s++) {
    const a = waypoints[s];
    const b = waypoints[s + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const horiz = Math.hypot(dx, dz);
    const dy = b.y - a.y;
    // An arc lifts the middle of the segment; the arc's own climb counts toward the rise limit.
    const n = Math.max(1, Math.ceil(horiz / spacing), Math.ceil((Math.max(0, dy) + arc * 2) / rise), Math.ceil(Math.max(0, -dy) / drop));
    const px = horiz > 1e-6 ? -dz / horiz : 0;
    const pz = horiz > 1e-6 ? dx / horiz : 0;
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const j = k < n ? wobble(out.length, seed) * 2 * jitter : 0;
      out.push({
        x: a.x + dx * t + px * j,
        y: a.y + dy * t + arc * Math.sin(Math.PI * t),
        z: a.z + dz * t + pz * j,
        r,
      });
    }
  }
  return out;
}

/**
 * A rising spiral of stones around (cx, cz). `radius(t)` (t 0..1 up the spiral) lets it pinch in at
 * the top. The angle step keeps the chord at `spacing`; the number of stones comes from the rise.
 */
export function helixStones(
  cx: number,
  cz: number,
  y0: number,
  y1: number,
  radius: number | ((t: number) => number),
  opts: { startAngle?: number; dir?: 1 | -1; spacing?: number; rise?: number; r?: number } = {},
): Stone[] {
  const rad = typeof radius === 'number' ? (): number => radius : radius;
  const spacing = opts.spacing ?? STONE.spacing;
  const rise = opts.rise ?? STONE.rise;
  const r = opts.r ?? STONE.radius;
  const dir = opts.dir ?? 1;
  const n = Math.max(1, Math.ceil((y1 - y0) / rise));
  const out: Stone[] = [];
  let ang = opts.startAngle ?? 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const R = rad(t);
    if (i > 0) {
      // Chord between this stone and the previous one, at the mean radius.
      const Rm = (R + rad((i - 1) / n)) / 2;
      ang += dir * 2 * Math.asin(Math.min(1, spacing / (2 * Rm)));
    }
    out.push({ x: cx + Math.cos(ang) * R, y: y0 + (y1 - y0) * t, z: cz + Math.sin(ang) * R, r });
  }
  return out;
}

export interface PathCheck {
  ok: boolean;
  worstGap: number;
  worstRise: number;
  /** Index of the first failing hop (stone i → i+1), or -1. */
  firstBad: number;
}

/** Validate consecutive hops. `extra` points (e.g. the reward pedestal) can be appended as stones. */
export function checkPath(stones: readonly Stone[]): PathCheck {
  let worstGap = 0;
  let worstRise = -Infinity;
  let firstBad = -1;
  for (let i = 0; i + 1 < stones.length; i++) {
    const g = edgeGap(stones[i], stones[i + 1]);
    const rise = stones[i + 1].y - stones[i].y;
    worstGap = Math.max(worstGap, g);
    worstRise = Math.max(worstRise, rise);
    if (firstBad < 0 && (g > PATH_RULES.maxGap || rise > PATH_RULES.maxRise)) firstBad = i;
  }
  if (stones.length < 2) worstRise = 0;
  return { ok: firstBad < 0, worstGap, worstRise, firstBad };
}

/** Lowest clearance of any stone's underside above `floor(x, z)` (ground or water level). */
export function minClearance(stones: readonly Stone[], floor: (x: number, z: number) => number, thickness: number = STONE.thickness): number {
  let best = Infinity;
  for (const s of stones) {
    // Check the centre and four rim points: the underside is a disc of radius r.
    for (const [ox, oz] of [[0, 0], [s.r, 0], [-s.r, 0], [0, s.r], [0, -s.r]]) {
      best = Math.min(best, s.y - thickness - floor(s.x + ox, s.z + oz));
    }
  }
  return best;
}

/**
 * Is the player standing on stone `s`? Feet within the top disc (with a little grace) and close to
 * its top. Used for the chime and the brief "lit" highlight.
 */
export function onStone(s: Stone, px: number, py: number, pz: number, grace = 0.25): boolean {
  return Math.hypot(px - s.x, pz - s.z) <= s.r + grace && py >= s.y - 0.15 && py <= s.y + 0.35;
}

/**
 * Checkpoints (QA r7 m10: 17–26 stones where any miss meant the street and a restart). Every
 * `every`-th stone is a wider rest stone (still weak-eye only, like every stone: nothing tells the
 * strong eye where the path is). A miss after passing one puts the hero back on it with a soft
 * boing. Jumping off the rest stone itself (or going back down the path) is a way off: no return.
 */
export const CHECKPOINT = {
  every: 6,
  /** Rest stone top radius (m). */
  radius: 1.3,
  /** A fall this far below the last stone stood on is a miss (the deepest planned drop is 1.4 m). */
  fallBelow: 2.6,
  /** Only within this long (s) and this far (m, horizontal) of the last stone: R or a ride is not a miss. */
  memory: 8,
  near: 10,
  /** Path coyote time (s): a jump this long after walking off a stone's edge still counts. */
  coyote: 0.28,
  /** ...unless the hero is already going up faster than this (a real jump). */
  maxVy: 0.5,
} as const;

/** Indices of the rest stones of a path with `n` stones (never the first or the last two). */
export function checkpointIndices(n: number, every: number = CHECKPOINT.every): number[] {
  const out: number[] = [];
  for (let i = every; i <= n - 3; i += every) out.push(i);
  return out;
}

/** The stones with the rest stones widened. */
export function withCheckpoints(stones: readonly Stone[]): Stone[] {
  const cps = new Set(checkpointIndices(stones.length));
  return stones.map((s, i) => (cps.has(i) ? { ...s, r: Math.max(s.r, CHECKPOINT.radius) } : { ...s }));
}

/** Per-path progress: last stone stood on, last rest stone reached, misses and coyote jumps. */
export class PathProgress {
  /** Index of the last rest stone reached (−1 = none yet). */
  checkpoint = -1;
  /** Last stone stood on (−1 = not on the path). */
  lastOn = -1;
  sinceOn = Infinity;
  private coyoteUsed = false;
  private readonly cps: Set<number>;

  constructor(
    private readonly stones: readonly Stone[],
    cps: readonly number[] = checkpointIndices(stones.length),
  ) {
    this.cps = new Set(cps);
  }

  reset(): void {
    this.checkpoint = -1;
    this.lastOn = -1;
    this.sinceOn = Infinity;
    this.coyoteUsed = false;
  }

  /** Leave the path (reached the pedestal, rode away…): no return until a stone is stood on again. */
  leave(): void {
    this.lastOn = -1;
  }

  /**
   * One frame. `on`: the stone the hero stands on (−1 = none). Returns the rest stone to put the
   * hero back on after a miss, or −1.
   */
  update(dt: number, on: number, feet: { x: number; y: number; z: number }): number {
    // Spiral paths (QA8 m4): a miss usually lands on a lower stone of the turn below, not on the
    // ground. Landing below the rest stone after passing it is a miss too: back onto the rest
    // stone with a boing. (Walking down from the rest stone itself is still a way off.)
    if (on >= 0 && this.checkpoint >= 0 && on < this.checkpoint && this.lastOn > this.checkpoint) {
      const back = this.checkpoint;
      this.lastOn = back;
      this.sinceOn = 0;
      this.coyoteUsed = false;
      return back;
    }
    if (on >= 0) {
      this.lastOn = on;
      this.sinceOn = 0;
      this.coyoteUsed = false;
      if (this.cps.has(on) && on > this.checkpoint) this.checkpoint = on;
      return -1;
    }
    this.sinceOn += dt;
    if (this.lastOn < 0) return -1;
    const last = this.stones[this.lastOn];
    const far = Math.hypot(feet.x - last.x, feet.z - last.z) > CHECKPOINT.near || this.sinceOn > CHECKPOINT.memory;
    if (far) {
      this.lastOn = -1;
      return -1;
    }
    if (feet.y > last.y - CHECKPOINT.fallBelow) return -1;
    // A miss. Back to the rest stone only when the hero had gone past it.
    const back = this.checkpoint >= 0 && this.lastOn > this.checkpoint ? this.checkpoint : -1;
    this.lastOn = -1;
    return back;
  }

  /** May a Jump press now still jump (just walked off a stone's edge, not already rising)? Uses it up. */
  coyote(vy: number): boolean {
    if (this.lastOn < 0 || this.coyoteUsed || !(this.sinceOn > 0) || this.sinceOn > CHECKPOINT.coyote || vy > CHECKPOINT.maxVy) return false;
    this.coyoteUsed = true;
    return true;
  }
}
