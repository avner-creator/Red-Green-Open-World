/**
 * Feel/tuning constants private to `src/core`. Shared sizes and speeds live in `src/config.ts`
 * (PLAYER, CAMERA); everything here is "how it feels" and only matters inside core.
 */
export const MOVE = {
  /** m/s² towards the target speed on the ground (snappy, arcade). */
  groundAccel: 45,
  /** m/s² braking when there is no input (stops quickly but not instantly). */
  groundDecel: 38,
  /** m/s² of steering in the air ("a little air control"). */
  airAccel: 9,
  /** How fast the robot turns to face its movement (1/s, exponential). */
  turnRate: 14,
  /** Forgiveness windows (s). */
  coyoteTime: 0.15,
  jumpBuffer: 0.15,
  /** Releasing jump early while rising cuts the upward speed (variable jump height). */
  jumpCutFactor: 0.55,
  /** Terminal fall speed (m/s); only for falling, never applied upwards. */
  maxFallSpeed: 55,
  /** Landing faster than this (not after a launch) → comic flop. ≈ a 7 m drop. */
  flopLandingSpeed: 18,
  flopDuration: 1.2,
  /** Deep water: respawn when the water here is deeper than this (m). */
  deepWater: 1.2,
  /** Falling below this y always respawns. */
  killY: -30,
} as const;

export const CONTROLLER = {
  offset: 0.02,
  maxSlopeDeg: 50,
  slideSlopeDeg: 40,
  stepHeight: 0.45,
  stepMinWidth: 0.15,
  snapDistance: 0.35,
  /** Gentle pushes on dynamic bodies (balls, crates). */
  characterMass: 40,
} as const;

export const LOOK = {
  /** Radians per pixel of mouse movement. */
  mouseSensitivity: 0.0026,
  /** Radians per second at full right-stick deflection. */
  stickYawRate: 3.2,
  stickPitchRate: 2.2,
  /** Radial dead zones. */
  moveDeadZone: 0.18,
  lookDeadZone: 0.15,
  triggerThreshold: 0.4,
} as const;

export const CAM = {
  minPitch: -0.35,
  maxPitch: 1.15,
  /** Height of the orbit pivot above the feet. */
  pivotHeight: 1.45,
  followRate: 14,
  verticalFollowRate: 9,
  /** Max lag of the smoothed pivot behind the player (m). */
  maxLag: 2.5,
  collisionMargin: 0.3,
  minDistance: 0.9,
  /** How fast the camera eases back out after a collision pulled it in (1/s). */
  easeOutRate: 3,
  titleOrbitRate: 0.12,
  /** Seconds without look input before the camera gently swings behind a moving player. */
  autoAlignDelay: 1.2,
  autoAlignRate: 1.1,
} as const;
