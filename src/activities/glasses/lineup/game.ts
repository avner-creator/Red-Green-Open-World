/**
 * Line-up: the pure game state (no scene; the mechanic and the unit-test simulations share it).
 *
 * Bubbles live in slots (one at tiers 1–2, two at tier 3). The child presses Use while standing on
 * the pad: if a live bubble is inside the ring it pops (gems), otherwise the oldest live bubble
 * floats away (a miss) and the ring recharges for `missCooldown` seconds, during which presses do
 * nothing. After EVERY press that counts, and every time-out, the ring's offset is redrawn.
 */
import type { GlassesTier } from '../../../types';
import { drawOffset, glide, nextTier } from './aim';
import type { Offset, TierState } from './aim';
import { LINEUP } from './constants';

export type BubbleState = 'empty' | 'wait' | 'in' | 'live' | 'pop' | 'drift';

export interface GameBubble {
  state: BubbleState;
  /** Seconds in the current state (negative while waiting to appear). */
  t: number;
  /** Seconds alive (in + live). */
  age: number;
  tier: GlassesTier;
}

export interface LineupHooks {
  result?(tier: GlassesTier, hit: boolean): void;
  pay?(gems: number): void;
  /** Slot `i` got a new bubble (pick its spot now). */
  spawned?(i: number): void;
  popped?(i: number): void;
  /** Slot `i` floats away: a missed press or a time-out. */
  missed?(i: number, why: 'press' | 'timeout'): void;
}

export type PressOutcome = 'ignored' | 'hit' | 'miss';

export class LineupGame {
  readonly bubbles: GameBubble[];
  ladder: TierState = { tier: 1, streak: 0 };
  /** Fixed tier (tests / simulations); null = the ladder. */
  lockTier: GlassesTier | null = null;
  cooldown = 0;
  pops = 0;
  misses = 0;
  gems = 0;
  presses = 0;
  private from: Offset;
  private to: Offset;
  private glideT = 99;

  constructor(
    private readonly rng: () => number,
    private readonly hooks: LineupHooks = {},
  ) {
    this.bubbles = Array.from({ length: LINEUP.bubble.slots }, () => ({ state: 'empty' as BubbleState, t: 0, age: 0, tier: 1 as GlassesTier }));
    this.from = this.to = drawOffset(rng);
  }

  get tier(): GlassesTier {
    return this.lockTier ?? this.ladder.tier;
  }

  /** How many bubbles show at the current tier. */
  wanted(): number {
    return this.tier >= 3 ? 2 : 1;
  }

  /** The ring's current offset (gliding to a new one for `glideSeconds` after a redraw). */
  offset(): Offset {
    return glide(this.from, this.to, this.glideT);
  }

  /** Draw a new ring offset (the ring glides there). */
  redraw(): void {
    this.from = this.offset();
    this.to = drawOffset(this.rng);
    this.glideT = 0;
  }

  /** Jump the ring to an offset at once (tests). */
  setOffset(o: Offset): void {
    this.from = this.to = o;
    this.glideT = 99;
  }

  /** Cooldown progress 0..1 (1 = ready). */
  charge(): number {
    return this.cooldown <= 0 ? 1 : 1 - this.cooldown / LINEUP.missCooldown;
  }

  canPress(): boolean {
    return this.cooldown <= 0 && this.bubbles.some((b) => b.state === 'live');
  }

  step(dt: number): void {
    const B = LINEUP.bubble;
    this.glideT += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    for (let i = 0; i < this.bubbles.length; i++) {
      const b = this.bubbles[i];
      b.t += dt;
      switch (b.state) {
        case 'wait':
          if (b.t >= 0) {
            b.state = 'in';
            b.t = 0;
          }
          break;
        case 'in':
          b.age += dt;
          if (b.t >= B.spawnIn) {
            b.state = 'live';
            b.t = 0;
          }
          break;
        case 'live':
          b.age += dt;
          if (b.age >= B.lifetime) {
            this.drift(i, 'timeout');
            this.redraw();
          }
          break;
        case 'pop':
          if (b.t >= B.popSeconds) b.state = 'empty';
          break;
        case 'drift':
          if (b.t >= B.driftSeconds) b.state = 'empty';
          break;
        default:
          break;
      }
    }
    this.fill();
  }

  /** Bring bubbles up to the number wanted (each after the respawn delay; the first at once). */
  fill(atOnce = false): void {
    const busy = this.bubbles.filter((b) => b.state !== 'empty').length;
    let need = this.wanted() - busy;
    for (let i = 0; i < this.bubbles.length && need > 0; i++) {
      const b = this.bubbles[i];
      if (b.state !== 'empty') continue;
      b.state = 'wait';
      b.t = atOnce ? 0 : -LINEUP.bubble.respawnDelay;
      b.age = 0;
      b.tier = this.tier;
      need--;
      this.hooks.spawned?.(i);
    }
  }

  /** The child pressed Use; `inside` = a slot whose live bubble is inside the ring, or −1. */
  press(inside: number): PressOutcome {
    if (!this.canPress()) return 'ignored';
    this.presses++;
    const b = inside >= 0 ? this.bubbles[inside] : undefined;
    if (b && b.state === 'live') {
      b.state = 'pop';
      b.t = 0;
      this.pops++;
      const n = LINEUP.gems[b.tier];
      this.gems += n;
      this.hooks.result?.(b.tier, true);
      this.hooks.pay?.(n);
      this.hooks.popped?.(inside);
      this.ladder = nextTier(this.ladder, true);
    } else {
      let oldest = -1;
      for (let i = 0; i < this.bubbles.length; i++)
        if (this.bubbles[i].state === 'live' && (oldest < 0 || this.bubbles[i].age > this.bubbles[oldest].age)) oldest = i;
      this.drift(oldest, 'press');
      this.cooldown = LINEUP.missCooldown;
    }
    this.redraw();
    return b && b.state === 'pop' ? 'hit' : 'miss';
  }

  private drift(i: number, why: 'press' | 'timeout'): void {
    const b = this.bubbles[i];
    b.state = 'drift';
    b.t = 0;
    this.misses++;
    this.hooks.result?.(b.tier, false);
    this.hooks.missed?.(i, why);
    this.ladder = nextTier(this.ladder, false);
  }

  /** Everything gone (leaving the far-idle range, a new session keeps the ladder via `reset`). */
  clear(): void {
    for (const b of this.bubbles) {
      b.state = 'empty';
      b.t = 0;
      b.age = 0;
    }
    this.cooldown = 0;
  }

  reset(): void {
    this.clear();
    this.ladder = { tier: 1, streak: 0 };
    this.pops = this.misses = this.gems = this.presses = 0;
    this.setOffset(drawOffset(this.rng));
  }
}
