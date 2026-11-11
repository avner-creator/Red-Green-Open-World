/**
 * Friend racers: simple waypoint followers along the lap (pure, unit-tested). Rubber-banding keeps
 * them close to the player, but each friend "aims" to sit a little behind, so a child who tries
 * wins; they also have a comic wobble once a lap (cheerful, a bit clumsy, never mean).
 */

export interface RivalTuning {
  /** Cruise speed on straights, m/s (the player's buggy tops out at 16). */
  cruise: number;
  /** Where this friend likes to be relative to the player (metres; negative = behind). */
  aim: number;
  /** Home lane (lateral offset, + = left). */
  lane: number;
  /** Lap distance of this friend's once-a-lap wobble. */
  oopsAt: number;
}

export interface RivalState {
  /** Unwrapped progress (metres from the start line; laps × length + s). */
  progress: number;
  speed: number;
  lateral: number;
  laneTarget: number;
  /** Seconds left of a comic wobble (slows down, wiggles). */
  oops: number;
  /** Seconds left of a bump hop after the player rammed them. */
  bumped: number;
  /** Lap index of the last wobble (one per lap). */
  oopsLap: number;
  /** Race time at which this friend finished, or null. */
  finishedAt: number | null;
}

export interface RaceView {
  length: number;
  laps: number;
  playerProgress: number;
  /** Player's lateral offset on the track. */
  playerLateral: number;
  /** Player's speed averaged over a few seconds (m/s). */
  playerSpeed: number;
  time: number;
  /** |curvature| near a lap distance. */
  curvature(s: number): number;
}

export const AI = {
  maxAccel: 5,
  maxDecel: 9,
  /** Comfortable sideways acceleration in corners (m/s²). */
  cornerAccel: 8.5,
  minSpeed: 4,
  /** Pace reference = refPlayer × player pace + rest × cruise, never below refFloor. */
  refPlayer: 0.65,
  refFloor: 8,
  /** Rubber band: speed factor per metre of error vs. the aim gap. */
  band: 1 / 38,
  bandMin: 0.62,
  bandMax: 1.32,
  laneRate: 2.2,
  oopsSeconds: 1.3,
  /** Speed while finished (rolls on, slows to a cruise). */
  finishedSpeed: 6,
} as const;

export function newRival(startProgress: number, lane: number): RivalState {
  return { progress: startProgress, speed: 0, lateral: lane, laneTarget: lane, oops: 0, bumped: 0, oopsLap: -1, finishedAt: null };
}

/** Cornering speed limit for a curvature (1/m). */
export function cornerSpeed(k: number, accel: number = AI.cornerAccel): number {
  return k < 1e-4 ? Infinity : Math.sqrt(accel / k);
}

/** Rubber band factor from the gap to the player (positive = this friend is ahead). */
export function bandFactor(gap: number, aim: number): number {
  return Math.max(AI.bandMin, Math.min(AI.bandMax, 1 - (gap - aim) * AI.band));
}

const wrap = (s: number, L: number): number => ((s % L) + L) % L;

/** Advance one friend by `dt`. Mutates and returns `r`. */
export function stepRival(r: RivalState, t: RivalTuning, v: RaceView, dt: number): RivalState {
  const L = v.length;
  const total = v.laps * L;
  const s = wrap(r.progress, L);
  const lap = Math.floor(r.progress / L);

  let target: number;
  if (r.finishedAt !== null) {
    target = AI.finishedSpeed;
  } else {
    const gap = r.progress - v.playerProgress;
    // Pace reference: mostly the player's own recent pace, so friends stay in the race whatever
    // the player's skill; the band then settles them around `aim` metres from the player.
    const ref = Math.max(AI.refFloor, AI.refPlayer * v.playerSpeed + (1 - AI.refPlayer) * t.cruise);
    target = ref * bandFactor(gap, t.aim);
    // Look ahead for corners.
    const k = Math.max(v.curvature(s + 4), v.curvature(s + 12) * 0.85);
    target = Math.min(target, cornerSpeed(k));
    // Once a lap: a silly wobble (only while not far behind, so it never strands them).
    if (r.oopsLap !== lap && lap >= 0 && s >= t.oopsAt && s < t.oopsAt + 20 && gap > -25) {
      r.oopsLap = lap;
      r.oops = AI.oopsSeconds;
    }
    if (r.oops > 0) target *= 0.45;
    if (r.bumped > 0) target *= 0.7;
    target = Math.max(AI.minSpeed, target);
    if (v.time < 0.0001) target = 0;
  }
  r.oops = Math.max(0, r.oops - dt);
  r.bumped = Math.max(0, r.bumped - dt);

  const dv = target - r.speed;
  r.speed += Math.max(-AI.maxDecel * dt, Math.min(AI.maxAccel * dt, dv));
  if (r.speed < 0) r.speed = 0;
  r.progress += r.speed * dt;
  if (r.finishedAt === null && r.progress >= total) r.finishedAt = v.time;

  // Lanes: move over when the player is just ahead in the same lane; otherwise drift home.
  const ahead = v.playerProgress - r.progress;
  if (ahead > -2 && ahead < 9 && Math.abs(v.playerLateral - r.lateral) < 2.2) {
    r.laneTarget = v.playerLateral > 0 ? -2 : 2;
  } else if (ahead < -6 || ahead > 14) {
    r.laneTarget = t.lane;
  }
  const dl = r.laneTarget - r.lateral;
  r.lateral += Math.max(-AI.laneRate * dt, Math.min(AI.laneRate * dt, dl));
  return r;
}

export interface Standing {
  id: string;
  progress: number;
  finishedAt: number | null;
}

/** Order racers: finished first (earliest first), then by progress. */
export function standings<T extends Standing>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => {
    if (a.finishedAt !== null && b.finishedAt !== null) return a.finishedAt - b.finishedAt;
    if (a.finishedAt !== null) return -1;
    if (b.finishedAt !== null) return 1;
    return b.progress - a.progress;
  });
}

/** Stars and gem prize for a finishing place (1-based). */
export function prizeFor(place: number): { stars: number; gems: number } {
  if (place <= 1) return { stars: 3, gems: 8 };
  if (place === 2) return { stars: 2, gems: 5 };
  return { stars: 1, gems: 3 };
}

/** Ticket price for the n-th race this session (0-based): the first is free. */
export function racePrice(racesThisSession: number): number {
  return racesThisSession === 0 ? 0 : 3;
}

/**
 * Boost pads "in a row": consecutive pads in lap order (wrapping) within `window` seconds build a
 * chain; the third in a row is a rocket surge (and the chain starts again).
 */
export class BoostChain {
  count = 0;
  private lastIndex = -1;
  private lastTime = -Infinity;
  constructor(private readonly pads: number, private readonly window = 14) {}
  /** Returns the chain length after this hit; 3 = surge. */
  hit(index: number, time: number): number {
    const next = (this.lastIndex + 1) % this.pads;
    if (this.lastIndex >= 0 && index === next && time - this.lastTime <= this.window) this.count++;
    else this.count = 1;
    this.lastIndex = index;
    this.lastTime = time;
    const c = this.count;
    if (c >= 3) this.count = 0;
    return c;
  }
  reset(): void {
    this.count = 0;
    this.lastIndex = -1;
    this.lastTime = -Infinity;
  }
}
