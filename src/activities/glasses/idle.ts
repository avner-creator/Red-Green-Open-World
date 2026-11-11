/** Far-idle switch with hysteresis, plus a small seeded RNG. Pure (unit-tested). */
import { GLASSES } from './constants';

export class FarIdle {
  active = false;
  constructor(
    readonly on: number = GLASSES.activateRadius,
    readonly off: number = GLASSES.deactivateRadius,
  ) {}

  /** Feed the player's distance; returns true when the state flipped this call. */
  update(distance: number): boolean {
    const next = this.active ? distance <= this.off : distance <= this.on;
    if (next === this.active) return false;
    this.active = next;
    return true;
  }

  reset(): void {
    this.active = false;
  }
}

/** FNV-1a hash of a string (seeds). */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: deterministic 0..1 generator. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
