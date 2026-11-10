/** Half-symbol gates: layout (site-local metres; +Z = the approach) and tuning. */
import type { GlassesTier } from '../../../types';

export const GATES = {
  /** Arch centres along X, all on the plane z = archZ. */
  archX: [-3.1, 0, 3.1] as const,
  archZ: -2.6,
  /** Opening half width, outer half width, straight height of the inner sides, depth. */
  innerHalf: 0.95,
  outerHalf: 1.3,
  straight: 1.5,
  depth: 0.5,
  /** Posts reach this far below the arch's ground (slopes). */
  sink: 0.7,
  /** Feet must be below this height above the arch's ground for a crossing to count (jumps count). */
  passHeight: 2.2,
  /** Symbol plaque on top of each arch (edge, centre height). */
  plaque: 1.2,
  plaqueY: 3.48,
  /** The half-symbol sign: a lectern between the plate and the arches, facing the plate. */
  signZ: 0.1,
  signY: 1.95,
  signTilt: 0.15,
  signPanel: 1.7,
  signFrame: 1.96,
  /** Half-symbol height on the sign at tier 1 (× the tier size). */
  halfSize: 1.4,
  /** Start plate (centre z, radius). */
  plateZ: 2.0,
  plateR: 0.95,
  /** Seconds after an answer before the plate can start a new round. */
  rearm: 0.8,
  /** Celebration lengths (s). */
  squash: 0.9,
  wobble: 0.8,
} as const;

/** Gems per tier. */
export const GATE_GEMS: Readonly<Record<GlassesTier, number>> = { 1: 3, 2: 4, 3: 6 };
