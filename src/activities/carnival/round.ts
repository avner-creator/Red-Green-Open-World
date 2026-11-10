/** Round results: ranking, stars, prizes, tickets (pure; unit-tested). */

/** Prize ticket after the first free play of a booth per session. */
export const TICKET_PRICE = 3;

export interface RoundResult {
  /** 1 = first place. Ties go to the player (the child always wins a draw). */
  place: number;
  stars: number;
  gems: number;
  won: boolean;
}

/** Stars for a score: at least 1 for playing, then thresholds [2★, 3★]. */
export function starsFor(score: number, thresholds: readonly [number, number]): number {
  if (score >= thresholds[1]) return 3;
  if (score >= thresholds[0]) return 2;
  return 1;
}

/** Player's place among everyone (ties favour the player). */
export function placeOf(player: number, friends: readonly number[]): number {
  return 1 + friends.filter((f) => f > player).length;
}

/** Gems paid for a round: one per star, +2 for first place. */
export function prizeGems(stars: number, won: boolean): number {
  return stars + (won ? 2 : 0);
}

export function resultOf(player: number, friends: readonly number[], thresholds: readonly [number, number]): RoundResult {
  const place = placeOf(player, friends);
  const stars = starsFor(player, thresholds);
  const won = place === 1;
  return { place, stars, gems: prizeGems(stars, won), won };
}

export type TicketOutcome = 'free' | 'paid' | 'short';

/** Minimal view of the economy profile (Stream C). Every member is optional: code defensively. */
export interface ProfileLike {
  earn?(n: number, reason: string): unknown;
  spend?(n: number, reason?: string): unknown;
  readonly gems?: number;
  readonly wallet?: number;
  canAfford?(n: number): boolean;
}

/**
 * First play of each booth per session is free; after that a ticket. Without an economy, always
 * free. `spend` returning anything but `false` counts as paid.
 */
export function payTicket(freeUsed: Set<string>, game: string, profile: ProfileLike | null, price = TICKET_PRICE): TicketOutcome {
  if (!freeUsed.has(game) || !profile || typeof profile.spend !== 'function') {
    freeUsed.add(game);
    return 'free';
  }
  if (profile.canAfford && !profile.canAfford(price)) return 'short';
  const ok = profile.spend(price, 'carnival');
  return ok === false ? 'short' : 'paid';
}

/** Gems the player has, if the profile tells us. */
export function walletOf(profile: ProfileLike | null): number | null {
  if (!profile) return null;
  if (typeof profile.gems === 'number') return profile.gems;
  if (typeof profile.wallet === 'number') return profile.wallet;
  return null;
}
