/**
 * Gear Shack prize code (pure): layout in the kiosk's local frame, tuning, the prize choice and the
 * payout of one answer (Phase 1 anti-guess guard + the once-per-session prize).
 */
import type { GlassesTier, ShopItem } from '../../../../types';
import { hitPay, settle } from '../../gates/guard';
import type { Guard } from '../../gates/guard';

/**
 * Layout, metres, in the Gear Shack's local frame (origin on the ground at `ANCHORS.gearShack`,
 * +Z = the counter side, +X = the right side wall, whose outside is free). The board hangs on that
 * wall over its gem roundel; the three gift boxes stand on the paving in front of it, all ≥ 3.5 m
 * from the shop prompt (local (0, 1.2)) and clear of the paint cans at (2.25, 0.35..0.97).
 */
export const SHACK_WEAVE = {
  /** Outside face of the right side wall (wainscot / roundel). */
  wallX: 1.9,
  /** Board centre (along the wall, height), frame edge, dark panel edge, dot picture edge. */
  boardZ: -0.06,
  boardY: 1.72,
  frame: 1.72,
  panel: 1.5,
  picture: 1.38,
  /** Gift boxes: distance from the shack centre, positions along the wall, body edge, lid. */
  boxX: 3.8,
  boxZ: [-1.32, -0.06, 1.2] as const,
  box: 0.6,
  /** Prompt (box top) and where the hero stands to press (in front of each box). */
  promptY: 0.86,
  standX: 4.65,
  reach: 1.25,
  /** Active (attached) inside this radius around the anchor, off beyond `off` (hysteresis). */
  on: 25,
  off: 28,
  /** Seconds from a hit to the next picture; naps after a miss (1st, 2nd, 3rd+ miss in a row). */
  next: 2.5,
  nap: [6, 9, 12] as const,
  open: 1.1,
  wobble: 0.8,
} as const;

/** Dot grid per tier for the 1.38 m picture (coarser than the 2.5 m Phase 1 signs). */
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
