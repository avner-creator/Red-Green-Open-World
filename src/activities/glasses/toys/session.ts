/**
 * Pip's lost toys: one session of the booth game (pure; unit-tested). The booth kit runs the round
 * (pad → 3-2-1-GO → one try → celebration → prize); this keeps what is special to the toys:
 *
 *  - three toys per session, toy n on a tier-n trail (5 / 7 / 10 gems, +10 with the third);
 *  - a round = one trail (`begin` at GO): follow it → `found` (the toy pops out, flies into the
 *    basket: `landed`); 75 s after GO without the toy → `timeout` (a miss; the same toy waits
 *    for the next round, on a new trail);
 *  - after the third toy the basket is full (`done`); a free-play trail still pays a little and
 *    its toy lands on top of the pile;
 *  - `stop` ends a trail without a result (the round was cancelled).
 */
import type { GlassesTier } from '../../../types';
import { hashString } from '../idle';
import { LAND_AT, TOYS, toyPrize } from './constants';
import { advance } from './trail';
import type { Trail } from './trail';

export type ToyState = 'idle' | 'trail' | 'show';

export type ToyEvent =
  | { type: 'print'; index: number }
  /** The toy is found: `toy` = its kind / basket place (0..2), `free` = a free-play trail. */
  | { type: 'found'; toy: number; free: boolean; tier: GlassesTier; gems: number }
  /** The toy lands in the basket; `full` = it was the session's last toy (big celebration). */
  | { type: 'landed'; toy: number; free: boolean; full: boolean }
  | { type: 'timeout'; tier: GlassesTier };

/** Trail seed for a session seed and attempt number. */
export function trailSeed(sessionSeed: number, attempt: number): number {
  return hashString(`toys:${sessionSeed >>> 0}:${attempt}`);
}

export class ToySession {
  state: ToyState = 'idle';
  /** Toys found this session (0..3); lamp i is lit when toy i is found. */
  found = 0;
  /** Toys resting in the basket (found ones land a moment later). */
  inBasket = 0;
  /** Kind of the free-play toy on top of the pile (-1 = none). */
  topToy = -1;
  /** Trails begun this session. */
  attempt = 0;
  seed = 0;
  /** First print not reached yet. */
  next = 0;
  /** Seconds since GO (trail) or since the find (show). */
  clock = 0;
  /** The toy found in the current / last round (kind 0..2), whether it was free play, its prize. */
  toy = 0;
  free = false;
  prize = 0;
  private sessionSeed = 0;
  private trailCache: Trail | null = null;
  private readonly make: (seed: number, tier: GlassesTier) => Trail;

  constructor(make: (seed: number, tier: GlassesTier) => Trail) {
    this.make = make;
  }

  /** All three toys are home. */
  get done(): boolean {
    return this.found >= TOYS.perSession;
  }

  /** Tier of the next (or current) trail: the toy number; free play stays at 3. */
  get tier(): GlassesTier {
    return Math.min(3, this.found + 1) as GlassesTier;
  }

  /** The current trail (or the one the next round would use); built lazily, it probes the world. */
  trail(): Trail {
    if (!this.trailCache) this.trailCache = this.make(this.seed, this.tier);
    return this.trailCache;
  }

  reset(sessionSeed: number): void {
    this.sessionSeed = sessionSeed >>> 0;
    this.state = 'idle';
    this.found = 0;
    this.inBasket = 0;
    this.topToy = -1;
    this.attempt = 0;
    this.toy = 0;
    this.free = false;
    this.prize = 0;
    this.setSeed(trailSeed(this.sessionSeed, 0));
  }

  /** Use this exact trail seed now (tests); keeps the state. */
  setSeed(seed: number): void {
    this.seed = seed >>> 0;
    this.next = 0;
    this.trailCache = null;
  }

  /** GO: a new trail starts at the pad (tier = toy number). */
  begin(): void {
    this.setSeed(trailSeed(this.sessionSeed, this.attempt));
    this.attempt++;
    this.state = 'trail';
    this.clock = 0;
    this.free = this.done;
    this.toy = this.free ? (this.attempt - 1) % TOYS.perSession : this.found;
    this.prize = 0;
  }

  /** The round was cancelled: drop the trail (no result). A toy already flying keeps flying. */
  stop(): void {
    if (this.state === 'trail') this.state = 'idle';
  }

  /** Land a flying toy at once (the site goes far-idle). */
  settle(): ToyEvent[] {
    if (this.state !== 'show') return [];
    this.clock = LAND_AT;
    return this.land();
  }

  private land(): ToyEvent[] {
    this.state = 'idle';
    if (this.free) this.topToy = this.toy;
    else this.inBasket = Math.max(this.inBasket, this.toy + 1);
    return [{ type: 'landed', toy: this.toy, free: this.free, full: !this.free && this.toy === TOYS.perSession - 1 }];
  }

  /** Advance: `(x, z)` = the hero's feet (world XZ). */
  update(dt: number, x: number, z: number): ToyEvent[] {
    const ev: ToyEvent[] = [];
    if (this.state === 'trail') {
      const trail = this.trail();
      const tier = this.tier;
      const n = advance(trail.prints, this.next, x, z);
      for (let i = this.next; i < n; i++) ev.push({ type: 'print', index: i });
      this.next = n;
      this.clock += dt;
      if (this.next >= trail.prints.length) {
        this.prize = toyPrize(this.toy, this.free);
        if (!this.free) this.found++;
        this.state = 'show';
        this.clock = 0;
        ev.push({ type: 'found', toy: this.toy, free: this.free, tier, gems: this.prize });
      } else if (this.clock >= TOYS.timeout) {
        this.state = 'idle';
        ev.push({ type: 'timeout', tier });
      }
      return ev;
    }
    if (this.state === 'show') {
      this.clock += dt;
      if (this.clock >= LAND_AT) ev.push(...this.land());
    }
    return ev;
  }
}
