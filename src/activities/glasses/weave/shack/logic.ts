/**
 * Gear Shack prize code (pure): layout in the kiosk's local frame, tuning, the prize choice and the
 * payout of one answer (Phase 1 anti-guess guard + the once-per-session prize).
 */
import type { GlassesTier, ShopItem } from '../../../../types';
import { hitPay, settle } from '../../gates/guard';
import type { Guard } from '../../gates/guard';

/**
 * Layout, metres, in a frame turned half round from the Gear Shack's own (origin on the ground at
 * `ANCHORS.gearShack`, yaw = the shack's yaw + π): here +X is the shack's LEFT side wall, which
 * faces the south-east part of the plaza (the approach from the village street and the park road)
 * and is never behind the plaza fingerpost; -Z is the counter side. The board stands on two legs
 * against that wall (taller than it: a billboard beside the kiosk), next to the toy rocket (shack-local (-2.05, 0.45) = here (2.05, -0.45)), and
 * runs past the back corner; the three gift boxes stand on the paving in front of it, all ≥ 3.5 m
 * from the shop prompt (here (0, -1.2)) and clear of the plaza bench at about (4.5, 0) (probed).
 */
export const SHACK_WEAVE = {
  /** Turn of this frame from the shack's own frame (π = the left side wall). */
  turn: Math.PI,
  /** Outside face of the side wall. */
  wallX: 1.92,
  /** Board centre (along the wall, height), frame edge, dark panel edge, dot picture edge. */
  boardZ: 1.5,
  boardY: 2.15,
  frame: 2.3,
  panel: 2.1,
  picture: 1.98,
  /**
   * Gift boxes: distance from the shack centre, positions along the wall, body edge. The walkway
   * between the board and the boxes is 1.1 m (wider than the hero: QA6 M2, a 0.69 m slot trapped
   * heroes and the camera there).
   */
  boxX: 3.6,
  boxZ: [0.6, 1.5, 2.4] as const,
  box: 0.66,
  /** Prompt (box top) and where the hero stands to press (in front of each box). */
  promptY: 0.9,
  standX: 4.5,
  reach: 1.25,
  /** The play spot (hero, default camera) in front of the middle box, and the approach distance. */
  viewX: 5.65,
  approach: 14,
  /** Active (attached) inside this radius around the anchor, off beyond `off` (hysteresis). */
  on: 25,
  off: 28,
  /** Seconds from a hit to the next picture; naps after a miss (1st, 2nd, 3rd+ miss in a row). */
  next: 2.5,
  nap: [6, 9, 12] as const,
  open: 1.1,
  wobble: 0.8,
} as const;

/** Dot grid per tier for the 1.98 m picture (coarser than the 2.5 m Phase 1 signs). */
export const SHACK_DOTS: Readonly<Record<GlassesTier, { cells: number; dotScale: number }>> = {
  1: { cells: 14, dotScale: 0.86 },
  2: { cells: 16, dotScale: 0.8 },
  3: { cells: 20, dotScale: 0.72 },
};

/** Gems for a full-pay win per tier, and the prize when every for-sale item is already owned. */
export const SHACK_GEMS: Readonly<Record<GlassesTier, number>> = { 1: 3, 2: 5, 3: 8 };
export const PRIZE_FALLBACK_GEMS = 10;

/** The cheapest item for sale that the child does not own (not chest-only, not a character, not free). Ties: catalog order. */
export function pickPrize(catalog: readonly ShopItem[], owns: (id: string) => boolean): ShopItem | null {
  let best: ShopItem | null = null;
  for (const it of catalog) {
    if (it.chestOnly || it.category === 'character' || !(it.price > 0) || owns(it.id)) continue;
    if (!best || it.price < best.price) best = it;
  }
  return best;
}

export interface ShackState {
  guard: Guard;
  /** The once-per-session prize was given. */
  prizeGiven: boolean;
}

export interface Payout {
  /** Gems to pay now (0 on a miss or when an item is given). */
  gems: number;
  /** This answer wins the session prize (item, or the gem fallback already counted in `gems`). */
  prize: boolean;
  /** Seconds before the next picture. */
  wait: number;
  state: ShackState;
}

/**
 * One answer. The session prize goes to the first win that pays full (the guard is warm: no miss
 * yet, or two right in a row since the last one), so guessing it takes luck: 1/3 on the very first
 * try, 1/27 per three presses after a miss. `hasItem` = there is an item to give.
 */
export function payout(s: ShackState, hit: boolean, tier: GlassesTier, hasItem: boolean): Payout {
  const full = SHACK_GEMS[tier];
  const warm = hitPay(s.guard, full) === full;
  const r = settle(s.guard, hit, full, SHACK_WEAVE.nap);
  if (hit && warm && !s.prizeGiven) {
    return { gems: hasItem ? 0 : PRIZE_FALLBACK_GEMS, prize: true, wait: SHACK_WEAVE.next, state: { guard: r.guard, prizeGiven: true } };
  }
  return { gems: r.gems, prize: false, wait: hit ? SHACK_WEAVE.next : r.nap, state: { guard: r.guard, prizeGiven: s.prizeGiven } };
}
