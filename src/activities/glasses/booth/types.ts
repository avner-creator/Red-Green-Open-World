/**
 * Booth kit contract: what a mini-game hands the kit (`BoothSetup`: its demo, its booth spec and
 * its round rules) and what it gets back (`BoothKit`). See ./README.md for the walk-through.
 *
 * Coordinates are SITE-LOCAL metres in the mini-game's own frame (`BoothSetup.frame`, default the
 * site): +Z towards the approach (where the child comes from), +X to the child's right, y up from
 * the ground under each part.
 */
import type { GlassesTier } from '../../../types';
import type * as THREE from 'three';
import type { BoothPrompt } from './cells';
import type { DemoKit } from './draw';

export type { BoothPrompt, PromptId } from './cells';

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/**
 * A looping flipbook shown on the booth's picture board: a little hero doing the action. 4–6
 * frames, drawn once with Canvas2D into the shared booth atlas. GENERIC: it must never show the
 * current answer (it is drawn once at boot, so it cannot).
 */
export interface BoothDemo {
  /** Number of frames (1..DEMO_MAX_FRAMES = 6). */
  frames: number;
  /** Frames per second of the loop (default 2.5). */
  fps?: number;
  /** Seconds to hold the last frame before looping (default 0.8). */
  hold?: number;
  /**
   * Draw frame `frame` into a `size`×`size` px square at the context origin (already clipped).
   * Use the `kit` helpers so every booth shares one style; work in 100×100 units via
   * `kit.units(c, size)` if you like (the helpers take 100-unit coordinates).
   */
  draw(c: CanvasRenderingContext2D, frame: number, size: number, kit: DemoKit): void;
}

/** A flat decal on the ground (part of the booth's single mesh). */
export interface BoothDecal {
  kind: 'chevron' | 'footprints';
  x: number;
  z: number;
  /** Edge length (m). */
  size: number;
  /** Rotation about Y (radians); 0 = the picture's top points to −Z (away from the approach). */
  yaw: number;
}

export interface BoothSpec {
  /** Marquee: centre of its front edge on the ground, and the way it faces (0 = +Z). */
  marquee: { x: number; z: number; yaw: number };
  /** Number of round lamps on the marquee (one per try, 1..6). */
  lamps: number;
  /**
   * Start pad on the ground. `walkIn`: stepping onto it starts a round (footprint face);
   * otherwise the child presses Use on it (ring face + the device's button pictogram above it).
   * Use always works on either kind.
   */
  pad: { x: number; z: number; r?: number; walkIn: boolean };
  /** Where the bobbing prompt floats by default (above the pad if left out). */
  prompt?: V3;
  /**
   * The prompt shown during a try (e.g. 'arch': run through an arch) and where (default: floating
   * in front of the booth's picture board, which is the safest place: never over the play).
   */
  playPrompt: BoothPrompt;
  playPromptAt?: V3;
  /** Edge length of the play prompt at `playPromptAt` (m, default 1.25). */
  playPromptSize?: number;
  /** Where the 3-2-1-GO digits pop up (above the marquee's picture board if left out). */
  countdown?: V3;
  /** Ground decals (chevrons leading to the play, footprints). */
  decals?: readonly BoothDecal[];
}

/** Gems paid for a round: `table[tier][hits]` (array length = tries + 1). */
export type PrizeTable = Readonly<Record<GlassesTier, readonly number[]>>;

export interface RoundRules {
  /** Tries per round (= lamps). In a timed round: the most results that count (lamps). */
  tries: number;
  /**
   * Timed round: one play phase of this many seconds instead of tries with beats; every
   * `report` lights the next lamp; the round ends when the time is up, all lamps are lit or the
   * game calls `kit.finish()`. The prize is by hits as usual.
   */
  time?: number;
  /** Hits needed for any prize. */
  minHits: number;
  prize: PrizeTable;
  /**
   * What happens after a try's short beat: 'next' starts the next try at once; 'pad' waits until
   * the child is back on the start pad (the "back to the pad" prompt shows meanwhile).
   */
  between: 'next' | 'pad';
  /** Seconds per countdown digit (3, 2, 1) and for GO. */
  countStep?: number;
  goTime?: number;
  /** Seconds the result of a try stays on show before the round moves on. */
  beat?: number;
  /** Celebration, prize flight and cool-down lengths (s). */
  celebrate?: number;
  prizeTime?: number;
  cooldown?: number;
  /** A round in play with no result for this long is cancelled quietly (s). */
  stall?: number;
  /** Leaving the site centre by more than this cancels a round (m). */
  leaveRadius?: number;
  /** Tier steps (per round): up when hits ≥ upAt (default: all tries), down when hits < downBelow (default minHits). */
  upAt?: number;
  downBelow?: number;
}

/** What the mini-game does when the kit asks. */
export interface BoothHooks {
  /** Try `index` (0-based) begins: show the question (new answer, symbols, layer objects). */
  onTry(index: number, tier: GlassesTier): void;
  /** The round is over or cancelled: hide the question, put the play back to its idle look. */
  onIdle(): void;
  /** Optional: a try's result was shown (after `report`), e.g. to dim the wrong choices. */
  onResult?(index: number, hit: boolean): void;
}

export interface BoothSetup {
  /** The mini-game's frame in world space (default: the site centre and yaw). */
  frame?: { x: number; z: number; yaw: number };
  /** Ground height under a frame-local point, relative to the site's y (default: the terrain). */
  ground?: (x: number, z: number) => number;
  spec: BoothSpec;
  demo: BoothDemo;
  rules: RoundRules;
  hooks: BoothHooks;
  /**
   * Where the "back to the pad" prompt floats while the round waits for the child (frame-local;
   * default: above the pad). Gates puts it ahead of the child, beyond the arch they ran through.
   */
  waitPromptAt?: () => V3;
  /**
   * The mini-game's own static both-eye geometry, merged into the booth's ONE mesh (frame-local
   * metres, y relative to the site's y; UVs in the booth atlas: `swatchUv`, `cellUv`, …).
   */
  extra?: readonly THREE.BufferGeometry[];
  /**
   * Where the camera turns for the celebration (frame-local; default: in front of the booth's
   * picture board). A function is asked when the tries end (it may use where the child is).
   */
  celebrateAt?: V3 | (() => V3);
  /**
   * The play's focus: what the hero faces from the pad during a try (frame-local; default the
   * frame's origin). Used for the pad-camera checks (`kit.padView()`, the prompt e2e check).
   */
  look?: { x: number; z: number };
}
