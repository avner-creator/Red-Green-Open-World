/**
 * "Boop them all!" (pure, no three.js): the Silly Zone mini-game. Stand on the start pad, 3-2-1,
 * then bop every lit-up tube person before the clock runs out. Each round is seeded: which tube
 * people light up, how fast and which way the sweeper bar spins, the pillow swing timing. Also the
 * sweeper-bar and wrecking-pillow hit tests (soft, comic boops: never a hurt).
 */

export const BOOP = {
  /** Seconds to bop them all. */
  roundSeconds: 45,
  /** Tube people lit up per round (of all of them). */
  targets: 6,
  /** 3-2-1 before GO (seconds). */
  countdown: 3,
  /** Seconds standing on the start pad before the countdown starts. */
  startHold: 0.6,
  /** Leaving the zone (metres from its centre) ends a round early (no prize, no fuss). */
  leaveRadius: 24,
  /** Seconds the result stays up. */
  resultSeconds: 5,
  /** Gems per star count (index = stars); a practice round pays nothing. */
  prize: [0, 1, 3, 5] as readonly number[],
  /** Win with at least this many seconds left = 3 stars. */
  fastWin: 15,
  /** Sweeper: base angular speed range (rad/s) and the speed-up per bop. */
  sweeper: { min: 0.75, max: 1.2, perBoop: 0.07, length: 5, top: 0.62, halfWidth: 0.3 },
  /** Wrecking pillows: swing amplitude (rad), period range (s), rope length, pillow radius. */
  pillow: { amp: 0.62, periodMin: 2.4, periodMax: 3.2, rope: 3.1, radius: 0.75 },
} as const;

/** Fixed seed for `?test=1` rounds (round n uses TEST_SEED + n). */
export const TEST_SEED = 4242;

/** Small fast seeded PRNG (mulberry32): returns a function giving floats in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RoundPlan {
  /** Indices of the tube people that light up (sorted). */
  targets: number[];
  /** Sweeper base speed (rad/s) and direction (+1 counter-clockwise from above). */
  sweeperSpeed: number;
  sweeperDir: 1 | -1;
  /** Pillow swing periods (s) and phases (rad). */
  pillowPeriod: [number, number];
  pillowPhase: [number, number];
}

export function planRound(seed: number, tubeCount: number, targetCount: number = BOOP.targets): RoundPlan {
  const r = rng(seed);
  const idx = Array.from({ length: tubeCount }, (_, i) => i);
  // Fisher-Yates, then take the first `targetCount`.
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const n = Math.max(1, Math.min(tubeCount, targetCount));
  const s = BOOP.sweeper;
  const p = BOOP.pillow;
  return {
    targets: idx.slice(0, n).sort((a, b) => a - b),
    sweeperSpeed: s.min + (s.max - s.min) * r(),
    sweeperDir: r() < 0.5 ? 1 : -1,
    pillowPeriod: [p.periodMin + (p.periodMax - p.periodMin) * r(), p.periodMin + (p.periodMax - p.periodMin) * r()],
    pillowPhase: [r() * Math.PI * 2, r() * Math.PI * 2],
  };
}

export type RoundPhase = 'idle' | 'countdown' | 'play' | 'done';

export interface RoundResult {
  win: boolean;
  booped: number;
  total: number;
  /** Seconds used (win) or the full round (time-up). */
  time: number;
  stars: number;
  prize: number;
}

/** Stars for a finished round: fast win 3, win 2, time-up with at least one bop 1, else 0. */
export function boopStars(win: boolean, timeLeft: number, booped: number): number {
  if (win) return timeLeft >= BOOP.fastWin ? 3 : 2;
  return booped > 0 ? 1 : 0;
}

export function boopPrize(stars: number, practice: boolean): number {
  if (practice) return 0;
  return BOOP.prize[Math.max(0, Math.min(BOOP.prize.length - 1, stars))] ?? 0;
}

export type RoundEvent =
  | { type: 'count'; n: number }
  | { type: 'go' }
  | { type: 'boop'; tube: number; booped: number; total: number }
  | { type: 'end'; result: RoundResult };

/** The round state machine. `update` and `boop` return what happened (for sound, HUD, fx). */
export class BoopRound {
  phase: RoundPhase = 'idle';
  /** Seconds in the current phase. */
  t = 0;
  plan: RoundPlan | null = null;
  readonly booped = new Set<number>();
  practice = false;
  result: RoundResult | null = null;
  private lastCount = 0;

  constructor(private readonly tubeCount: number) {}

  start(seed: number, practice = false): RoundEvent[] {
    this.plan = planRound(seed, this.tubeCount);
    this.booped.clear();
    this.practice = practice;
    this.result = null;
    this.phase = 'countdown';
    this.t = 0;
    this.lastCount = BOOP.countdown;
    return [{ type: 'count', n: BOOP.countdown }];
  }

  get total(): number {
    return this.plan?.targets.length ?? 0;
  }

  get timeLeft(): number {
    return this.phase === 'play' ? Math.max(0, BOOP.roundSeconds - this.t) : this.phase === 'countdown' ? BOOP.roundSeconds : 0;
  }

  /** A lit tube person still waiting for its bop (only while playing). */
  isLit(tube: number): boolean {
    return this.phase === 'play' && !!this.plan?.targets.includes(tube) && !this.booped.has(tube);
  }

