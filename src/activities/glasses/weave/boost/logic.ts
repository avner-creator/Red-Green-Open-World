/**
 * Pure maths for the buggy-race glasses part (`./index.ts`): the "turbo tap". No three, no DOM;
 * unit-tested.
 *
 * A weak-eye countdown ring stands over the next boost pad and closes as the buggy nears it; it
 * meets its target ring at the tap zone. The child taps the turbo button (Emote) as the buggy
 * reaches the pad. Only a press is ever judged:
 *  - in the tier's tap zone (and on the pad sideways) = hit;
 *  - inside the pad's press window but outside the zone = miss (aimed at the pad, mistimed);
 *  - anywhere else, or a second press at the same pad = nothing. A pad crossed without a press
 *    = nothing.
 *
 * Distances are `along` = buggy centre minus pad centre along the pad's travel direction
 * (negative = before the pad). The race counts a pad (whoosh + boost) once `along ≥ −padHalf.along`
 * (−2.2 m). The zone sits round that edge and ends ≤ 1.2 m past it, so a child cannot hear the
 * race's whoosh and react in time: the timing must come from the weak-eye ring.
 */
import type { GlassesTier } from '../../../../types';

export const BOOST = {
  /** Centre of the tap zone (along, metres): just before the race's own trigger edge (−2.2). */
  zoneCentre: -3,
  /** Half-length of the tap zone by tier (metres): 4 m, 2.6 m, 1.5 m long. */
  zoneHalf: { 1: 2, 2: 1.3, 3: 0.75 } as Readonly<Record<GlassesTier, number>>,
  /** Sideways (|across|) a hit must be within: the pad's half-width (1.9) + a little. */
  across: 2.5,
  /**
   * Press window (along, metres): a press from 32 m before to 10 m past a pad is aimed at it
   * (hit or miss); outside every window it is ignored. The long run-up keeps the best blind
   * tapping rhythm below 15 % (see `bestBlindRate`).
   */
  windowBefore: 32,
  windowAfter: 10,
  /** Ring: shows from this far (metres to the zone centre), fading in over `fadeIn`. */
  showFrom: 62,
  fadeIn: 6,
  /** The ring closes over this distance (metres) before the zone centre. */
  span: 60,
  /** Ring look (metres): target ring radius, closing ring start, line width, centre height. */
  ringRadius: 2.8,
  ringStart: 8.5,
  ringThickness: 0.75,
  ringHeight: 5.2,
  /** Closing ring meets its target at this t (toolkit default). */
  perfectAt: 0.8,
  /** Gems for a turbo pad by tier. */
  pay: { 1: 1, 2: 2, 3: 3 } as Readonly<Record<GlassesTier, number>>,
  /** Hits in a row that raise the tier. */
  hitsToRise: 2,
  /** Weak-eye flash after a turbo pad, seconds. */
  flashSeconds: 0.75,
} as const;

/** Signed lap distance from `from` to `to` on a loop of length `L`, in [−L/2, L/2). */
export function lapDelta(from: number, to: number, L: number): number {
  if (!(L > 0)) return to - from;
  const d = (((to - from) % L) + L) % L;
  return d >= L / 2 ? d - L : d;
}

export type Outcome = 'hit' | 'miss' | null;

/** Is `along` inside the pad's press window? */
export function inWindow(along: number): boolean {
  return along >= -BOOST.windowBefore && along <= BOOST.windowAfter;
}

/** Is `along` in the tier's tap zone? */
export function inZone(along: number, tier: GlassesTier): boolean {
  return Math.abs(along - BOOST.zoneCentre) <= BOOST.zoneHalf[tier];
}

/** A press at (`along`, `across`) relative to the pad it is aimed at. */
export function classifyPress(along: number, across: number, tier: GlassesTier): Outcome {
  if (!inWindow(along)) return null;
  return inZone(along, tier) && Math.abs(across) <= BOOST.across ? 'hit' : 'miss';
}

/**
 * Which pad a press is aimed at: of the pads whose press window holds it, the one whose zone is
 * nearest. `alongs[i]` = buggy minus pad i along the lap. −1 if none.
 */
