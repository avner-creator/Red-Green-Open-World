/**
 * Board reading view (pure logic, unit-tested in tests/core/camera-read.test.ts).
 *
 * A hero standing in front of a readable board (the island map on the plaza) hides part of it from
 * the third-person camera behind them: up close no badge layout clears every hero and hat. So when
 * the on-foot hero stands in a zone in front of the board, facing it (or standing still), the
 * camera eases up to a raised spot behind them and looks down over their head at the board's
 * centre: the hero then projects below the board's bottom edge, small at the bottom of the screen.
 * It eases back when the hero leaves the zone, walks away or runs, and the player's own look input
 * always wins (it stays off until the hero has left the zone). Never in a vehicle, on horseback,
 * during activities or while another system (Pip's story camera, a ride) holds the camera.
 *
 * Boards register themselves (world code calls `registerReadingSpot`); everything here is maths:
 * no physics casts (the camera's spring arm keeps its usual collision).
 */
import type { PlayerMode } from '../types';

export interface ReadingSpot {
  /** Unique id: a re-registration (world rebuilt) replaces the old spot. */
  id: string;
  /** Face centre (world, m). */
  x: number;
  y: number;
  z: number;
  /** Unit horizontal normal the face looks along (towards the reader). */
  nx: number;
  nz: number;
  /** Face width and height (m). */
  w: number;
  h: number;
}

const spots = new Map<string, ReadingSpot>();

/** Add (or replace) a readable board. */
export function registerReadingSpot(s: ReadingSpot): void {
  const n = Math.hypot(s.nx, s.nz) || 1;
  spots.set(s.id, { ...s, nx: s.nx / n, nz: s.nz / n });
}

export function readingSpots(): readonly ReadingSpot[] {
  return [...spots.values()];
}

/** Tuning (m, s, rad). */
export const READ = {
  /** Enter zone: this far in front of the face (along its normal) and within this angle of it. */
  near: 2,
  far: 7,
  halfAngle: (50 * Math.PI) / 180,
  /** Leave zone (hysteresis: a little bigger). */
  exitNear: 1.4,
  exitFar: 8,
  exitAngle: (60 * Math.PI) / 180,
  /** Facing the board: the hero's heading within this angle of the way to its centre. */
  facing: (55 * Math.PI) / 180,
  /** Slower than this counts as standing still (m/s). */
  stillSpeed: 0.4,
  /** Standing still this long in the zone (facing anywhere) brings the view in. */
  stillTime: 0.5,
  /** Walking up to it, facing it, no faster than this brings the view in (m/s). Runs past never do. */
  approachSpeed: 3.5,
  /** Conditions must hold this long before the view comes in (a walk-by never triggers it). */
  dwell: 0.25,
  /** Moving away from the board faster than this (m/s), or running faster than `runSpeed`, ends it. */
  awaySpeed: 1.2,
  runSpeed: 7.5,
  /** Seconds the camera takes to ease in or out. */
  blend: 0.6,
  /** Look input (rad, summed over a short window) that counts as the player steering the camera. */
  lookCancel: 0.02,
  lookDecay: 3,
} as const;

export interface ReadInput {
  heroX: number;
  heroZ: number;
  /** Hero heading (yaw: forward = (sin, cos)). */
  heroYaw: number;
  vx: number;
  vz: number;
  mode: PlayerMode;
  /** Game phase is 'playing'. */
  playing: boolean;
  /** A vehicle chase camera is on. */
  chase: boolean;
  /** Some system holds a camera override (Pip's story camera, a ride, a booth). */
  override: boolean;
  /** Player look input this frame (|lookX| + |lookY|, rad); a test `setView` counts as a big one. */
  look: number;
  dt: number;
}

export interface ReadState {
  /** The board being read (or last read, while easing out). */
  spot: ReadingSpot | null;
  active: boolean;
  /** The player looked around near the board: no reading view until the hero leaves the zone. */
  suppressed: boolean;
  still: number;
  dwell: number;
  looked: number;
  /** Linear blend 0..1 (use `readWeight` for the eased value). */
  t: number;
}

export function createReadState(): ReadState {
  return { spot: null, active: false, suppressed: false, still: 0, dwell: 0, looked: 0, t: 0 };
}

/** Where the hero stands relative to a spot: distance along the normal, angle off it, and the unit way to its centre. */
export function zoneOf(s: ReadingSpot, x: number, z: number): { along: number; angle: number; dist: number; ux: number; uz: number } {
  const rx = x - s.x;
  const rz = z - s.z;
  const along = rx * s.nx + rz * s.nz;
  const lat = rx * s.nz - rz * s.nx;
  const dist = Math.hypot(rx, rz) || 1e-6;
  return { along, angle: Math.atan2(Math.abs(lat), along), dist, ux: -rx / dist, uz: -rz / dist };
}

const inZone = (s: ReadingSpot, x: number, z: number, exit: boolean): boolean => {
  const q = zoneOf(s, x, z);
  return exit
    ? q.along >= READ.exitNear && q.along <= READ.exitFar && q.angle <= READ.exitAngle
    : q.along >= READ.near && q.along <= READ.far && q.angle <= READ.halfAngle;
};

