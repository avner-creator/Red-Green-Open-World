/**
 * Trail rules without three.js: palettes (each must read as bright/dark bands in the red channel
 * alone and in the green channel alone) and how many puffs a stretch of walking emits.
 */
import type { TrailKind } from './catalog';

export const MAX_TRAIL_PARTICLES = 60;

/** sRGB hex colours. Rainbow cycles red, yellow, green, blue: R is bright-bright-dark-dark, G is dark-bright-bright-dark. */
export const TRAIL_PALETTES: Readonly<Record<TrailKind, readonly number[]>> = {
  sparkle: [0xffe14a, 0xffffff, 0x3a2cff, 0xffa91f],
  bubbles: [0xffffff, 0x8fe8ff, 0x1d6fd0, 0xe6fbff],
  rainbow: [0xff2a2a, 0xffe619, 0x2ee05a, 0x2a40ff],
};

export interface TrailSpec {
  /** Metres walked between puffs. */
  spacing: number;
  /** Seconds a puff lives. */
  life: number;
  /** Puff size in metres. */
  size: number;
  /** Upward drift in m/s. */
  rise: number;
}

export const TRAIL_SPECS: Readonly<Record<TrailKind, TrailSpec>> = {
  sparkle: { spacing: 0.4, life: 0.9, size: 0.2, rise: 0.5 },
  bubbles: { spacing: 0.5, life: 1.5, size: 0.22, rise: 0.9 },
  rainbow: { spacing: 0.26, life: 1.1, size: 0.2, rise: 0.0 },
};

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

/** Linear-ish sRGB channel (0..1) of a hex colour: used to check single-channel readability. */
export function channel(hex: number, c: 'r' | 'g'): number {
  return (c === 'r' ? (hex >> 16) & 255 : (hex >> 8) & 255) / 255;
}
