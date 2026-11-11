/** Pip's lost toys tuning (metres, seconds) and its booth (site-local: +Z = the approach, +X = right). */
import type { GlassesTier } from '../../../types';
import type { BoothSpec, PrizeTable, RoundRules } from '../booth/types';

/**
 * Where things stand (site-local metres). From the pad the child sees the booth front-left with
 * Pip's basket in front of its counter (left of the hero, never hidden behind them) and the bowl
 * beside it; the trail starts at the pad and leads off to the right / ahead, the open side.
 */
export const SPOT = {
  pad: { x: 0.8, z: 2.6, r: 0.95 },
  /** Pip's basket (centre of its foot) and the dog bowl beside it. */
  basket: { x: -0.9, z: 1.0 },
  bowl: { x: -2.35, z: 2.0 },
  /** Keep-clear circles for the trail (around the basket, the bowl and the marquee). */
  basketClear: 1.4,
  bowlClear: 0.6,
  marqueeClear: 2.1,
} as const;

/** Basket measurements (basket-local metres, origin at its foot centre, +Z = the approach). */
export const BASKET = {
  /** Oval bed: half width (x) and half depth (z) at the rim. */
  rx: 1.0,
  rz: 0.78,
  /** Wall height at the back and at the low front opening. */
  back: 0.72,
  front: 0.42,
  /** Cushion top height. */
  cushion: 0.3,
  /** Rest spots of the three toys (toy centres), left to right; the 4th is the free-play pile top. */
  slots: [
    [-0.5, 0.6, 0.06],
    [0.02, 0.62, -0.12],
    [0.52, 0.6, 0.06],
    [0.02, 1.08, -0.04],
  ] as readonly (readonly [number, number, number])[],
} as const;

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
  /** Candidate directions around the start (≥ 4 of them inside the start band). */
  directions: 16,
  /** The first print's direction, off the child's view line from the pad (radians, either side). */
  startOff: [0.4, 1.75] as readonly [number, number],
  /** Path shape tries per direction. */
  variants: 4,
  /** The trail starts this far from the pad's centre (just past its rim). */
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
  /** Toys per session (one per round and trail; tier = toy number). */
  perSession: 3,
  /** Gems per tier (toy 1, 2, 3). */
  gems: { 1: 5, 2: 7, 3: 10 } as Record<GlassesTier, number>,
  /** Extra gems with the third toy (the basket is full). */
  fullBonus: 10,
  /** A free-play trail after the three toys pays this (the booth never dead-ends). */
  freePlayGems: 2,
  /** A trail times out this long after GO (a miss; the next round is a new trail for the same toy). */
  timeout: 75,
  /** Found-toy show (seconds from the find): pops out of the ground, launches up with a spin,
   * holds at the top, then arcs into the basket. */
  popSeconds: 0.35,
  launchSeconds: 0.6,
  holdSeconds: 0.6,
  flightSeconds: 1.4,
  /** Squash on landing in the basket. */
  settleSeconds: 0.35,
  /** Launch height above the ground and the toy's size multiplier during the show. */
  launchHeight: 2.8,
  showScale: 2,
  /** The ✓ pops this high above the hidden spot (over the launching toy). */
  checkHeight: 4.6,
  /** Celebration (basket hop) after the third toy lands. */
  celebrateSeconds: 2.4,
  /** Toy size (metres, roughly its diameter). */
  size: 0.42,
} as const;

/** Seconds from the find until the toy lands in the basket. */
export const LAND_AT = TOYS.popSeconds + TOYS.launchSeconds + TOYS.holdSeconds + TOYS.flightSeconds;

/** Gems for a found toy: toy n (0-based) of the session, or a free-play trail after all three. */
export function toyPrize(toy: number, free: boolean): number {
  if (free) return TOYS.freePlayGems;
  const tier = Math.min(3, Math.max(1, toy + 1)) as GlassesTier;
  return TOYS.gems[tier] + (toy === TOYS.perSession - 1 ? TOYS.fullBonus : 0);
}

/**
 * The kit's prize table for a one-try round (`[miss, hit]`). The value of a hit depends on WHICH
 * toy the child just found (5 / 7 / 10 + the full-basket bonus, 2 in free play), so the table reads
 * it live from the game: `prizeNow()` is the prize of the toy found in the round that is ending.
 */
export function livePrize(prizeNow: () => number): PrizeTable {
  const row = (): readonly number[] => [0, prizeNow()];
  return {
    get 1() {
      return row();
    },
    get 2() {
      return row();
    },
    get 3() {
      return row();
    },
  };
}

/**
 * One round = one trail = one toy: press the pad → 3-2-1-GO → follow the trail. Found → ✓, the
 * toy flies into the basket, then its prize. Time-out → ✗. The booth's three lamps are the
 * session's three toys (the game drives them, not the round's single try).
 */
export function toyRules(prize: PrizeTable): RoundRules {
  return {
    tries: 1,
    minHits: 1,
    prize,
    between: 'next',
    beat: 1.0,
    // The round's tier is the toy number: up after a find, never down after a time-out.
    upAt: 1,
    downBelow: 0,
    // The trail times out first (75 s); the stall cancel is only a safety net.
    stall: TOYS.timeout + 45,
    // Trails reach up to ~46 m from the site centre: only walking well past that cancels.
    leaveRadius: 55,
  };
}

/** The booth: marquee front-left of the pad, turned to face it, the basket before its counter; a press pad. */
export const TOY_BOOTH: BoothSpec = {
  marquee: { x: -3.0, z: -0.9, yaw: 0.83 },
  lamps: TOYS.perSession,
  pad: { x: SPOT.pad.x, z: SPOT.pad.z, r: SPOT.pad.r, walkIn: false },
  playPrompt: 'follow',
  decals: [
    // Two chevrons on the approach lead to the pad.
    { kind: 'chevron', x: SPOT.pad.x, z: SPOT.pad.z + 1.9, size: 0.95, yaw: 0 },
    { kind: 'chevron', x: SPOT.pad.x, z: SPOT.pad.z + 3.0, size: 0.95, yaw: 0 },
  ],
};
