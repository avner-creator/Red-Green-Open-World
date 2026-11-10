/** Pure rate limiting, polyphony and streak helpers (time is injected, no WebAudio). */

/** Rejects the same key if it fired less than `minGap` seconds ago. */
export class RateLimiter {
  private readonly last = new Map<string, number>();
  constructor(private readonly minGap: number) {}
  allow(key: string, now: number): boolean {
    const prev = this.last.get(key);
    if (prev !== undefined && now >= prev && now - prev < this.minGap) return false;
    this.last.set(key, now);
    return true;
  }
}

/** Tracks active voices by end time. */
export class VoiceCounter {
  private ends: number[] = [];
  constructor(private readonly max: number) {}
  active(now: number): number {
    this.ends = this.ends.filter((e) => e > now);
    return this.ends.length;
  }
  /** Reserve a voice lasting `duration`; false when full. */
  tryAdd(now: number, duration: number): boolean {
    if (this.active(now) >= this.max) return false;
    this.ends.push(now + duration);
    return true;
  }
}

/** Counts consecutive events less than `window` seconds apart. */
export class StreakTracker {
  private last = -Infinity;
  private count = 0;
  constructor(private readonly window: number) {}
  /** Returns the 0-based index of this hit in the current streak. */
  hit(now: number): number {
    this.count = now - this.last <= this.window ? this.count + 1 : 0;
    this.last = now;
    return this.count;
  }
}
