/**
 * Pip's lost toys: pure logic (no three.js). Seeded paw-print trails from the basket to a hidden
 * spot (validated on an injected world), the "next few prints glow" rule, trail progress and the
 * round / tier progression of a session.
 */
import type { GlassesTier } from '../../../types';
import type { RoadDef } from '../../../world/layout';
import { hashString, seededRng } from '../idle';
import { roadClearance } from '../sites';
import type { SiteAnchor } from '../sites';
import { TOYS, TRAIL } from './constants';

export interface XZ {
  x: number;
  z: number;
}

export interface TrailWorld {
  heightAt(x: number, z: number): number;
  isLand(x: number, z: number): boolean;
  waterLevel: number;
  roads: readonly Pick<RoadDef, 'width' | 'points'>[];
  anchors: Readonly<Record<string, SiteAnchor>>;
  /** Walkable surface height at (x, z), or null when something solid stands there. */
  surfaceAt?(x: number, z: number): number | null;
  /** True when a wall, fence or trunk blocks walking straight from a to b. */
  blockedBetween?(ax: number, az: number, bx: number, bz: number): boolean;
  /** True when the sky above (x, z) is open (no canopy or roof over the hidden spot). */
  openSky?(x: number, z: number): boolean;
  /** Extra circles to keep clear of (the board, the basket). */
  obstacles?: readonly { x: number; z: number; r: number }[];
}

export interface TrailPrint {
  x: number;
  /** Surface height (no lift). */
  y: number;
  z: number;
  /** Walking direction (atan2(dx, dz)). */
  yaw: number;
}

export interface Trail {
  prints: TrailPrint[];
  /** The hidden spot (where the toy pops out). */
  end: TrailPrint;
  spacing: number;
  length: number;
  /** Direction candidate used (0..directions-1) and its angle. */
  candidate: number;
  angle: number;
  /** False only for the fallback (no candidate passed every rule). */
  valid: boolean;
}

/** Why a point is not fit for a print (null = fine). */
export function pointReject(w: TrailWorld, x: number, z: number): string | null {
  if (!w.isLand(x, z)) return 'land';
  const h = w.heightAt(x, z);
  if (h < w.waterLevel + TRAIL.minAboveWater) return 'water';
  if (roadClearance(w.roads, x, z) < TRAIL.roadClear) return 'road';
  for (const a of Object.values(w.anchors)) {
    if (Math.hypot(x - a.position.x, z - a.position.z) < a.radius + TRAIL.anchorMargin) return 'anchor';
    if (a.target && Math.hypot(x - a.target.x, z - a.target.z) < (a.targetRadius ?? 0) + TRAIL.anchorMargin) return 'anchor';
  }
  for (const o of w.obstacles ?? []) if (Math.hypot(x - o.x, z - o.z) < o.r) return 'obstacle';
  if (w.surfaceAt && w.surfaceAt(x, z) === null) return 'blocked';
  return null;
}

const surface = (w: TrailWorld, x: number, z: number): number => w.surfaceAt?.(x, z) ?? w.heightAt(x, z);

/** Prints per trail and spacing for a tier, from one rng draw; the length stays in 25–40 m. */
export function trailShape(tier: GlassesTier, r: number): { count: number; spacing: number } {
  const spacing = TRAIL.spacing[tier];
  const lo = Math.max(TRAIL.minPrints, Math.ceil(TRAIL.minLength / spacing) + 1);
  const hi = Math.min(TRAIL.maxPrints, Math.floor(TRAIL.maxLength / spacing) + 1);
  return { count: lo + Math.min(hi - lo, Math.floor(r * (hi - lo + 1))), spacing };
}

interface Attempt {
  prints: TrailPrint[];
  end: TrailPrint | null;
  ok: boolean;
}

