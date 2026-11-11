/** Pip's lost toys tuning (metres, seconds). */
import type { GlassesTier } from '../../../types';

export const TRAIL = {
  /** Prints per trail (the trail is 25–40 m long). */
  minPrints: 12,
  maxPrints: 16,
  minLength: 25,
  maxLength: 40,
  /** Print spacing per tier (wider = harder to follow). */
  spacing: { 1: 2.1, 2: 2.45, 3: 2.8 } as Record<GlassesTier, number>,
  /** Print size (metres) before the tier size. */
  printSize: 1.0,
  /** Alternating left/right offset of the prints from the path. */
  sideOffset: 0.14,
  /** Candidate directions around the basket (≥ 4 of them inside the start band). */
  directions: 16,
  /** The first print's direction, off the child's view line from the basket (radians, either side). */
  startOff: [0.4, 1.75] as readonly [number, number],
  /** Path shape tries per direction. */
  variants: 3,
  /** The trail starts this far from the basket's centre. */
  startOffset: 1.4,
  /** Path sampling step for the validity checks. */
  sampleStep: 0.5,
  /** Ground rules for every sample. */
  roadClear: 2,
  anchorMargin: 0.8,
  minAboveWater: 0.4,
  /** Max rise per metre between samples (walkable). */
  maxGrade: 0.5,
  /** The hidden spot is this far beside the last print (left or right of the path). */
  endBeside: 1.8,
  /** Prints that glow ahead of the player: nearest bright, farther fainter. */
  glow: [1, 0.75, 0.5, 0.3] as readonly number[],
  /** Reaching a print (XZ distance); the last print needs `reachLast`. */
  reach: 2.0,
  reachLast: 1.5,
  /** Upright paw glyph floating over each print that is next (reads at grazing angles). */
  markerHeight: 1.2,
  markerBob: 0.1,
  markerSize: 0.8,
  /** Open sky over the hidden spot: no trunk or wall within this radius at trunk height. */
  skyClear: 4,
  /** A passed print fades out over this long. */
  passFade: 0.7,
} as const;

export const TOYS = {
  /** Toys per session (one per trail; tier = toy number). */
  perSession: 3,
  /** Gems per tier. */
  gems: { 1: 5, 2: 7, 3: 10 } as Record<GlassesTier, number>,
  /** A trail times out this long after the player first reaches its first print. */
  timeout: 75,
  /** Found-toy show (seconds from the find): pops out of the ground, launches up with a spin,
   * holds at the top, then arcs into the basket. */
  popSeconds: 0.35,
  launchSeconds: 0.6,
  holdSeconds: 0.6,
  flightSeconds: 1.4,
  /** Launch height above the ground and the toy's size multiplier during the show. */
  launchHeight: 2.8,
  showScale: 2,
  /** Pause after a find before the next trail starts (from the find). */
  nextAfterFind: 4.5,
  /** Pause after a time-out before the new trail starts. */
  nextAfterMiss: 2,
  /** Celebration length after the last toy. */
  celebrateSeconds: 2.4,
  /** Toy size (metres, roughly its diameter). */
  size: 0.42,
} as const;
