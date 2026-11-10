/** Activity-local tuning (shared constants live in src/config.ts, which we do not edit). */

export const MAT = {
  /** Radius of the bouncy mat, metres. */
  radius: 9,
  /** Height of the mat surface above the ground. */
  top: 1,
  /** Padded rim tube radius. */
  rimTube: 0.45,
  legs: 10,
  stepRise: 0.33,
} as const;

/** Bounce rules. */
export const BOUNCE = {
  /** A landing without holding jump keeps this share of the last apex. */
  releaseDecay: 0.55,
  /** Below this apex a released bounce just stops (kids can stand still). */
  stopBelow: 1.5,
  /** First bounce when jump is not held, as a share of TRAMPOLINE.firstBounce. */
  gentleFirst: 0.6,
  /** A big fall onto the mat starts higher: this share of airPeak, bounded by `maxFromFall`. */
  fromFallShare: 0.4,
  maxFromFall: 20,
  /**
   * Horizontal speed kept through a bounce (the stick adds air control on top). Lower since the
   * 6.5 m/s walk: a kid who runs on and lets go must not drift off the far side of the mat.
   */
  keepHorizontal: 0.55,
  maxHorizontal: 7,
  /** Minimum seconds between two bounces. */
  cooldown: 0.25,
} as const;

export const PADS = {
  /** Fixed launch apex heights in metres. */
  heights: [3, 6, 10] as readonly number[],
  radius: 1.5,
  top: 0.4,
  /** Distance between neighbouring pads. */
  spacing: 7,
  /** Seconds allowed between two pad launches for them to count as one chain. */
  chainWindow: 4,
  chainForBigAir: 3,
  cooldown: 0.3,
} as const;

export const GEM_FX = {
  nearInterval: 1.5,
  burstSeconds: 0.55,
  maxBursts: 6,
  particles: 8,
  /** Largest per-frame movement treated as continuous travel (not a teleport): speed*dt+slack. */
  maxSpeed: 90,
  slack: 2,
} as const;
