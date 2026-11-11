/**
 * Variety and restraint for Pip's chatter (pure, no DOM):
 *  - `ShuffleBag`: draws every line of a pool once in random order before reshuffling, and never
 *    gives the same line twice in a row (also across a reshuffle).
 *  - `Memory`: when each line was last said; a line is not repeated within `REPEAT_SECONDS`.
 */

/** The same line is never said again within this many seconds. */
export const REPEAT_SECONDS = 180;
/** At most one unsolicited spoken line (reactions, idle chatter, nudges) per this many seconds. */
export const UNSOLICITED_GAP = 15;
/** Mega gems: at most one line per this many seconds. */
export const MEGA_GAP = 20;

export class ShuffleBag<T> {
  private bag: T[] = [];
  private last: T | null = null;

  constructor(
    private readonly items: readonly T[],
    private readonly rand: () => number = Math.random,
  ) {}

  private refill(): void {
    this.bag = this.items.slice();
    for (let i = this.bag.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
    }
    // Never start the new round with the line that ended the previous one.
    if (this.bag.length > 1 && this.bag[this.bag.length - 1] === this.last) {
      [this.bag[0], this.bag[this.bag.length - 1]] = [this.bag[this.bag.length - 1], this.bag[0]];
    }
  }

  /** Next item, skipping ones `ok` rejects (they stay for a later round). Null if none is ok. */
  next(ok: (item: T) => boolean = () => true): T | null {
    for (let tries = 0; tries < 2; tries++) {
      if (!this.bag.length) this.refill();
      for (let i = this.bag.length - 1; i >= 0; i--) {
        const it = this.bag[i];
        if (it === this.last && this.items.length > 1) continue;
        if (!ok(it)) continue;
        this.bag.splice(i, 1);
        this.last = it;
        return it;
      }
      // Everything left in this round was rejected: start a fresh round once.
      this.bag = [];
    }
    return null;
  }
}

export class Memory {
  private readonly said = new Map<string, number>();

  note(text: string, now: number): void {
    this.said.set(text, now);
  }

  /** True when `text` was not said in the last `REPEAT_SECONDS`. */
  fresh(text: string, now: number): boolean {
    const t = this.said.get(text);
    return t === undefined || now - t >= REPEAT_SECONDS;
  }

  clear(): void {
    this.said.clear();
  }
}