function walk(w: TrailWorld, start: XZ, angle: number, bend: number, freq: number, phase: number, count: number, spacing: number): Attempt {
  const length = spacing * (count - 1);
  const total = length;
  const step = TRAIL.sampleStep;
  let x = start.x;
  let z = start.z;
  let s = 0;
  let prevH = surface(w, x, z);
  const prints: TrailPrint[] = [];
  const heading = (d: number): number => angle + bend * Math.sin((d / Math.max(length, 1)) * Math.PI * 2 * freq + phase) - bend * Math.sin(phase);
  let nextPrint = 0;
  let lastPrint: XZ = start;
  const fail = (): Attempt => ({ prints, end: null, ok: false });
  if (pointReject(w, x, z)) return fail();
  for (;;) {
    if (s >= nextPrint * spacing - 1e-6 && nextPrint < count) {
      const yaw = heading(s);
      if (prints.length > 0 && w.blockedBetween?.(lastPrint.x, lastPrint.z, x, z)) return fail();
      prints.push({ x, y: surface(w, x, z), z, yaw });
      lastPrint = { x, z };
      nextPrint++;
    }
    if (s >= total - 1e-6) break;
    const toPrint = nextPrint < count ? nextPrint * spacing - s : Infinity;
    const ds = Math.min(step, total - s, toPrint > 1e-6 ? toPrint : step);
    const yaw = heading(s + ds / 2);
    x += Math.sin(yaw) * ds;
    z += Math.cos(yaw) * ds;
    s += ds;
    if (pointReject(w, x, z)) return fail();
    const h = surface(w, x, z);
    if (Math.abs(h - prevH) > TRAIL.maxGrade * ds + 0.02) return fail();
    prevH = h;
  }
  if (prints.length !== count) return fail();
  // The hidden spot is BESIDE the last print (so the toy pops up next to the hero, not behind them).
  const last = prints[count - 1];
  const sides = bend >= 0 ? [1, -1] : [-1, 1];
  for (const side of sides) {
    const ex = last.x + Math.cos(last.yaw) * side * TRAIL.endBeside;
    const ez = last.z - Math.sin(last.yaw) * side * TRAIL.endBeside;
    if (pointReject(w, ex, ez)) continue;
    if (w.openSky && !w.openSky(ex, ez)) continue;
    const ey = surface(w, ex, ez);
    if (Math.abs(ey - last.y) > TRAIL.maxGrade * TRAIL.endBeside + 0.02) continue;
    if (w.blockedBetween?.(last.x, last.z, ex, ez)) continue;
    return { prints, end: { x: ex, y: ey, z: ez, yaw: last.yaw }, ok: true };
  }
  return fail();
}

/**
 * A trail from `start` (the basket) for `tier`, deterministic per `seed`. Tries the candidate
 * directions in a seeded order (each with a few bends) until every sample passes the rules.
 */
