/** Dot-picture signs: layout (site-local metres; +Z = the approach) and tuning. */
import type { GlassesTier } from '../../../types';

export const DOTSIGNS = {
  /** The sign: centre z, picture centre height above its ground, picture / panel / frame edges. */
  signZ: -2.3,
  signY: 2.6,
  picture: 2.5,
  panel: 2.72,
  frame: 3.04,
  legX: 1.36,
  /** The pedestal in front: centre z, width, height, depth. */
  pedZ: 1.0,
  pedW: 4.3,
  pedH: 0.82,
  pedD: 0.86,
  /** Button centres along X, radius, tilt towards the player (radians). */
  buttonX: [-1.38, 0, 1.38] as const,
  buttonR: 0.44,
  tilt: 0.55,
  /** E prompt radius around each button. */
  reach: 1.25,
  /** Seconds from an answer to the next picture. */
  next: 2.1,
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

/** Gems per tier. */
export const DOT_GEMS: Readonly<Record<GlassesTier, number>> = { 1: 3, 2: 5, 3: 8 };
