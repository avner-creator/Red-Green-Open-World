/**
 * Race "stuck" watch (pure, unit-tested): decides when the player's buggy should be popped back
 * onto the track at the last checkpoint (QA5 M3: a car wedged off the track for 135 s).
 *
 * - wedged: throttle held but barely moving for `wedgedSeconds`;
 * - flipped: upside-down or on its side for `flippedSeconds`;
 * - lost: further than `offTrackMetres` from the track for `lostSeconds`, or no forward progress
 *   along the lap for `noProgressSeconds` (whatever the reason).
 */
export const UNSTICK = {
  wedgedSpeed: 1,
  wedgedThrottle: 0.3,
  wedgedSeconds: 2.5,
  /** Chassis up-vector y below this = on its side / upside-down. */
  flippedUpY: 0.5,
  flippedSeconds: 1.5,
  offTrackMetres: 16,
  lostSeconds: 4,
  /** Forward progress (metres) that counts as "getting somewhere". */
  progressStep: 6,
  noProgressSeconds: 8,
  /** A second R within this many seconds of a reset leaves the race. */
  secondPressSeconds: 2,
  /** Seconds of no-collision ghost after a reset. */
  ghostSeconds: 1.6,
} as const;

export type StuckReason = 'wedged' | 'flipped' | 'lost';

export interface StuckSample {
  dt: number;
  /** |speed| m/s. */
  speed: number;
  /** Forward throttle the player holds (0..1). */
  throttle: number;
  /** Chassis up-vector y. */
  upY: number;
  /** Distance from the track centre line, metres. */
  offTrack: number;
  /** Unwrapped lap progress, metres. */
  progress: number;
}

export class StuckWatch {
  private wedged = 0;
  private flipped = 0;
  private lost = 0;
  private sinceProgress = 0;
  private best = -Infinity;

  /** Start over (race start, after a reset). */
  reset(progress: number): void {
    this.wedged = this.flipped = this.lost = this.sinceProgress = 0;
    this.best = progress;
  }

  /** Feed one frame; returns a reason when the car should be reset (then call `reset`). */
  update(s: StuckSample): StuckReason | null {
    this.wedged = s.throttle > UNSTICK.wedgedThrottle && s.speed < UNSTICK.wedgedSpeed ? this.wedged + s.dt : 0;
    this.flipped = s.upY < UNSTICK.flippedUpY ? this.flipped + s.dt : 0;
    this.lost = s.offTrack > UNSTICK.offTrackMetres ? this.lost + s.dt : 0;
    if (s.progress > this.best + UNSTICK.progressStep) {
      this.best = s.progress;
      this.sinceProgress = 0;
    } else this.sinceProgress += s.dt;
    if (this.flipped >= UNSTICK.flippedSeconds) return 'flipped';
    if (this.wedged >= UNSTICK.wedgedSeconds) return 'wedged';
    if (this.lost >= UNSTICK.lostSeconds || this.sinceProgress >= UNSTICK.noProgressSeconds) return 'lost';
    return null;
  }
}

/**
 * R during a race: the first press pops the buggy back onto the track; a second press within
 * `secondPressSeconds` of that leaves the race (R everywhere else releases rides).
 */
export function rPressAction(now: number, lastReset: number | null): 'reset' | 'leave' {
  return lastReset !== null && now - lastReset <= UNSTICK.secondPressSeconds ? 'leave' : 'reset';
}