export interface TrailOptions {
  /**
   * The direction the child looks when standing at the basket (world yaw, atan2(dx, dz)). The
   * trail starts off to the side of it (`TRAIL.startOff` band either side), so its first prints
   * are on screen and not under the hero. Directions outside the band are a last resort.
   */
  forward?: number;
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export function makeTrail(w: TrailWorld, start: XZ, seed: number, tier: GlassesTier, opts: TrailOptions = {}): Trail {
  const rng = seededRng(seed);
  const K = TRAIL.directions;
  const rot = rng() * ((Math.PI * 2) / K);
  const shuffled = Array.from({ length: K }, (_, i) => i);
  for (let i = K - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const inBand = (c: number): boolean => {
    if (opts.forward === undefined) return true;
    const off = Math.abs(wrap(rot + (c / K) * Math.PI * 2 - opts.forward));
    return off >= TRAIL.startOff[0] && off <= TRAIL.startOff[1];
  };
  const order = [...shuffled.filter(inBand), ...shuffled.filter((c) => !inBand(c))];
  const shape = trailShape(tier, rng());
  let best: (Attempt & { candidate: number; angle: number }) | null = null;
  for (const c of order) {
    const angle = rot + (c / K) * Math.PI * 2;
    const from = { x: start.x + Math.sin(angle) * TRAIL.startOffset, z: start.z + Math.cos(angle) * TRAIL.startOffset };
    for (let v = 0; v < TRAIL.variants; v++) {
      const bend = (0.22 + rng() * 0.33) * (v === 1 ? -1 : 1) * (v === 2 ? 0.4 : 1);
      const freq = 0.6 + rng() * 0.6;
      const phase = rng() * Math.PI * 2;
      const count = v === 2 ? trailShape(tier, 0).count : shape.count;
      const a = walk(w, from, angle, bend, freq, phase, count, shape.spacing);
      if (a.ok && a.end) {
        return { prints: a.prints, end: a.end, spacing: shape.spacing, length: shape.spacing * (count - 1), candidate: c, angle, valid: true };
      }
      if (!best || a.prints.length > best.prints.length) best = { ...a, candidate: c, angle };
    }
  }
  // Fallback (crowded spot): the longest valid start of a trail, at least two prints.
  const prints = best && best.prints.length >= 2 ? best.prints : [{ x: start.x + 1.5, y: surface(w, start.x + 1.5, start.z), z: start.z, yaw: Math.PI / 2 }, { x: start.x + 3, y: surface(w, start.x + 3, start.z), z: start.z, yaw: Math.PI / 2 }];
  const last = prints[prints.length - 1];
  return { prints, end: { ...last }, spacing: shape.spacing, length: shape.spacing * (prints.length - 1), candidate: best?.candidate ?? 0, angle: best?.angle ?? 0, valid: false };
}

/** Glow (0..1) of print `i` when `next` is the first print not reached yet. */
export function printGlow(i: number, next: number): number {
  const k = i - next;
  return k >= 0 && k < TRAIL.glow.length ? TRAIL.glow[k] : 0;
}

/** Progress after the player stands at (x, z): reaching any glowing print moves `next` past it. */
export function advance(prints: readonly XZ[], next: number, x: number, z: number): number {
  let out = next;
  const last = Math.min(prints.length - 1, next + TRAIL.glow.length - 1);
  for (let j = next; j <= last; j++) {
    const r = j === prints.length - 1 ? TRAIL.reachLast : TRAIL.reach;
    if (Math.hypot(prints[j].x - x, prints[j].z - z) <= r) out = j + 1;
  }
  return out;
}

export type RoundState = 'trail' | 'found' | 'pause' | 'done';

export type RoundEvent =
  | { type: 'start'; tier: GlassesTier }
  | { type: 'print'; index: number }
  | { type: 'found'; tier: GlassesTier; gems: number; toy: number }
  | { type: 'landed'; toy: number }
  | { type: 'miss'; tier: GlassesTier }
  | { type: 'trail'; tier: GlassesTier; seed: number }
  | { type: 'done' };

/** Trail seed for a session seed and attempt number. */
export function trailSeed(sessionSeed: number, attempt: number): number {
  return hashString(`toys:${sessionSeed >>> 0}:${attempt}`);
}

/**
 * Rounds of a session: three toys, toy n on a tier-n trail. A trail times out `TOYS.timeout`
 * seconds after the player first reaches it (a miss, then a new trail of the same tier).
 */
export class ToyRounds {
  state: RoundState = 'trail';
  /** Toys found this session (= index of the current toy). */
  found = 0;
  attempt = 0;
  seed = 0;
  next = 0;
  started = false;
  /** Seconds since the trail was started (player reached its first print). */
  clock = 0;
  /** Seconds in the current 'found' / 'pause' / 'done' state. */
  t = 0;
  private sessionSeed = 0;
  private trailCache: Trail | null = null;
  private readonly make: (seed: number, tier: GlassesTier) => Trail;

  constructor(make: (seed: number, tier: GlassesTier) => Trail) {
    this.make = make;
  }

  get tier(): GlassesTier {
    return Math.min(3, this.found + 1) as GlassesTier;
  }

  /** The current trail (built lazily: generation probes the world). */
  trail(): Trail {
    if (!this.trailCache) this.trailCache = this.make(this.seed, this.tier);
    return this.trailCache;
  }

  reset(sessionSeed: number): void {
    this.sessionSeed = sessionSeed >>> 0;
    this.found = 0;
    this.attempt = 0;
    this.newTrail();
  }

  /** Use this exact trail seed now (tests). */
  setSeed(seed: number): void {
    this.state = 'trail';
    this.t = 0;
    this.seed = seed >>> 0;
    this.next = 0;
    this.started = false;
    this.clock = 0;
    this.trailCache = null;
  }

  private newTrail(): void {
    this.setSeed(trailSeed(this.sessionSeed, this.attempt));
    this.attempt++;
  }

  update(dt: number, x: number, z: number): RoundEvent[] {
    const ev: RoundEvent[] = [];
    if (this.state === 'trail') {
      const trail = this.trail();
      const n = advance(trail.prints, this.next, x, z);
      if (n > this.next) {
        if (!this.started) {
          this.started = true;
          this.clock = 0;
          ev.push({ type: 'start', tier: this.tier });
        }
        for (let i = this.next; i < n; i++) ev.push({ type: 'print', index: i });
        this.next = n;
      } else if (this.started) {
        this.clock += dt;
      }
      if (this.next >= trail.prints.length) {
        ev.push({ type: 'found', tier: this.tier, gems: TOYS.gems[this.tier], toy: this.found });
        this.state = 'found';
        this.t = 0;
      } else if (this.started && this.clock >= TOYS.timeout) {
        ev.push({ type: 'miss', tier: this.tier });
        this.state = 'pause';
        this.t = 0;
      }
      return ev;
    }
    this.t += dt;
    if (this.state === 'found') {
      const land = TOYS.popSeconds + TOYS.launchSeconds + TOYS.holdSeconds + TOYS.flightSeconds;
      if (this.t - dt < land && this.t >= land) ev.push({ type: 'landed', toy: this.found });
      if (this.t >= TOYS.nextAfterFind) {
        this.found++;
        if (this.found >= TOYS.perSession) {
          this.state = 'done';
          this.t = 0;
          ev.push({ type: 'done' });
        } else {
          this.newTrail();
          ev.push({ type: 'trail', tier: this.tier, seed: this.seed });
        }
      }
    } else if (this.state === 'pause' && this.t >= TOYS.nextAfterMiss) {
      this.newTrail();
      ev.push({ type: 'trail', tier: this.tier, seed: this.seed });
    }
    return ev;
  }
}
