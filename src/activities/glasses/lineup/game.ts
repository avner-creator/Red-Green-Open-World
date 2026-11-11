/**
 * Line-up: the pure game state (no scene; the mechanic and the unit-test simulations share it).
 *
 * The booth kit's round drives it: each try of a round (`open()`) brings the bubbles up to the
 * number the round's tier wants (one at tiers 1–2, two at tier 3). The child taps Use while
 * standing on the pad: if a live bubble is inside the ring it pops (a hit), otherwise the oldest
 * live bubble floats away (a miss). A bubble left alone for `lifetime` seconds floats away too
 * (a miss). Every outcome is reported once through `hooks.result`, and after EVERY tap that counts
 * and every time-out the ring's offset is redrawn. Taps and time-outs only count while a try is
 * open (`playing`); pops and drifts keep animating meanwhile.
 */
import type { GlassesTier } from '../../../types';
import { drawOffset, glide } from './aim';
import type { Offset } from './aim';
import { LINEUP } from './constants';

export type BubbleState = 'empty' | 'wait' | 'in' | 'live' | 'pop' | 'drift';

export interface GameBubble {
  state: BubbleState;
  /** Seconds in the current state (negative while waiting to appear). */
  t: number;
  /** Seconds alive (in + live, while a try is open). */
  age: number;
  tier: GlassesTier;
}

export interface LineupHooks {
  /** One per tap that counts and per time-out (the round's tier). */
  result?(tier: GlassesTier, hit: boolean, slot: number): void;
  /** Slot `i` got a new bubble (pick its spot now). */
  spawned?(i: number): void;
  popped?(i: number): void;
  /** Slot `i` floats away: a missed tap or a time-out. */
  missed?(i: number, why: 'press' | 'timeout'): void;
}

export type PressOutcome = 'ignored' | 'hit' | 'miss';

export class LineupGame {
  readonly bubbles: GameBubble[];
  /** The round's tier (set by the booth's round on every try). */
  tier: GlassesTier = 1;
  pops = 0;
  misses = 0;
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

  canPress(): boolean {
    return this.bubbles.some((b) => b.state === 'live');
  }

  /**
   * Advance time. `playing`: a try is open (live bubbles age and may time out); otherwise only
   * the animations run (spawn-in, pop, drift).
   */
  step(dt: number, playing = true): void {
    const B = LINEUP.bubble;
    this.glideT += dt;
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
          if (playing) b.age += dt;
          if (b.t >= B.spawnIn) {
            b.state = 'live';
            b.t = 0;
          }
          break;
        case 'live':
          if (!playing) break;
          b.age += dt;
          if (b.age >= B.lifetime) {
            this.drift(i, 'timeout');
            this.redraw();
            // One result per try: the round's beat starts now.
            return;
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
  }

  /** A try opens: bring the bubbles up to the number wanted at `tier` (new ones appear at once). */
  open(tier: GlassesTier): void {
    this.tier = tier;
    const busy = this.bubbles.filter((b) => b.state === 'wait' || b.state === 'in' || b.state === 'live').length;
    let need = this.wanted() - busy;
    // Empty slots first, so a pop or a drift can finish its animation.
    const order = [...this.bubbles.keys()].sort((a, c) => Number(this.bubbles[a].state !== 'empty') - Number(this.bubbles[c].state !== 'empty'));
    for (const i of order) {
      if (need <= 0) break;
      const b = this.bubbles[i];
      if (b.state !== 'empty' && b.state !== 'pop' && b.state !== 'drift') continue;
      b.state = 'wait';
      b.t = 0;
      b.age = 0;
      b.tier = tier;
      need--;
      this.hooks.spawned?.(i);
    }
  }

  /** The child tapped Use; `inside` = a slot whose live bubble is inside the ring, or −1. */
  press(inside: number): PressOutcome {
    if (!this.canPress()) return 'ignored';
    this.presses++;
    const b = inside >= 0 ? this.bubbles[inside] : undefined;
    let out: PressOutcome;
    if (b && b.state === 'live') {
      b.state = 'pop';
      b.t = 0;
      this.pops++;
      out = 'hit';
      this.hooks.popped?.(inside);
      this.hooks.result?.(b.tier, true, inside);
    } else {
      let oldest = -1;
      for (let i = 0; i < this.bubbles.length; i++)
        if (this.bubbles[i].state === 'live' && (oldest < 0 || this.bubbles[i].age > this.bubbles[oldest].age)) oldest = i;
      this.drift(oldest, 'press');
      out = 'miss';
    }
    this.redraw();
    return out;
  }

  private drift(i: number, why: 'press' | 'timeout'): void {
    const b = this.bubbles[i];
    b.state = 'drift';
    b.t = 0;
    this.misses++;
    this.hooks.missed?.(i, why);
    this.hooks.result?.(b.tier, false, i);
  }

  /** The round is over or cancelled: every bubble still up floats away quietly (no result). */
  close(): void {
    for (const b of this.bubbles) {
      if (b.state === 'live' || b.state === 'in') {
        b.state = 'drift';
        b.t = 0;
      } else if (b.state === 'wait') b.state = 'empty';
    }
  }

  /** Everything gone at once (far-idle). */
  clear(): void {
    for (const b of this.bubbles) {
      b.state = 'empty';
      b.t = 0;
      b.age = 0;
    }
  }

  reset(): void {
    this.clear();
    this.tier = 1;
    this.pops = this.misses = this.presses = 0;
    this.setOffset(drawOffset(this.rng));
  }
}
