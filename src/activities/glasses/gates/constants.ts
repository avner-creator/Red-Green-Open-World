/** Half-symbol gates: layout (site-local metres; +Z = the approach) and tuning. */
import type { GlassesTier } from '../../../types';

export const GATES = {
  /** Arch centres along X, all on the plane z = archZ. */
  archX: [-3.3, 0, 3.3] as const,
  archZ: -1.2,
  /** Opening half width, outer half width, straight height of the inner sides, depth. */
  innerHalf: 1.0,
  outerHalf: 1.36,
  straight: 1.7,
  depth: 0.5,
  /** Posts reach this far below the arch's ground (slopes). */
  sink: 0.7,
  /** Feet must be below this height above the arch's ground for a crossing to count (jumps count). */
  passHeight: 2.4,
  /** Symbol plaque on top of each arch (edge, centre height). */
  plaque: 1.2,
  plaqueY: 3.72,
  /** The half-symbol sign: high above and behind the middle arch so it is in view from the plate. */
  signZ: -3.9,
  signY: 5.75,
  signPanel: 2.0,
  signFrame: 2.36,
  signLegX: 1.32,
  /** Half-symbol height on the sign at tier 1 (× the tier size). */
  halfSize: 1.62,
  /** Start plate (centre z, radius). */
  plateZ: 3.0,
  plateR: 0.95,
  /** Seconds after an answer before the plate can start a new round. */
  rearm: 0.8,
  /** Celebration lengths (s). */
  squash: 0.9,
  wobble: 0.8,
} as const;

/** Gems per tier. */
export const GATE_GEMS: Readonly<Record<GlassesTier, number>> = { 1: 3, 2: 4, 3: 6 };
