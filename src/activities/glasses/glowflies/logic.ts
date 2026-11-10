/**
 * Glow-flies: pure logic (no three.js). Seeded smooth flight paths inside the patch, the swept
 * catch test, the tier mix, life / fly-off / respawn rules. Positions are site-local XZ plus a
 * height above the ground; `Swarm` turns them into world positions with injected helpers.
 */
import type { GlassesTier } from '../../../types';
import { TIERS } from '../../../vision/toolkit/tiers';
import { FLIES } from './constants';

export interface XZ {
  x: number;
  z: number;
}
export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** A gentle figure-eight with a slow wander, rotated and centred in the patch (site-local). */
export interface FlyPath {
  cx: number;
  cz: number;
  /** Figure-eight half-width (x) and half-depth (z) before rotation. */
  ax: number;
  az: number;
  /** Wander amplitude added on top. */
  wander: number;
  rot: number;
  /** Angular speed (rad/s) and phases. */
  w: number;
  p1: number;
  p2: number;
  /** Height above the ground: centre, amplitude, angular speed, phase. */
  h0: number;
  hAmp: number;
  wh: number;
  ph: number;
}

/** Largest XZ distance of the path from its centre. */
export function pathExtent(p: Pick<FlyPath, 'ax' | 'az' | 'wander'>): number {
  return Math.hypot(p.ax + p.wander, p.az + p.wander);
}

/** Site-local position (x, z) and height above the ground (h) at time `t` on the path. */
export function flyLocal(p: FlyPath, t: number): { x: number; z: number; h: number } {
  const u = p.w * t + p.p1;
  const lx = p.ax * Math.sin(u) + p.wander * Math.sin(0.37 * u + p.p2);
  const lz = p.az * Math.sin(2 * u) * 0.9 + p.wander * Math.cos(0.29 * u + p.p2 * 1.3);
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  return {
    x: p.cx + lx * c - lz * s,
    z: p.cz + lx * s + lz * c,
    h: p.h0 + p.hAmp * Math.sin(p.wh * t + p.ph),
  };
}

export interface PatchShape {
  /** Patch radius around the site centre (local). */
  radius: number;
  /** Site-local spots the paths keep clear of, with their clearances. */
  avoid: readonly { x: number; z: number; r: number }[];
}

/** A seeded path inside the patch, clear of `avoid`, for a fly of `tier`. */
export function makePath(rng: () => number, tier: GlassesTier, patch: PatchShape): FlyPath {
  const speed = TIERS[tier].speed;
  let shrink = 1;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (attempt > 0 && attempt % 12 === 0) shrink *= 0.8;
    const ax = (0.9 + rng() * 1.2) * shrink;
    const az = (0.5 + rng() * 0.9) * shrink;
    const wander = (0.2 + rng() * 0.3) * shrink;
    const ext = pathExtent({ ax, az, wander });
    const room = patch.radius - ext;
    if (room <= 0.05) continue;
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * room;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    if (patch.avoid.some((o) => Math.hypot(cx - o.x, cz - o.z) < ext + o.r)) continue;
    return finishPath(rng, speed, { cx, cz, ax, az, wander });
  }
  // Crowded patch: a tiny loop at the free point farthest from everything it must avoid.
  let best = { x: 0, z: 0, d: -Infinity };
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    for (const rr of [0, 0.4, 0.7]) {
      const x = Math.cos(a) * patch.radius * rr;
      const z = Math.sin(a) * patch.radius * rr;
      const d = Math.min(patch.radius - Math.hypot(x, z), ...patch.avoid.map((o) => Math.hypot(x - o.x, z - o.z) - o.r));
      if (d > best.d) best = { x, z, d };
    }
  }
  const k = Math.max(0.05, best.d) / pathExtent({ ax: 1, az: 0.6, wander: 0.2 });
  return finishPath(rng, speed, { cx: best.x, cz: best.z, ax: Math.min(1, k), az: 0.6 * Math.min(1, k), wander: 0.2 * Math.min(1, k) });
}

function finishPath(rng: () => number, speed: number, base: Pick<FlyPath, 'cx' | 'cz' | 'ax' | 'az' | 'wander'>): FlyPath {
  const hAmp = 0.12 + rng() * 0.2;
  const lo = FLIES.minHeight + hAmp + 0.05;
  const hi = FLIES.maxHeight - hAmp - 0.05;
  return {
    ...base,
    rot: rng() * Math.PI * 2,
    w: FLIES.baseSpeed * speed * (0.85 + rng() * 0.3) * (rng() < 0.5 ? -1 : 1),
    p1: rng() * Math.PI * 2,
    p2: rng() * Math.PI * 2,
    h0: lo + rng() * (hi - lo),
    hAmp,
    wh: 0.9 + rng() * 0.8,
    ph: rng() * Math.PI * 2,
  };
}

/** Distance from point p to the 3D segment a→b. */
export function segmentPointDistance(a: V3, b: V3, p: V3): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const l2 = dx * dx + dy * dy + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / l2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t, p.z - a.z - dz * t);
}

/** Initial tier mix for `n` flies: at least one of each tier, the rest weighted towards tier 1. */
export function tierMix(rng: () => number, n: number): GlassesTier[] {
  const out: GlassesTier[] = [1, 2, 3];
  while (out.length < n) {
    const r = rng();
    out.push(r < 0.42 ? 1 : r < 0.77 ? 2 : 3);
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, n);
}

