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

/** Giant trampoline rules. */
export const BOUNCE = {
  /** Walking onto the mat is already a proper bounce: apex in metres. */
  firstBounce: 12,
  /** Holding jump multiplies the apex each bounce. */
  growth: 1.5,
  /** ~150 ft. */
  maxHeight: 45,
  /** Without jump each bounce keeps this share of the last apex (kids can get off). */
  releaseDecay: 0.62,
  /** Below this apex a released bounce just stops. */
  stopBelow: 1.5,
  /** A big fall onto the mat starts higher: this share of the fall, bounded by `maxFromFall`. */
  fromFallShare: 0.4,
  maxFromFall: 30,
  /**
   * Horizontal speed kept through a bounce, and its cap. Low since the 6.5 / 11 m/s walk/sprint:
   * a kid who runs on and lets go must not drift off the far side (recentre pulls back too).
   */
  keepHorizontal: 0.5,
  maxHorizontal: 7,
  /** Bounces at or below this apex let the move keys walk you across the mat. */
  walkOffApex: 5,
  walkSpeed: 5,
  /** Share of the distance to the mat centre closed per arc (keeps big bounces on the mat). */
  recentre: 0.7,
  /** Beyond this distance from the centre (m) the recentre pull starts. */
  recentreFrom: 1.5,
} as const;

/** Stunt thresholds (apex above the mat, metres) for 1 / 2 / 3 stars. */
export const BOUNCE_STARS = [15, 30, 45] as const;

export const PADS = {
  /** Fixed launch apex heights in metres. */
  heights: [8, 15, 25] as readonly number[],
  radius: 1.6,
  top: 0.4,
  /** Distance between neighbouring pads. */
  spacing: 9,
  /** Seconds allowed between two pad launches for them to count as one chain. */
  chainWindow: 6,
  chainForBigAir: 3,
  cooldown: 0.3,
  /** Largest skill boost on a pad launch (a ground-pound counts as a super-bounce here). */
  maxBoost: 1.25,
} as const;

/** Rocket pads and the landing net. */
export const ROCKET = {
  count: 3,
  /** Pads sit this far apart along the anchor's local X. */
  spacing: 5,
  padRadius: 1.9,
  padTop: 0.7,
  /** Wind-up squash before the launch (s). */
  windup: 0.6,
  /** Net distance search (m) from the pad centre; preferred distances first. */
  distances: [60, 55, 50, 65, 45] as readonly number[],
  /** Fallback distances when no flat landing exists in range. */
  shortDistances: [40, 35, 30, 25, 20] as readonly number[],
  /** Yaw offsets tried (radians) around the anchor yaw. */
  yawOffsets: [0, 0.1, -0.1, 0.2, -0.2, 0.35, -0.35, 0.5, -0.5, 0.7, -0.7] as readonly number[],
  /** Apex above the launch point: base + share of distance (a high arc). */
  apexBase: 14,
  apexPerMetre: 0.28,
  /** Double bounce on the net: apexes of the two soft bounces. */
  netBounces: [6, 2.4] as readonly number[],
  /** Seconds the locked wobble lasts. */
  wobble: 0.7,
  cooldown: 1.5,
} as const;

export const NET = {
  radius: 6.5,
  /** Height of the inflated top above the ground at the centre. */
  height: 1.3,
  /** Landing within this distance of the centre counts as a bullseye. */
  bullseye: 2,
  /** Flat-land check: sample radius and the largest allowed height spread. */
  siteRadius: 8,
  maxSpread: 1.4,
  /** Keep this clear of other anchors (their radius is added). */
  anchorClearance: 2,
} as const;

/** Air tricks. */
export const TRICK = {
  /** Air time needed before the move keys start spinning you. */
  minAir: 0.6,
  flipRate: 10,
  spinRate: 9,
  /** 1/s response of the spin speed towards the key. */
  response: 9,
  /** Seconds before landing when idle keys level you out. */
  restoreWindow: 0.55,
  idleInput: 0.25,
  /** A rotation counts this many radians early (the levelling finishes it). */
  countSlop: 0.5,
  /** Landing within this many radians (60 degrees) of upright is a clean landing; further is a flop. */
  uprightTolerance: Math.PI / 3,
  /** In the last seconds before landing a near-upright body is levelled even with keys held. */
  levelWindow: 0.3,
  /** A key below this (per axis) counts as released; it arms that axis for tricks. */
  releaseBelow: 0.25,
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
