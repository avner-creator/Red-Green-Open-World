/**
 * The round state machine every booth game runs (pure; unit-tested):
 *
 *   idle ──start──▶ countdown (3, 2, 1, GO) ──▶ play (try i) ──report──▶ beat ─┬─▶ play (try i+1)
 *     ▲                                                                       ├─▶ wait (back to the pad) ─▶ play
 *     │                                                                       └─▶ (last try) celebrate ─▶ prize ─▶ cooldown ─┐
 *     └───────────────────────────────────────────── cancel (left, respawn, stall) ──────────────────────────────────────────────┘
 *
 * - The tier is fixed for the whole round; it steps after the round (up when hits ≥ upAt, down
 *   when hits < downBelow). Every try's result carries the round's tier.
 * - Anti-guess is done by the PRIZE, not by naps: a miss lights a dim lamp and the round moves
 *   on; the prize needs `minHits` (see `prizeFor`, tested with a random-guess bot).
 * - Cancel never reports a miss for a try that was not played. Cancelling during the celebration
 *   or the prize flight pays the prize at once (it was earned).
 * Events come back as a list from every call, in order; the kit turns them into fx and sound.
 */
import type { GlassesTier } from '../../../types';
import type { PrizeTable, RoundRules } from './types';

export type RoundPhase = 'idle' | 'countdown' | 'play' | 'beat' | 'wait' | 'celebrate' | 'prize' | 'cooldown';

export type RoundEvent =
  | { type: 'start' }
  /** Countdown step: 3, 2, 1, then 0 = GO. */
  | { type: 'count'; n: number }
  | { type: 'try'; index: number; tier: GlassesTier }
  | { type: 'result'; index: number; hit: boolean; tier: GlassesTier; streak: number }
  /** Between tries, waiting for the child to be back on the pad. */
  | { type: 'wait' }
  /** All tries done: `gems` > 0 → a celebration; 0 → "aww, again?". */
  | { type: 'end'; hits: number; gems: number }
  /** The prize flight begins (gems > 0 only). */
  | { type: 'prizeFly'; gems: number }
  /** Pay now. */
  | { type: 'pay'; gems: number }
  | { type: 'idle' }
  | { type: 'cancel'; reason: string };

export const ROUND_DEFAULTS = {
  countStep: 0.75,
  goTime: 0.55,
  beat: 1.0,
  celebrate: 2.0,
  prizeTime: 1.3,
  cooldown: 1.4,
  stall: 45,
  leaveRadius: 15,
} as const;

type Full = Required<Omit<RoundRules, 'upAt' | 'downBelow'>> & { upAt: number; downBelow: number };

export function fullRules(r: RoundRules): Full {
  return {
    ...ROUND_DEFAULTS,
    ...r,
    upAt: r.upAt ?? r.tries,
    downBelow: r.downBelow ?? r.minHits,
  } as Full;
}

/** Gems for `hits` at `tier` (0 below `minHits`). */
export function prizeFor(rules: Pick<RoundRules, 'minHits' | 'prize'>, hits: number, tier: GlassesTier): number {
  if (hits < rules.minHits) return 0;
  const row = rules.prize[tier];
  return Math.max(0, Math.round(row[Math.min(hits, row.length - 1)] ?? 0));
}

/** Tier after a round. */
export function stepTier(tier: GlassesTier, hits: number, upAt: number, downBelow: number): GlassesTier {
  if (hits >= upAt) return Math.min(3, tier + 1) as GlassesTier;
  if (hits < downBelow) return Math.max(1, tier - 1) as GlassesTier;
  return tier;
}

export class RoundMachine {
  readonly rules: Full;
  phase: RoundPhase = 'idle';
  /** Seconds in the current phase. */
  t = 0;
  /** Seconds since the last progress (start, try, result) — for the stall cancel. */
  quiet = 0;
  tier: GlassesTier = 1;
  /** Current try (0-based) while playing; results so far. */
  index = 0;
  results: boolean[] = [];
  streak = 0;
  /** Gems of the round that ended (paid during `prize`). */
  gems = 0;
  private paid = false;
  private count = 3;
  /** Totals for the session (debug). */
  rounds = 0;
  totalGems = 0;

  constructor(rules: RoundRules) {
    this.rules = fullRules(rules);
  }

  get hits(): number {
    return this.results.filter(Boolean).length;
  }

  /** True while a round is on (countdown to prize): the start pad is closed. */
  get busy(): boolean {
    return this.phase !== 'idle';
  }

  /** In a phase where leaving / respawn cancels (the tries are not over yet). */
  get cancellable(): boolean {
    return this.phase === 'countdown' || this.phase === 'play' || this.phase === 'beat' || this.phase === 'wait';
  }

  private go(p: RoundPhase): void {
    this.phase = p;
    this.t = 0;
  }

  start(): RoundEvent[] {
    if (this.phase !== 'idle') return [];
    this.results = [];
    this.index = 0;
    this.streak = 0;
    this.gems = 0;
    this.paid = false;
    this.count = 3;
    this.quiet = 0;
    this.go('countdown');
    return [{ type: 'start' }, { type: 'count', n: 3 }];
  }

