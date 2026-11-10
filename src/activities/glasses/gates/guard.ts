/**
 * Guessing must not pay (pure, shared by the gates and the dot signs). With three choices a
 * child could pick at random and still win one round in three, so:
 *  - after a miss the mechanic takes a friendly nap (a pause that grows with the miss streak),
 *  - hits pay only 1 gem until the player is back on a streak: a hit pays the tier's full gems
 *    only when the two results before it were hits (session start counts as a streak).
 * A player who really sees the answer never misses and always gets the full pay. The tier
 * staircase is separate and unchanged.
 */
export interface Guard {
  /** Hits since the last miss (Infinity at session start). */
  hitsSinceMiss: number;
  /** Misses in a row. */
  missStreak: number;
}

export const freshGuard = (): Guard => ({ hitsSinceMiss: Infinity, missStreak: 0 });

/** Hits in a row needed before a hit pays the full tier gems again. */
export const WARM_STREAK = 2;
/** Gems a "warming up" hit pays. */
export const WARM_GEMS = 1;

/** Gems this hit pays under `g` (before `settle`). */
export const hitPay = (g: Guard, fullGems: number): number => (g.hitsSinceMiss >= WARM_STREAK ? fullGems : Math.min(fullGems, WARM_GEMS));

/** Apply one result: the gems paid (0 for a miss), the nap that follows (s, 0 after a hit) and the new guard. */
export function settle(g: Guard, hit: boolean, fullGems: number, naps: readonly number[]): { gems: number; nap: number; guard: Guard } {
  if (hit) return { gems: hitPay(g, fullGems), nap: 0, guard: { hitsSinceMiss: g.hitsSinceMiss + 1, missStreak: 0 } };
  const streak = g.missStreak + 1;
  return { gems: 0, nap: naps[Math.min(streak, naps.length) - 1] ?? 0, guard: { hitsSinceMiss: 0, missStreak: streak } };
}
