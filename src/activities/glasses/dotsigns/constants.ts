/** Dot-picture signs: layout (site-local metres; +Z = the approach) and tuning. */
import type { GlassesTier } from '../../../types';

export const DOTSIGNS = {
  /** The sign: centre z, picture centre height above the HERO's ground (the default camera from
   *  the pedestal sees the whole picture above the hero's head between ≈1.4 m and ≈4.4 m), picture
   *  / panel edges, frame width and height, leg spacing. */
  signZ: 0.22,
  signY: 2.75,
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
