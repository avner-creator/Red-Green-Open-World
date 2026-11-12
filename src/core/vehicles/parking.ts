/**
 * Parking poses chosen by measurement (QA8 m2): a child gets in and holds W, so a parked ride must
 * point down a clear run that lasts. At each candidate spot the ride's footprint is swept along a
 * fan of headings (static scenery only: no terrain colliders, vehicles or the hero); the run ends
 * at the first obstacle, deep water or a cliff, and is timed with a coarse speed model (faster on
 * the road). The best heading wins. If the home spot has no run that lasts long enough, nearby
 * candidates (along a road for the buggy, round the paddock for a horse) are tried, nearest first.
 *
 * `bestRun` / `choosePark` are pure over a `RunProbe` (unit-tested); `rapierProbe` is the live one.
 */
import type RAPIER from '@dimforge/rapier3d-compat';
import type { GameContext } from '../../types';
import { GROUP_AVATAR, GROUP_VEHICLE, groups } from '../physics';

export interface RunProbe {
  /**
   * Distance (m, ≤ `len`) the footprint facing `yaw` can move from (x, z) along its heading before
   * touching static scenery, or `len` when the way is clear.
   */
  sweep(x: number, z: number, yaw: number, len: number): number;
  /** Ground height (m). */
  height(x: number, z: number): number;
  /** Water surface height (m): ground below it + 0.3 m ends a run. */
  readonly water: number;
  /** On a road or paved pad (optional: rides that do not care about roads leave it out). */
  paved?(x: number, z: number): boolean;
}

export interface RunOpts {
  /** Longest run measured (m). */
  max: number;
  /** Sweep segment length (m): the terrain is checked at every segment end. */
  step: number;
  /** Steepest climb or drop per metre that still counts as drivable. */
  slope: number;
  /** Number of headings sampled round the full circle. */
  headings: number;
}

export const RUN_DEFAULTS: RunOpts = { max: 130, step: 4, slope: 0.45, headings: 72 };

/** Clear run (m) from (x, z) along `yaw`. */
export function clearRun(p: RunProbe, x: number, z: number, yaw: number, o: RunOpts = RUN_DEFAULTS): number {
  const sx = Math.sin(yaw);
  const sz = Math.cos(yaw);
  let h0 = p.height(x, z);
  let d = 0;
  while (d < o.max) {
    const len = Math.min(o.step, o.max - d);
    const cx = x + sx * d;
    const cz = z + sz * d;
    const got = p.sweep(cx, cz, yaw, len);
    // Terrain along the segment, every metre: water or a cliff ends the run there.
    for (let t = 1; t <= got + 1e-6; t += 1) {
      const h = p.height(cx + sx * t, cz + sz * t);
      if (h < p.water + 0.3 || Math.abs(h - h0) > o.slope) return d + t - 1;
      h0 = h;
    }
    d += got;
    if (got < len - 1e-3) return d;
  }
  return o.max;
}

/** Metres from (x, z) along `yaw` that stay on the road (up to `max`), 0 without `paved`. */
export function pavedRun(p: RunProbe, x: number, z: number, yaw: number, max: number): number {
  if (!p.paved) return 0;
  const sx = Math.sin(yaw);
  const sz = Math.cos(yaw);
  let d = 0;
  while (d < max && p.paved(x + sx * d, z + sz * d)) d += 1;
  return Math.min(d, max);
}

/** How fast a ride covers ground with W held from rest (a coarse model of the real drive). */
export interface RideSpeed {
  /** Top speed on a road / off it (m/s). */
  road: number;
  off: number;
  /** The launch from rest: this many metres take `launchTime` seconds. */
  launch: number;
  launchTime: number;
}

/** Seconds of W from rest before the ride covers `run` m along `yaw` (road speed where paved). */
export function runTime(p: RunProbe, x: number, z: number, yaw: number, run: number, sp: RideSpeed): number {
  if (run <= sp.launch) return (sp.launchTime * run) / sp.launch;
  const sx = Math.sin(yaw);
  const sz = Math.cos(yaw);
  let t = sp.launchTime;
  for (let d = sp.launch; d < run; d += 1) {
    const step = Math.min(1, run - d);
    t += step / (p.paved?.(x + sx * d, z + sz * d) ? sp.road : sp.off);
  }
  return t;
}

export interface Run {
  yaw: number;
  /** Clear run (m) and the seconds of W it lasts. */
  run: number;
  time: number;
  /** Of which on the road from the start (m, up to `road`). */
  paved: number;
}

/**
 * The best heading at (x, z): W held for at least `need` s without reaching an obstacle (longer
 * counts no more), then the most road from the start (up to `road` m), then the longest run; ties
 * go to the heading nearest `prefer`.
 */
export function bestRun(p: RunProbe, x: number, z: number, sp: RideSpeed, prefer = 0, need = Infinity, road = 0, o: RunOpts = RUN_DEFAULTS): Run {
  let best: Run = { yaw: prefer, run: -1, time: 0, paved: 0 };
  const better = (a: Run, b: Run): boolean => {
    const ca = Math.min(a.time, need);
    const cb = Math.min(b.time, need);
    if (Math.abs(ca - cb) > 0.05) return ca > cb;
    if (Math.abs(a.paved - b.paved) > 0.5) return a.paved > b.paved;
    return a.run > b.run + 0.5;
  };
  for (let i = 0; i < o.headings; i++) {
    const yaw = prefer + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * ((Math.PI * 2) / o.headings);
    const run = clearRun(p, x, z, yaw, o);
    const r = { yaw, run, time: runTime(p, x, z, yaw, run, sp), paved: road > 0 ? pavedRun(p, x, z, yaw, Math.min(road, run)) : 0 };
    if (better(r, best)) best = r;
  }
  return best;
}