export function assignPad(alongs: readonly number[]): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < alongs.length; i++) {
    const a = alongs[i];
    if (!inWindow(a)) continue;
    const d = Math.abs(a - BOOST.zoneCentre);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Pass number of the buggy at pad `s` (changes once per lap, half a lap away from the pad). */
export function passKey(progress: number, s: number, L: number): number {
  return Math.floor((progress - s + L / 2) / L);
}

/**
 * One judged press per pad per pass. `press(progress)` returns the pad index and the outcome
 * (null = not judged). `alongAt(i)` may refine the along/across for the assigned pad (the game
 * uses the buggy's real position); by default along = lap distance, across = 0.
 */
export class TapJudge {
  private judged: number[];
  constructor(
    private readonly padS: readonly number[],
    private readonly L: number,
  ) {
    this.judged = padS.map(() => Number.NEGATIVE_INFINITY);
  }
  reset(): void {
    this.judged.fill(Number.NEGATIVE_INFINITY);
  }
  /** Has pad `i` been judged on the buggy's current pass? */
  isJudged(i: number, progress: number): boolean {
    return this.judged[i] === passKey(progress, this.padS[i], this.L);
  }
  press(progress: number, tier: GlassesTier, at?: (i: number) => { along: number; across: number }): { pad: number; outcome: Outcome; along: number } {
    const alongs = this.padS.map((s) => lapDelta(s, progress, this.L));
    const i = assignPad(alongs);
    if (i < 0) return { pad: -1, outcome: null, along: NaN };
    const key = passKey(progress, this.padS[i], this.L);
    const pos = at ? at(i) : { along: alongs[i], across: 0 };
    if (this.judged[i] === key) return { pad: i, outcome: null, along: pos.along };
    this.judged[i] = key;
    return { pad: i, outcome: classifyPress(pos.along, pos.across, tier), along: pos.along };
  }
}

/**
 * The pad the ring stands on: the nearest one ahead that is not yet judged on this pass and whose
 * zone the buggy has not passed by more than `windowAfter`. `toZone` = metres to its zone centre.
 */
export function ringPad(padS: readonly number[], progress: number, L: number, judged: (i: number) => boolean): { index: number; toZone: number } {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < padS.length; i++) {
    const d = lapDelta(progress, padS[i] + BOOST.zoneCentre, L);
    if (d < -BOOST.windowAfter || judged(i)) continue;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { index: best, toZone: best < 0 ? Infinity : bestD };
}

/** Closing-ring position 0..1 for `toZone` metres before the zone centre (perfectAt at 0). */
export function ringT(toZone: number): number {
  const t = (1 - toZone / BOOST.span) * BOOST.perfectAt;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Half the tap zone in ring-t units (the target ring flares inside it). */
export function zoneHalfT(tier: GlassesTier): number {
  return (BOOST.zoneHalf[tier] / BOOST.span) * BOOST.perfectAt;
}

/** Ring visibility 0..1 at `toZone` metres. */
export function showFade(toZone: number): number {
  if (toZone > BOOST.showFrom) return 0;
  const k = (BOOST.showFrom - toZone) / BOOST.fadeIn;
  return k >= 1 ? 1 : k <= 0 ? 0 : k * k * (3 - 2 * k);
}

/**
 * Upper bound of the hit rate per judged press for a child who cannot see the pads or the ring
 * and taps in a fixed rhythm (the best one): the first press inside a pad's window is the judged
 * one, so the best rhythm puts it at the end of the zone: zone length / (window start → zone end).
 */
export function bestBlindRate(tier: GlassesTier): number {
  const zoneEnd = BOOST.windowBefore + BOOST.zoneCentre + BOOST.zoneHalf[tier];
  return (2 * BOOST.zoneHalf[tier]) / zoneEnd;
}

/** Per-session staircase: up after `hitsToRise` hits in a row, down after a miss. */
export function stepTier(tier: GlassesTier, streak: number, hit: boolean): { tier: GlassesTier; streak: number } {
  if (!hit) return { tier: tier <= 1 ? 1 : ((tier - 1) as GlassesTier), streak: 0 };
  const s = streak + 1;
  if (s >= BOOST.hitsToRise) return { tier: tier >= 3 ? 3 : ((tier + 1) as GlassesTier), streak: 0 };
  return { tier, streak: s };
}
