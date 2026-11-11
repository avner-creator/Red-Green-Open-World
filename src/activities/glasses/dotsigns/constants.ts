/** Dot-picture signs: layout (site-local metres; +Z = the approach) and tuning. */
import type { GlassesTier } from '../../../types';
import type { BoothSpec, PrizeTable, RoundRules } from '../booth/types';

export const DOTSIGNS = {
  /** The sign: centre z, picture centre height above the HERO's ground (the default camera from
   *  the pedestal sees the whole picture above the hero's head between ≈1.4 m and ≈4.4 m), picture
   *  / panel edges, frame width and height, leg spacing. */
  signZ: 0.22,
  signY: 2.62,
  picture: 2.5,
  panel: 2.62,
  frameW: 3.4,
  frameH: 2.8,
  legX: 1.5,
  /** The pedestal right in front of it: centre z, width, height, depth. */
  pedZ: 0.92,
  pedW: 5.0,
  pedH: 0.8,
  pedD: 0.62,
  /** Button centres along X (wide, so they show left and right of the hero), radius, tilt. */
  buttonX: [-1.75, 0, 1.75] as const,
  buttonR: 0.44,
  tilt: 0.55,
  /** Where the hero stands to press (in front of the pedestal). */
  heroZ: 0.92 + 0.31 + 0.45,
  /** E prompt radius around each button. */
  reach: 1.25,
  /** Start pad (a press pad: stand on it and press Use), a step behind the buttons. */
  pad: { x: 0, z: 3.05, r: 0.85 },
  flourish: 1.0,
  press: 0.6,
  wobble: 0.8,
} as const;

/** Dot grid per tier (more cells and smaller dots = finer). Floor: 28 cells still resolves at 640×360 from the pedestal. */
export const DOT_TIERS: Readonly<Record<GlassesTier, { cells: number; dotScale: number }>> = {
  1: { cells: 20, dotScale: 0.86 },
  2: { cells: 24, dotScale: 0.78 },
  3: { cells: 28, dotScale: 0.7 },
};

/**
 * Prize by hits out of 5 (tier 1, 2, 3): nothing below 3 right, 5 of 5 is the jackpot; finer
 * pictures pay more. Tuned with `booth/sim.ts` (tests/activities/glasses-dotsigns.test.ts): a
 * random-guess bot ≤ 6 gems a minute at every tier, a child who sees the shape ≥ 25 at tier 1.
 */
export const DOT_PRIZE: PrizeTable = {
  1: [0, 0, 0, 4, 6, 12],
  2: [0, 0, 0, 4, 7, 14],
  3: [0, 0, 0, 5, 8, 16],
};

/** 5 pictures a round, one straight after the other; finer after 4 or 5 right, coarser after 2 or fewer. */
export const DOT_RULES: RoundRules = {
  tries: 5,
  minHits: 3,
  prize: DOT_PRIZE,
  between: 'next',
  beat: 1.3,
  upAt: 4,
  downBelow: 3,
};

/**
 * The booth behind-left of the sign, turned to the play spot's camera and the approach; the press
 * pad a step behind the buttons. Heights are relative to the site's y (index.ts lifts them).
 */
export const DOT_BOOTH: BoothSpec = {
  marquee: { x: -4.0, z: -1.2, yaw: 0.5 },
  lamps: 5,
  pad: { x: DOTSIGNS.pad.x, z: DOTSIGNS.pad.z, r: DOTSIGNS.pad.r, walkIn: false },
  playPrompt: 'look',
  // 3-2-1-GO pops in front of the (still empty) dot sign.
  countdown: { x: 0, y: DOTSIGNS.signY, z: DOTSIGNS.signZ + 0.6 },
  decals: [
    // Chevrons from the pad to the two outer buttons.
    { kind: 'chevron', x: -1.05, z: 2.25, size: 0.7, yaw: 0.75 },
    { kind: 'chevron', x: 1.05, z: 2.25, size: 0.7, yaw: -0.75 },
  ],
};
