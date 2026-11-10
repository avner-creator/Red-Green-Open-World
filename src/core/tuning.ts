/**
 * Feel/tuning constants private to `src/core`. Shared sizes and speeds live in `src/config.ts`
 * (PLAYER, CAMERA); everything here is "how it feels" and only matters inside core.
 */
export const MOVE = {
  /** m/s² towards the target speed on the ground (snappy, arcade: 0 → sprint in ~0.2 s). */
  groundAccel: 58,
  /** m/s² braking when there is no input (stops quickly but not instantly: ~0.22 s from sprint). */
  groundDecel: 50,
  /** m/s² of steering in the air ("a little air control"). */
  airAccel: 11,
  /** How fast the robot turns to face its movement (1/s, exponential). */
  turnRate: 16,
  /** Forgiveness windows (s). Coyote ≈ 1.3 m past an edge at sprint. */
  coyoteTime: 0.12,
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

/**
 * Locomotion clips: the ground speed (m/s) each clip's feet move at with timeScale 1, so playback
 * scales with the real speed and the feet don't slide. The run clip starts at `runFrom` m/s
 * (the normal stick-forward pace is a jog; the walk clip is for slow analogue steps).
 */
export const ANIM = {
  walkClipSpeed: 3.2,
  runClipSpeed: 7.5,
  runFrom: 4.6,
  walkRate: [0.55, 1.45] as readonly [number, number],
  runRate: [0.7, 1.55] as readonly [number, number],
} as const;

export const CONTROLLER = {
  offset: 0.02,
  maxSlopeDeg: 50,
  slideSlopeDeg: 40,
  stepHeight: 0.45,
  stepMinWidth: 0.15,
  /** Keeps a sprinting robot glued over crests and small bumps (≈ 0.18 m travel per frame). */
  snapDistance: 0.45,
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
  followRate: 16,
  verticalFollowRate: 9,
  /** Extra vertical follow rate per m/s of vertical speed (1/s per m/s). */
  fallFollowGain: 0.6,
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
  /** On foot at full sprint: look this far ahead (×0.1 s of velocity), pull back and widen. */
  sprintLookAhead: 1.1,
  sprintExtraDistance: 0.7,
  sprintExtraFov: 5,
} as const;