  /** Is this tube a target this round (lit during the countdown too, so you can plan)? */
  isTarget(tube: number): boolean {
    return (this.phase === 'play' || this.phase === 'countdown') && !!this.plan?.targets.includes(tube);
  }

  /** Booped tubes speed the sweeper up. */
  sweeperSpeed(): number {
    const p = this.plan;
    if (!p) return BOOP.sweeper.min;
    return p.sweeperSpeed + BOOP.sweeper.perBoop * this.booped.size;
  }

  update(dt: number): RoundEvent[] {
    const out: RoundEvent[] = [];
    if (this.phase === 'idle') return out;
    this.t += dt;
    if (this.phase === 'countdown') {
      const n = Math.ceil(BOOP.countdown - this.t);
      if (n < this.lastCount && n > 0) out.push({ type: 'count', n });
      this.lastCount = n;
      if (this.t >= BOOP.countdown) {
        this.phase = 'play';
        this.t = 0;
        out.push({ type: 'go' });
      }
    } else if (this.phase === 'play') {
      if (this.t >= BOOP.roundSeconds) out.push(this.finish(false));
    } else if (this.phase === 'done' && this.t >= BOOP.resultSeconds) {
      this.phase = 'idle';
      this.t = 0;
    }
    return out;
  }

  boop(tube: number): RoundEvent[] {
    if (!this.isLit(tube)) return [];
    this.booped.add(tube);
    const out: RoundEvent[] = [{ type: 'boop', tube, booped: this.booped.size, total: this.total }];
    if (this.booped.size >= this.total) out.push(this.finish(true));
    return out;
  }

  /** Stop without a result (left the zone, respawned, session ended). */
  cancel(): void {
    this.phase = 'idle';
    this.t = 0;
    this.result = null;
  }

  private finish(win: boolean): RoundEvent {
    const time = win ? this.t : BOOP.roundSeconds;
    const stars = boopStars(win, BOOP.roundSeconds - time, this.booped.size);
    this.result = { win, booped: this.booped.size, total: this.total, time, stars, prize: boopPrize(stars, this.practice) };
    this.phase = 'done';
    this.t = 0;
    return { type: 'end', result: this.result };
  }
}

// ───────────────────────────── Sweeper bar and wrecking pillows ─────────────────────────────

/** Distance from point (px, pz) to the segment through the origin from −L·u to +L·u (u = (cos a, sin a)). */
export function distToBar(px: number, pz: number, angle: number, length: number): { d: number; along: number } {
  const ux = Math.cos(angle);
  const uz = Math.sin(angle);
  const along = Math.max(-length, Math.min(length, px * ux + pz * uz));
  return { d: Math.hypot(px - along * ux, pz - along * uz), along };
}

/**
 * Does the spinning bar catch a player at hub-local (px, pz) whose feet are `y` above the hub floor?
 * Jumping over it (feet above the bar top) is safe.
 */
export function sweeperHits(px: number, pz: number, y: number, angle: number, playerRadius: number): boolean {
  const s = BOOP.sweeper;
  if (y > s.top - 0.05 || y < -0.6) return false;
  const { d } = distToBar(px, pz, angle, s.length);
  return d < s.halfWidth + playerRadius && Math.hypot(px, pz) > 0.7;
}

/**
 * Comic boop velocity from the bar: along the way the bar is moving at that point, plus a hop.
 * `omega` = signed angular speed (rad/s, + counter-clockwise from above, i.e. +X towards −Z).
 */
export function sweeperBoop(px: number, pz: number, omega: number): { x: number; y: number; z: number } {
  const r = Math.max(0.8, Math.hypot(px, pz));
  // Rotation about +Y by +omega moves (x, z) towards (z, −x) (right-handed, seen from above).
  const tx = (pz / r) * Math.sign(omega || 1);
  const tz = (-px / r) * Math.sign(omega || 1);
  const sp = Math.min(9, Math.max(5, Math.abs(omega) * r * 1.4));
  return { x: tx * sp + (px / r) * 1.5, y: 6.5, z: tz * sp + (pz / r) * 1.5 };
}

/** Pillow swing angle (rad) at time t. */
export function pillowAngle(t: number, period: number, phase: number): number {
  return BOOP.pillow.amp * Math.sin((t * Math.PI * 2) / period + phase);
}

/** Pillow centre offset from its pivot (swinging in the pivot's local Z) and its velocity along Z. */
export function pillowOffset(t: number, period: number, phase: number): { z: number; y: number; vz: number } {
  const a = pillowAngle(t, period, phase);
  const w = (Math.PI * 2) / period;
  const L = BOOP.pillow.rope;
  const da = BOOP.pillow.amp * w * Math.cos(t * w + phase);
  return { z: Math.sin(a) * L, y: -Math.cos(a) * L, vz: Math.cos(a) * L * da };
}

/** Boop off a pillow: pushed the way it swings (at least a soft shove away from it) and up. */
export function pillowBoop(dz: number, vz: number): { z: number; y: number } {
  const dir = Math.abs(vz) > 0.8 ? Math.sign(vz) : Math.sign(dz) || 1;
  return { z: dir * Math.min(10, Math.max(6, Math.abs(vz) * 1.6)), y: 6 };
}