  /** The mini-game reports the current try's outcome (ignored outside `play`). */
  report(hit: boolean): RoundEvent[] {
    if (this.phase !== 'play') return [];
    this.results.push(hit);
    this.streak = hit ? this.streak + 1 : 0;
    this.quiet = 0;
    const ev: RoundEvent = { type: 'result', index: this.index, hit, tier: this.tier, streak: this.streak };
    this.go('beat');
    return [ev];
  }

  /**
   * Advance time. `ready`: may the next try start (only read in `wait`, i.e. with
   * `between: 'pad'`: the child is back on the pad).
   */
  step(dt: number, ready = true): RoundEvent[] {
    const out: RoundEvent[] = [];
    if (this.phase === 'idle') return out;
    this.t += dt;
    if (this.phase === 'play' || this.phase === 'wait') {
      this.quiet += dt;
      if (this.quiet >= this.rules.stall) return this.cancel('stall');
    }
    const R = this.rules;
    switch (this.phase) {
      case 'countdown': {
        const per = this.count > 0 ? R.countStep : R.goTime;
        if (this.t >= per) {
          this.t -= per;
          if (this.count > 0) {
            this.count--;
            out.push({ type: 'count', n: this.count });
          } else {
            this.index = 0;
            this.go('play');
            out.push({ type: 'try', index: 0, tier: this.tier });
          }
        }
        break;
      }
      case 'beat':
        if (this.t >= R.beat) {
          if (this.results.length >= R.tries) out.push(...this.finish());
          else if (R.between === 'pad' && !ready) {
            this.go('wait');
            out.push({ type: 'wait' });
          } else out.push(...this.nextTry());
        }
        break;
      case 'wait':
        if (ready) out.push(...this.nextTry());
        break;
      case 'celebrate':
        if (this.t >= R.celebrate) {
          if (this.gems > 0) {
            this.go('prize');
            out.push({ type: 'prizeFly', gems: this.gems });
          } else {
            this.go('cooldown');
          }
        }
        break;
      case 'prize':
        if (this.t >= R.prizeTime) {
          out.push(...this.payOut());
          this.go('cooldown');
        }
        break;
      case 'cooldown':
        if (this.t >= R.cooldown) {
          this.go('idle');
          out.push({ type: 'idle' });
        }
        break;
      default:
        break;
    }
    return out;
  }

  private nextTry(): RoundEvent[] {
    this.index = this.results.length;
    this.quiet = 0;
    this.go('play');
    return [{ type: 'try', index: this.index, tier: this.tier }];
  }

  private finish(): RoundEvent[] {
    const hits = this.hits;
    this.gems = prizeFor(this.rules, hits, this.tier);
    this.rounds++;
    this.tier = stepTier(this.tier, hits, this.rules.upAt, this.rules.downBelow);
    this.go('celebrate');
    return [{ type: 'end', hits, gems: this.gems }];
  }

  private payOut(): RoundEvent[] {
    if (this.paid || this.gems <= 0) return [];
    this.paid = true;
    this.totalGems += this.gems;
    return [{ type: 'pay', gems: this.gems }];
  }

  /** Stop the round. During the tries: nothing is reported for the rest. After them: pay at once. */
  cancel(reason: string): RoundEvent[] {
    if (this.phase === 'idle') return [];
    const out: RoundEvent[] = [];
    if (this.phase === 'celebrate' || this.phase === 'prize') out.push(...this.payOut());
    if (this.phase === 'cooldown') {
      this.go('idle');
      return [{ type: 'idle' }];
    }
    this.go('idle');
    out.push({ type: 'cancel', reason }, { type: 'idle' });
    return out;
  }

  /** New session: idle, tier 1, nothing owed. */
  reset(): void {
    this.phase = 'idle';
    this.t = 0;
    this.quiet = 0;
    this.tier = 1;
    this.index = 0;
    this.results = [];
    this.streak = 0;
    this.gems = 0;
    this.paid = true;
    this.rounds = 0;
    this.totalGems = 0;
  }

  /** Test hook: jump straight into try 0 of a fresh round (no countdown). */
  forcePlay(tier?: GlassesTier): RoundEvent[] {
    if (tier) this.tier = tier;
    this.results = [];
    this.streak = 0;
    this.gems = 0;
    this.paid = false;
    this.quiet = 0;
    this.index = 0;
    this.go('play');
    return [{ type: 'try', index: 0, tier: this.tier }];
  }
}

// ───────────────────────────── prize tables (tuned with ./sim.ts) ─────────────────────────────

/** Pick-one-of-three games, 5 tries, a prize from 3 hits (template for odd one out, dot signs). */
export const PICK3_PRIZE: PrizeTable = {
  1: [0, 0, 0, 4, 6, 10],
  2: [0, 0, 0, 5, 8, 13],
  3: [0, 0, 0, 6, 10, 16],
};
