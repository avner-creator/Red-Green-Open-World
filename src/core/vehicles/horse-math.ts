/**
 * Pure horse maths (no three.js, no Rapier): gait selection, target speed from the stick,
 * acceleration, turning, jump velocity, slope and water response, clip playback rates and the
 * gallop sound cadence. Unit-tested in tests/core/horse-math.test.ts.
 */

export type Gait = 'idle' | 'walk' | 'trot' | 'gallop';

export const HORSE = {
  /** Full stick, no Shift: a brisk trot. */
  trotSpeed: 7.5,
  /** Full stick + Shift: gallop. On foot the player sprints at 11 m/s, so this must beat it. */
  gallopSpeed: 13,
  /** Gentle stick (or just starting off). */
  walkSpeed: 3.2,
  /** Backing up (S). */
  reverseSpeed: 2.2,
  /** m/s² speeding up and slowing down (stick released), and hard braking (stick back). */
  accel: 7.5,
  coast: 6,
  brake: 14,
  /** Turn rate (rad/s) standing / walking, and at full gallop: wide arcs when fast. */
  turnSlow: 2.7,
  turnFast: 1.45,
  /** How fast the turn rate follows the stick (1/s): smooth, not twitchy. */
  turnResponse: 9,
  /** Gravity while airborne (m/s²) and the jump apex: hooves clear ~1.6 m fences. */
  gravity: 24,
  jumpHeight: 1.7,
  /** Gait thresholds (m/s). */
  walkFrom: 0.35,
  trotFrom: 4.6,
  gallopFrom: 9.6,
  /** Ground speed of each clip at playback rate 1 (m/s per 1× rate): stride length / cycle time. */
  clipSpeed: { walk: 2.1, trot: 4.2, gallop: 11 } as const,
  /** Clip-rate limits so legs never look like they skate or blur. */
  rateRange: { walk: [0.55, 1.6], trot: [1.1, 2.3], gallop: [0.85, 1.35] } as const,
  /** Water: wading starts slowing at this depth (m) and the horse refuses to go deeper than `refuseDepth`. */
  wadeDepth: 0.15,
  refuseDepth: 0.75,
  /** Slope (rise/run) at which uphill speed is reduced to `slopeMinFactor`. */
  steepSlope: 1.0,
  slopeMinFactor: 0.6,
} as const;

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Speed the rider asks for. `throttle` −1..1 (stick forward/back), `sprint` = Shift / gallop
 * button. Gentle forward stick walks, full stick trots, Shift gallops; back stick reverses slowly.
 */
export function targetSpeed(throttle: number, sprint: boolean): number {
  const t = clamp(throttle, -1, 1);
  if (t < -0.1) return t * HORSE.reverseSpeed;
  if (t < 0.1) return 0;
  const top = sprint ? HORSE.gallopSpeed : HORSE.trotSpeed;
  // Ease in: half stick is a walk, full stick is the top speed of the chosen gait.
  const k = (t - 0.1) / 0.9;
  return lerp(HORSE.walkSpeed, top, k * k);
}

/** One step of speed toward `target`: accelerate, coast down, or brake (stick against motion). */
export function approachSpeed(speed: number, target: number, dt: number): number {
  let rate: number = HORSE.accel;
  if (Math.abs(target) < Math.abs(speed)) rate = HORSE.coast;
  if (Math.sign(target) !== Math.sign(speed) && Math.abs(speed) > 0.2 && target !== 0) rate = HORSE.brake;
  const d = target - speed;
  const step = rate * dt;
  return Math.abs(d) <= step ? target : speed + Math.sign(d) * step;
}

/** Gait for a ground speed (absolute value; backing up is a walk). */
export function gaitFor(speed: number): Gait {
  const s = Math.abs(speed);
  if (s < HORSE.walkFrom) return 'idle';
  if (s < HORSE.trotFrom) return 'walk';
  if (s < HORSE.gallopFrom) return 'trot';
  return 'gallop';
}

/** Clip playback rate for a gait at a speed, so hooves roughly match the ground. */
export function clipRate(gait: Gait, speed: number): number {
  if (gait === 'idle') return 1;
  const [lo, hi] = HORSE.rateRange[gait];
  return clamp(Math.abs(speed) / HORSE.clipSpeed[gait], lo, hi);
}

/** Max turn rate (rad/s) at a speed: nimble when slow, wide arcs at a gallop. */
export function turnRate(speed: number): number {
  const k = clamp((Math.abs(speed) - HORSE.walkSpeed) / (HORSE.gallopSpeed - HORSE.walkSpeed), 0, 1);
  return lerp(HORSE.turnSlow, HORSE.turnFast, k);
}

/** Take-off vertical speed for an apex `height` under `gravity`. */
export function jumpVelocity(height: number = HORSE.jumpHeight, gravity: number = HORSE.gravity): number {
  return Math.sqrt(2 * gravity * height);
}

/** Seconds in the air for a jump that lands at the take-off height. */
export function jumpAirTime(height: number = HORSE.jumpHeight, gravity: number = HORSE.gravity): number {
  return (2 * jumpVelocity(height, gravity)) / gravity;
}

/** Uphill slows a little (sure-footed: never stops); downhill and flat are full speed. */
export function slopeFactor(rise: number, run: number): number {
  if (run <= 1e-6 || rise <= 0) return 1;
  const s = rise / run;
  return lerp(1, HORSE.slopeMinFactor, clamp(s / HORSE.steepSlope, 0, 1));
}

/**
 * Water ahead: `depth` = water level − ground height at the probe (m, > 0 = under water).
 * Returns the speed cap factor (1 = dry) and whether the horse should turn back to land.
 */
export function waterResponse(depth: number): { factor: number; turnBack: boolean } {
  if (depth <= HORSE.wadeDepth) return { factor: 1, turnBack: false };
  const k = clamp((depth - HORSE.wadeDepth) / (HORSE.refuseDepth - HORSE.wadeDepth), 0, 1);
  return { factor: lerp(0.55, 0, k), turnBack: depth >= HORSE.refuseDepth * 0.8 };
}

/**
 * Gallop loop parameters from the gait: the audio clops 4 beats every 0.64 / pitch s, so pitch
 * follows the clip cycle (hooves in time with the legs). Intensity grows with speed.
 */
export function hoofSound(gait: Gait, speed: number): { intensity: number; pitch: number } {
  if (gait === 'idle') return { intensity: 0, pitch: 1 };
  const cycle = gait === 'gallop' ? 0.583 : 1.167; // clip lengths (s) at rate 1
  const pitch = clamp((0.64 * clipRate(gait, speed)) / cycle, 0.3, 2.5);
  const intensity = clamp(0.25 + Math.abs(speed) / HORSE.gallopSpeed, 0, 1);
  return { intensity, pitch };
}

/**
 * Rear-up emote curve: body pitch (radians, nose up) at time `t` of a `duration` s rear.
 * Smooth rise, a short proud hold with a wobble, gentle landing.
 */
export function rearPitch(t: number, duration = 1.6, peak = 0.62): number {
  if (t <= 0 || t >= duration) return 0;
  const u = t / duration;
  const up = u < 0.3 ? Math.sin((u / 0.3) * (Math.PI / 2)) : 1;
  const down = u > 0.7 ? Math.cos(((u - 0.7) / 0.3) * (Math.PI / 2)) : 1;
  const wobble = u > 0.3 && u < 0.7 ? 0.06 * Math.sin((u - 0.3) * Math.PI * 7.5) : 0;
  return peak * up * down + wobble;
}
