/**
 * Foam Lava scoring (pure): medal times, stars, gem prizes and the friend's scripted run.
 *
 * Calibration: the tidy test bot runs the main route in ~17 s and the secret-tile shortcut in
 * ~15 s. Kids take about 1.5-2.5x that with a splash or two, so gold needs a clean, quick run,
 * and the friend (~35 s with one comic splash) loses to an 8-year-old who keeps going.
 */
import { CANNONS } from './layout';
import { cannonState } from './sim';

export const MEDALS = { gold: 22, silver: 30, bronze: 42 } as const;

export type Medal = 'gold' | 'silver' | 'bronze' | 'ribbon';

export function medalFor(time: number): Medal {
  if (time <= MEDALS.gold) return 'gold';
  if (time <= MEDALS.silver) return 'silver';
  if (time <= MEDALS.bronze) return 'bronze';
  return 'ribbon';
}

/** Stars for the HUD/stunt event: every finish earns at least one. */
export function starsFor(medal: Medal): number {
  return medal === 'gold' ? 3 : medal === 'silver' ? 2 : 1;
}

/** Gem prize for a paid (or the free first) run; practice runs pay nothing. */
export function prizeFor(medal: Medal, beatFriend: boolean): number {
  const base = medal === 'gold' ? 5 : medal === 'silver' ? 3 : medal === 'bronze' ? 2 : 1;
  return base + (beatFriend ? 1 : 0);
}

/** Ticket rule: the first run each session is free, then 3 gems. */
export const TICKET = 3;

export type GhostAnim = 'idle' | 'run' | 'jump' | 'flop' | 'fall' | 'cheer';

interface Leg {
  to: [number, number, number];
  dur: number;
  /** Arc height for a hop (0 = walk). */
  hop?: number;
  anim?: GhostAnim;
  /** Start this leg only when the first cannon has just puffed (run clock). */
  waitCannon?: boolean;
}

export interface GhostKey {
  t: number;
  x: number;
  y: number;
  z: number;
  hop: number;
  anim: GhostAnim;
}

const FRIEND_START: [number, number, number] = [2.4, 1.0, 0.2];

/** The friend's run: a bit slow and clumsy, with one big splash at the floats. */
const LEGS: readonly Leg[] = [
  { to: [3.4, 1.05, 3.9], dur: 1.4, hop: 0.7, anim: 'jump' },
  { to: [4.2, 1.05, 6.3], dur: 1.1 },
  { to: [2.6, 1.05, 8.4], dur: 1.2 },
  { to: [1.5, 0.35, 9.3], dur: 0.6, hop: 0.3, anim: 'flop' }, // whoops: slips into the foam
  { to: [1.5, 0.3, 9.3], dur: 1.8, anim: 'flop' },
  { to: [2.6, 1.05, 8.4], dur: 0.7, hop: 1.4, anim: 'jump' }, // pops back out, foamy
  { to: [4.1, 1.05, 10.6], dur: 1.2 },
  { to: [3.5, 1.25, 13.3], dur: 1.0, hop: 0.6, anim: 'jump' },
  { to: [2.6, 1.5, 14.9], dur: 0.8, hop: 0.6, anim: 'jump' },
  { to: [3.6, 1.75, 16.5], dur: 0.8, hop: 0.6, anim: 'jump' },
  { to: [2.8, 2.0, 18.0], dur: 0.8, hop: 0.6, anim: 'jump' },
  { to: [3.3, 2.0, 20.8], dur: 1.1 },
  { to: [2.7, 2.0, 23.4], dur: 1.0 },
  { to: [3.9, 2.15, 24.5], dur: 0.8 },
  { to: [2.7, 2.0, 25.6], dur: 0.8 },
  { to: [3.9, 2.15, 26.7], dur: 0.8 },
  { to: [3.3, 2.0, 27.9], dur: 0.7 },
  { to: [3.3, 2.0, 35.95], dur: 3.2 },
  { to: [3.3, 2.3, 39.0], dur: 0.8 },
  { to: [1.9, 2.3, 40.3], dur: 0.6 },
  { to: [1.9, 2.3, 40.3], dur: 0.5, anim: 'idle' },
  { to: [-2.8, 2.3, 40.3], dur: 1.6, hop: 1.6, anim: 'jump' }, // the rope swing
  { to: [-3.8, 2.3, 38.0], dur: 0.7 },
  { to: [-3.8, 1.0, 27.2], dur: 1.3, anim: 'fall' }, // slip-and-slide, belly down
  { to: [-3.8, 1.0, 22.6], dur: 1.0 },
  { to: [-3.8, 1.0, 7.4], dur: 2.5, waitCannon: true },
  { to: [-3.8, 1.0, 5.9], dur: 0.35 },
  { to: [-3.6, 1.0, 0.6], dur: 0.9, hop: 1.9, anim: 'jump' }, // bubble bounce to the finish
];

/** Build the friend's keyframes (cannon waits resolved against the run clock). */
export function ghostTimeline(): GhostKey[] {
  const keys: GhostKey[] = [{ t: 0, x: FRIEND_START[0], y: FRIEND_START[1], z: FRIEND_START[2], hop: 0, anim: 'idle' }];
  let t = 0;
  for (const leg of LEGS) {
    const last = keys[keys.length - 1];
    if (leg.waitCannon) {
      // Wait (idle) for the moment the first cannon has just finished puffing.
      let w = t;
      while (!(cannonState(w, CANNONS[0].offset).state === 'idle' && cannonState(w - 1 / 30, CANNONS[0].offset).state === 'blast')) w += 1 / 60;
      if (w > t) keys.push({ t: w, x: last.x, y: last.y, z: last.z, hop: 0, anim: 'idle' });
      t = w;
    }
    t += leg.dur;
    keys.push({ t, x: leg.to[0], y: leg.to[1], z: leg.to[2], hop: leg.hop ?? 0, anim: leg.anim ?? 'run' });
  }
  return keys;
}

export interface GhostPose {
  x: number;
  y: number;
  z: number;
  /** Facing (course frame). */
  yaw: number;
  anim: GhostAnim;
  done: boolean;
}

/** Where the friend is at run time `t`. */
export function ghostAt(keys: readonly GhostKey[], t: number): GhostPose {
  const end = keys[keys.length - 1];
  if (t >= end.t) {
    const prev = keys[keys.length - 2];
    return { x: end.x, y: end.y, z: end.z, yaw: Math.atan2(end.x - prev.x, end.z - prev.z), anim: 'cheer', done: true };
  }
  if (t <= 0) return { x: keys[0].x, y: keys[0].y, z: keys[0].z, yaw: 0, anim: 'idle', done: false };
  let i = 1;
  while (keys[i].t < t) i++;
  const a = keys[i - 1];
  const b = keys[i];
  const k = (t - a.t) / Math.max(1e-6, b.t - a.t);
  const moving = Math.hypot(b.x - a.x, b.z - a.z) > 0.05;
  return {
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k + 4 * b.hop * k * (1 - k),
    z: a.z + (b.z - a.z) * k,
    yaw: moving ? Math.atan2(b.x - a.x, b.z - a.z) : b.anim === 'flop' ? Math.PI / 2 : 0,
    anim: b.anim,
    done: false,
  };
}

/** Seconds the friend needs. */
export function ghostTime(keys: readonly GhostKey[]): number {
  return keys[keys.length - 1].t;
}

/** Format seconds as "23.4". */
export function formatTime(s: number): string {
  return (Math.floor(s * 10) / 10).toFixed(1);
}