export type FlyState = 'alive' | 'leaving' | 'gone';

export interface Fly {
  slot: number;
  tier: GlassesTier;
  path: FlyPath;
  state: FlyState;
  /** Seconds alive (path clock). */
  age: number;
  life: number;
  /** Seconds in 'leaving' / until respawn in 'gone'. */
  timer: number;
}

export type SwarmEvent = { type: 'miss'; slot: number; tier: GlassesTier } | { type: 'respawn'; slot: number; tier: GlassesTier };

export interface SwarmOptions {
  rng: () => number;
  patch: PatchShape;
  /** Site-local → world XZ. */
  toWorld(x: number, z: number): XZ;
  groundAt(x: number, z: number): number;
  count?: number;
}

/** The flies at one site. Deterministic for a given rng. */
export class Swarm {
  flies: Fly[] = [];
  private readonly o: SwarmOptions;

  constructor(o: SwarmOptions) {
    this.o = o;
    this.reset();
  }

  /** Fresh swarm (new count, tiers and paths from the rng). */
  reset(): void {
    const { rng } = this.o;
    const n = this.o.count ?? FLIES.minCount + Math.floor(rng() * (FLIES.maxCount - FLIES.minCount + 1));
    const tiers = tierMix(rng, n);
    // Staggered start: the first flies are already mid-life, so they don't all leave together.
    this.flies = tiers.map((tier, slot) => {
      const f = this.spawn(slot, tier);
      f.age = 0.6 + rng() * f.life * 0.5;
      return f;
    });
  }

  private spawn(slot: number, tier: GlassesTier): Fly {
    return { slot, tier, path: makePath(this.o.rng, tier, this.o.patch), state: 'alive', age: 0, life: FLIES.life[tier], timer: 0 };
  }

  /** The tier the swarm is shortest of (keeps the mix in the air); ties are seeded. */
  nextTier(): GlassesTier {
    const counts = [0, 0, 0];
    for (const f of this.flies) if (f.state !== 'gone') counts[f.tier - 1]++;
    const min = Math.min(...counts);
    const options = ([1, 2, 3] as GlassesTier[]).filter((t) => counts[t - 1] === min);
    return options[Math.floor(this.o.rng() * options.length) % options.length];
  }

  /** World position of a fly (centre of its glow). Leaving flies rise. */
  position(f: Fly, out: V3 = { x: 0, y: 0, z: 0 }): V3 {
    const l = flyLocal(f.path, f.age);
    const w = this.o.toWorld(l.x, l.z);
    const k = f.state === 'leaving' ? Math.min(1, f.timer / FLIES.leaveSeconds) : 0;
    out.x = w.x;
    out.z = w.z;
    out.y = this.o.groundAt(w.x, w.z) + l.h + k * k * 3.2;
    return out;
  }

  /**
   * Advance time. A fly past its life flies off (a miss) only while the player is inside the
   * patch; outside it is quietly renewed. Gone flies respawn after their delay.
   */
  update(dt: number, playerInside: boolean): SwarmEvent[] {
    const events: SwarmEvent[] = [];
    for (const f of this.flies) {
      if (f.state === 'alive') {
        f.age += dt;
        if (f.age >= f.life) {
          if (playerInside) {
            f.state = 'leaving';
            f.timer = 0;
            events.push({ type: 'miss', slot: f.slot, tier: f.tier });
          } else {
            Object.assign(f, this.spawn(f.slot, f.tier));
          }
        }
      } else if (f.state === 'leaving') {
        f.age += dt;
        f.timer += dt;
        if (f.timer >= FLIES.leaveSeconds) this.retire(f);
      } else {
        f.timer -= dt;
        if (f.timer <= 0) {
          const tier = this.nextTier();
          Object.assign(f, this.spawn(f.slot, tier));
          events.push({ type: 'respawn', slot: f.slot, tier });
        }
      }
    }
    return events;
  }

  private retire(f: Fly): void {
    f.state = 'gone';
    f.timer = FLIES.respawnMin + this.o.rng() * (FLIES.respawnMax - FLIES.respawnMin);
  }

  /**
   * Flies caught by a chest moving from `from` to `to` this frame (swept: speed cannot skip one).
   * Caught flies are gone (respawn later). Returns them with their catch position.
   */
  catchAlong(from: V3, to: V3, radius: number = FLIES.catchRadius): { fly: Fly; at: V3 }[] {
    const out: { fly: Fly; at: V3 }[] = [];
    for (const f of this.flies) {
      if (f.state !== 'alive') continue;
      const p = this.position(f);
      if (segmentPointDistance(from, to, p) <= radius) {
        out.push({ fly: f, at: p });
        this.retire(f);
      }
    }
    return out;
  }

  /** Nearest alive fly's distance to `p` (Infinity if none). */
  nearest(p: V3): number {
    let best = Infinity;
    const q = { x: 0, y: 0, z: 0 };
    for (const f of this.flies) {
      if (f.state !== 'alive') continue;
      this.position(f, q);
      best = Math.min(best, Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z));
    }
    return best;
  }
}
