/** The contract between the carnival row (index.ts) and each booth game. */
import type * as THREE from 'three';
import type { GameContext, InputState, PlayerAnim } from '../../../types';
import type { CarnivalFx } from '../fx';
import type { HowStep } from '../hud';
import type { GameId } from '../layout';
import type { PictoId } from '../picto';
import type { Rng } from '../rng';

export interface GameEnv {
  readonly ctx: GameContext;
  /** Booth frame (origin at the counter front, +Z towards the player). Both-eye props go here. */
  readonly booth: THREE.Group;
  /**
   * Weak-eye-only root, already registered with `ctx.vision` as WeakOnly and placed in the booth
   * frame. Children use booth-frame coordinates. Never add these objects to `booth`.
   */
  readonly weak: THREE.Group;
  readonly fx: CarnivalFx;
  /** Booth frame → world (in place). */
  toWorld(v: THREE.Vector3): THREE.Vector3;
  /**
   * Static both-eye dressing, merged into the row's single mesh (no extra draw call). Booth-frame
   * matrix. Only during construction. `selfLit` 0..1 keeps it bright at dusk.
   */
  addStatic(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, m: THREE.Matrix4, selfLit?: number): void;
  /** A pictogram quad (`size` m, facing +Z of `m`), merged into the row's sign mesh. Construction only. */
  addSign(id: PictoId, m: THREE.Matrix4, size?: number): void;
}

/** What a game sees of the running round. Contestant 0 is the player, 1 and 2 the friends. */
export interface RoundApi {
  /** Seconds since GO. */
  readonly t: number;
  /** Seconds left (Infinity for games without a clock). */
  readonly left: number;
  readonly scores: readonly number[];
  readonly rng: Rng;
  /** Aim (radians) relative to straight into the booth: yaw + = left, pitch + = up. */
  readonly aim: { yaw: number; pitch: number };
  /** Player offset from the stand spot (booth frame), applied by the row (dodge lanes, hops). */
  readonly playerOffset: THREE.Vector3;
  /** Add points; `who` 0 = player. Shows the pop and bumps the chip. */
  score(who: number, points: number): void;
  /** Friend `i` (0 or 1) plays an animation, back to idle after `hold` s. */
  friendAct(i: number, anim: PlayerAnim | 'emote', hold?: number): void;
  /** Friend `i` booth-frame position (live). */
  friendPos(i: number): THREE.Vector3;
  /** Player animation for `hold` s (then idle). */
  playerAct(anim: PlayerAnim, hold?: number): void;
  /** Visual squash/stretch of the player (−0.9..2, 0 = none). */
  playerStretch(s: number): void;
  /** HUD power meter 0..1 (null hides). */
  meter(v: number | null, mark?: number | null): void;
  /** End the round now (turn-based games). */
  finish(): void;
  /** Stall-keeper reacts. */
  keeperCheer(big?: boolean): void;
  /**
   * The player fumbled (a wild throw, an empty scoop, a hop in mid-air): a short comic "oops"
   * stun with no input (default 0.8 s). Mashing costs time, so the skill is what wins.
   */
  fumble(seconds?: number): void;
  /** Seconds of stun left (the row blocks the player's input while > 0). */
  readonly stunned: number;
}

export interface BoothGame {
  readonly id: GameId;
  /** Seconds of play; 0 = the game calls `finish()` itself. */
  readonly duration: number;
  /** Player score for 2 and 3 stars (1 star for playing). */
  readonly thresholds: readonly [number, number];
  readonly camera: { distance: number; height: number; fov: number; lookAhead: number };
  /** Aim limits (radians); null = no aiming (the controller keeps the player facing the booth). */
  readonly aimLimits: { yaw: number; pitchMin: number; pitchMax: number } | null;
  readonly how: readonly HowStep[];
  /** Ambient animation while the player is near (cheap). */
  idle(dt: number): void;
  begin(r: RoundApi): void;
  update(dt: number, input: Readonly<InputState>, r: RoundApi): void;
  /** Synthetic input that plays the game well (test autopilot). Aim is set directly on `r.aim`. */
  autopilot(dt: number, r: RoundApi): Partial<InputState>;
  /** Round over (time up, finished or abandoned): stop throws, keep the booth tidy. */
  end(r: RoundApi): void;
  dispose(): void;
}

export type GameFactory = (env: GameEnv) => BoothGame;