/** Advance the reading-view state by one frame. */
export function stepReading(st: ReadState, list: readonly ReadingSpot[], i: ReadInput): void {
  const speed = Math.hypot(i.vx, i.vz);
  const allowed = i.playing && i.mode === 'walk' && !i.chase && !i.override;
  st.looked = st.looked * Math.exp(-READ.lookDecay * i.dt) + i.look;
  // The board the hero is near (still inside the leave zone of the current one, else the nearest
  // whose enter zone they stand in).
  let near: ReadingSpot | null = null;
  if (st.spot && inZone(st.spot, i.heroX, i.heroZ, true)) near = st.spot;
  else {
    let best = Infinity;
    for (const s of list) {
      const q = zoneOf(s, i.heroX, i.heroZ);
      if (q.dist < best && inZone(s, i.heroX, i.heroZ, false)) {
        best = q.dist;
        near = s;
      }
    }
  }
  if (!near) {
    // Out of every zone: the player's look-around veto is forgotten.
    st.suppressed = false;
    st.active = false;
    st.still = 0;
    st.dwell = 0;
  } else {
    if (near !== st.spot && st.t <= 0) st.spot = near;
    if (st.looked > READ.lookCancel) {
      st.suppressed = true;
      st.active = false;
    }
    const q = zoneOf(near, i.heroX, i.heroZ);
    st.still = speed < READ.stillSpeed ? st.still + i.dt : 0;
    if (st.active) {
      const away = -(i.vx * q.ux + i.vz * q.uz);
      if (!allowed || speed > READ.runSpeed || away > READ.awaySpeed) {
        st.active = false;
        st.dwell = 0;
        // Walking off re-arms only once they stop again (no flicker back in on the way out).
        st.still = 0;
      }
    } else if (allowed && !st.suppressed && near === st.spot && inZone(near, i.heroX, i.heroZ, false)) {
      const facing = Math.cos(i.heroYaw) * q.uz + Math.sin(i.heroYaw) * q.ux >= Math.cos(READ.facing);
      const approach = facing && speed <= READ.approachSpeed && -(i.vx * q.ux + i.vz * q.uz) <= 0.2;
      const want = st.still >= READ.stillTime || approach;
      st.dwell = want ? st.dwell + i.dt : 0;
      if (st.dwell >= READ.dwell) st.active = true;
    } else st.dwell = 0;
  }
  if (!allowed) st.active = false;
  const goal = st.active ? 1 : 0;
  const step = i.dt / READ.blend;
  st.t = goal > st.t ? Math.min(goal, st.t + step) : Math.max(goal, st.t - step);
  if (st.t <= 0 && !st.active) st.spot = near;
}

/** Eased blend weight (smoothstep: no jolt at either end). */
export function readWeight(st: ReadState): number {
  const t = st.t;
  return t * t * (3 - 2 * t);
}

/** Reading-view tuning for the camera's place. */
export const READ_ARM = {
  /** Camera at least this far behind the hero's centre, horizontally (m). */
  back: 3.4,
  /** ...and no further than this (a too steep view steps back, up to here). */
  maxBack: 5,
  /** The hero's top projects at least this far below the face's bottom edge (m, on the face plane). */
  margin: 0.4,
  minPitch: 0.25,
  maxPitch: 1.1,
  /** Longest arm (m). */
  maxDistance: 10,
} as const;

/** A point of the hero's silhouette: `top` m above the feet, `reach` m out towards the board. */
export interface HeroPoint {
  top: number;
  reach: number;
}

/**
 * The camera arm for reading `s` from a hero at (x, feetY, z): yaw (the camera looks along
 * (sin, cos) at the face centre), pitch and length of the arm from the orbit pivot (`pivotH` above
 * the feet), so the line from the camera over every hero point meets the face below its bottom
 * edge: the hero is drawn under the board's bottom badge row.
 */
export function readingArm(s: ReadingSpot, x: number, feetY: number, z: number, pts: readonly HeroPoint[], pivotH: number): { yaw: number; pitch: number; distance: number } {
  const q = zoneOf(s, x, z);
  const yaw = Math.atan2(q.ux, q.uz);
  // Heights relative to the hero's feet; the face's bottom edge minus the margin is the aim.
  const aim = s.y - s.h / 2 - feetY - READ_ARM.margin;
  const heightAt = (back: number): number => {
    let h = aim;
    for (const p of pts) {
      // The camera on the line from the aim point over this point (`gap` from the face).
      const gap = Math.max(0.6, q.dist - p.reach);
      h = Math.max(h, aim + ((p.top - aim) * (q.dist + back)) / gap);
    }
    return h;
  };
  let back: number = READ_ARM.back;
  let dy = heightAt(back) - pivotH;
  // Too steep: step back (the line over the hero then needs a little more height).
  while (Math.atan2(dy, back) > READ_ARM.maxPitch && back < READ_ARM.maxBack) {
    back += 0.2;
    dy = heightAt(back) - pivotH;
  }
  const pitch = Math.max(READ_ARM.minPitch, Math.min(READ_ARM.maxPitch, Math.atan2(dy, back)));
  const distance = Math.min(READ_ARM.maxDistance, Math.hypot(Math.max(0, dy), back));
  return { yaw, pitch, distance };
}