export interface ParkPose {
  x: number;
  z: number;
  yaw: number;
  run: number;
  time: number;
}

/**
 * First candidate (in the given order: nearest first) where W lasts `need` s with the first `road`
 * m on the road; else the first where W lasts `need` s anywhere; else the longest-lasting one.
 * `spotFree` rejects candidates where the ride itself would not fit.
 */
export function choosePark(
  p: RunProbe,
  candidates: readonly { x: number; z: number }[],
  sp: RideSpeed,
  need: number,
  prefer: number,
  spotFree: (x: number, z: number, yaw: number) => boolean = () => true,
  road = 0,
  o: RunOpts = RUN_DEFAULTS,
): ParkPose {
  let any: ParkPose | null = null;
  let best: ParkPose | null = null;
  for (const c of candidates) {
    const r = bestRun(p, c.x, c.z, sp, prefer, need, road, o);
    if (r.run < 0 || !spotFree(c.x, c.z, r.yaw)) continue;
    const pose = { x: c.x, z: c.z, yaw: r.yaw, run: r.run, time: r.time };
    if (r.time >= need && r.paved >= road) return pose;
    if (r.time >= need) any ??= pose;
    if (!best || r.time > best.time + 0.05) best = pose;
  }
  return any ?? best ?? { x: candidates[0].x, z: candidates[0].z, yaw: prefer, run: 0, time: 0 };
}

/** Points every `spacing` m along a polyline, ordered by distance from (x, z), within `radius`. */
export function pointsAlong(lines: readonly (readonly (readonly [number, number])[])[], x: number, z: number, radius: number, spacing: number): { x: number; z: number }[] {
  const out: { x: number; z: number; d: number }[] = [];
  for (const pts of lines) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s <= len; s += spacing) {
        const px = ax + ((bx - ax) * s) / len;
        const pz = az + ((bz - az) * s) / len;
        const d = Math.hypot(px - x, pz - z);
        if (d <= radius) out.push({ x: px, z: pz, d });
      }
    }
  }
  return out.sort((a, b) => a.d - b.d).map(({ x: px, z: pz }) => ({ x: px, z: pz }));
}

/** Grid points within `radius` of (x, z), nearest first (the centre first). */
export function ringPoints(x: number, z: number, radius: number, spacing: number): { x: number; z: number }[] {
  const out: { x: number; z: number; d: number }[] = [];
  const n = Math.floor(radius / spacing);
  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const d = Math.hypot(i, j) * spacing;
      if (d <= radius) out.push({ x: x + i * spacing, z: z + j * spacing, d });
    }
  }
  return out.sort((a, b) => a.d - b.d).map(({ x: px, z: pz }) => ({ x: px, z: pz }));
}

/**
 * The live probe: a box of half extents (`hw` across, `hl` along) swept 0.35–1.25 m above the
 * ground against static scenery (heightfields, vehicles and the hero are skipped).
 */
export function rapierProbe(ctx: GameContext, hw: number, hl: number, paved?: (x: number, z: number) => boolean): RunProbe & { overlaps(x: number, z: number, yaw: number): boolean } {
  const R = ctx.physics.rapier as typeof RAPIER;
  const w = ctx.physics.world as RAPIER.World;
  const box = new R.Cuboid(hw, 0.45, hl);
  // Query membership "vehicle": vehicle bodies and blockers and the hero's capsule are left out.
  const qGroups = groups(GROUP_VEHICLE, 0xffff & ~GROUP_AVATAR & ~GROUP_VEHICLE);
  const scenery = (c: RAPIER.Collider): boolean => c.shapeType() !== R.ShapeType.HeightField;
  const rot = (yaw: number): RAPIER.Rotation => ({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) });
  const pos = { x: 0, y: 0, z: 0 };
  const vel = { x: 0, y: 0, z: 0 };
  const at = (x: number, z: number): RAPIER.Vector => {
    pos.x = x;
    pos.y = ctx.world.heightAt(x, z) + 0.8;
    pos.z = z;
    return pos;
  };
  return {
    water: ctx.world.waterLevel,
    paved,
    height: (x, z) => ctx.world.heightAt(x, z),
    sweep(x, z, yaw, len) {
      vel.x = Math.sin(yaw);
      vel.y = 0;
      vel.z = Math.cos(yaw);
      const hit = w.castShape(at(x, z), rot(yaw), vel, box, 0, len, true, R.QueryFilterFlags.EXCLUDE_SENSORS, qGroups, undefined, undefined, scenery);
      return hit ? Math.max(0, hit.time_of_impact) : len;
    },
    overlaps(x, z, yaw) {
      let any = false;
      w.intersectionsWithShape(at(x, z), rot(yaw), box, () => {
        any = true;
        return false;
      }, R.QueryFilterFlags.EXCLUDE_SENSORS, qGroups, undefined, undefined, scenery);
      return any;
    },
  };
}
