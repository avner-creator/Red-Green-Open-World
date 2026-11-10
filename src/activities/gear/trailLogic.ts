/**
 * Trail rules without three.js: tints, rainbow lanes (each must read as bright/dark stripes in the
 * red channel alone and in the green channel alone), spacing, and the ribbon's path history.
 */
import type { TrailKind } from './catalog';

export const MAX_TRAIL_PARTICLES = 60;

/** Instance tints for the textured particles (kept light so the textures keep their contrast). */
export const TRAIL_TINTS: Readonly<Record<'sparkle' | 'bubbles', readonly number[]>> = {
  sparkle: [0xffffff, 0xfff1b0, 0xffe27a, 0xffffff],
  bubbles: [0xffffff, 0xd8f6ff, 0xffe6f6, 0xe6ffe8],
};

/** Rainbow lanes across the ribbon (sRGB). Neighbouring lanes differ strongly in R or in G. */
export const RAINBOW_LANES: readonly number[] = [0xff2a2a, 0xffa01e, 0xfff23a, 0x1fd04a, 0x2a5cff, 0xa23cdc];

export interface TrailSpec {
  /** Metres walked between puffs. */
  spacing: number;
  /** Seconds a puff lives. */
  life: number;
  /** Smallest and largest puff size in metres. */
  size: readonly [number, number];
  /** Upward drift in m/s. */
  rise: number;
}

export const TRAIL_SPECS: Readonly<Record<TrailKind, TrailSpec>> = {
  sparkle: { spacing: 0.1, life: 1.1, size: [0.14, 0.25], rise: 0.45 },
  bubbles: { spacing: 0.34, life: 2.0, size: [0.12, 0.36], rise: 0.7 },
  // Rainbow sheds a few sparkles from the ribbon.
  rainbow: { spacing: 0.5, life: 0.9, size: [0.08, 0.16], rise: 0.35 },
};

/** Ribbon length in seconds of travel, width and height above the feet. */
export const RIBBON = { seconds: 1.5, width: 0.5, lift: 0.35, maxSamples: 28, minStep: 0.14 } as const;

/** Turns distance walked into a number of puffs to emit. */
export class TrailEmitter {
  private carry = 0;

  /** Add `distance` metres of travel; returns how many puffs to emit now (capped so a teleport emits few). */
  advance(distance: number, spacing: number, cap = 3): number {
    if (!(distance > 0)) return 0;
    this.carry += distance;
    const n = Math.min(cap, Math.floor(this.carry / spacing));
    this.carry -= Math.floor(this.carry / spacing) * spacing;
    return n;
  }

  reset(): void {
    this.carry = 0;
  }
}

export interface PathSample {
  x: number;
  y: number;
  z: number;
  /** Seconds since recorded. */
  age: number;
}

/** The last RIBBON.seconds of the player's path, newest last. */
export class RibbonHistory {
  readonly samples: PathSample[] = [];

  /** Age everything, drop what is too old, and record `p` if it moved far enough from the last sample. */
  push(dt: number, p: { x: number; y: number; z: number }): void {
    for (const s of this.samples) s.age += dt;
    while (this.samples.length > 0 && this.samples[0].age > RIBBON.seconds) this.samples.shift();
    const last = this.samples[this.samples.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.z - last.z) >= RIBBON.minStep) {
      this.samples.push({ x: p.x, y: p.y, z: p.z, age: 0 });
      if (this.samples.length > RIBBON.maxSamples) this.samples.shift();
    }
  }

  /** Age only (not moving): the tail keeps shrinking away. */
  tick(dt: number): void {
    for (const s of this.samples) s.age += dt;
    while (this.samples.length > 0 && this.samples[0].age > RIBBON.seconds) this.samples.shift();
  }

  clear(): void {
    this.samples.length = 0;
  }
}

/** 1 at the head, 0 at the tail (smooth). */
export function ribbonFade(age: number): number {
  const k = Math.min(1, Math.max(0, 1 - age / RIBBON.seconds));
  return k * k * (3 - 2 * k);
}

/** Linear-ish sRGB channel (0..1) of a hex colour: used to check single-channel readability. */
export function channel(hex: number, c: 'r' | 'g'): number {
  return (c === 'r' ? (hex >> 16) & 255 : (hex >> 8) & 255) / 255;
}
