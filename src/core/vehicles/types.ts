/**
 * The contract every vehicle kind implements (the buggy and the horses share one manager:
 * enter/exit via E, seat, chase camera, rescue on R, park on a new session).
 */
import type * as THREE from 'three';
import type { IconName, InputState, PlayerAnim, VehicleApi, VehiclesApi } from '../../types';
import type { ChaseSource } from '../camera';

/** VehicleApi plus a test/debug hook to place the vehicle. */
export interface VehiclePublic extends VehicleApi {
  /** Place upright at `position` (on the ground) facing `yaw`, at rest. */
  teleport(position: THREE.Vector3Like, yaw: number): void;
  /** Buggy-only extension hooks (workshop upgrades, race boosts). Absent on other kinds. */
  readonly buggy?: BuggyHooks;
}

/** Gameplay/visual tuning that upgrades (the buggy workshop) may change. */
export interface BuggyTuning {
  /** Visual wheel size (1 = stock). The body rides higher to match; physics is unchanged. */
  wheelScale: number;
  /** Hop (Space) height multiplier. */
  hopScale: number;
  /** Bounce off bumps (walls, props, rivals) multiplier. */
  bounceScale: number;
  /** Grass and dirt are as fast as the road. */
  offroadAsRoad: boolean;
}

export const STOCK_TUNING: Readonly<BuggyTuning> = { wheelScale: 1, hopScale: 1, bounceScale: 1, offroadAsRoad: false };

/**
 * Small additive hooks on the buggy for activities (stream N: workshop and race). Callback slots
 * hold one handler each; the workshop owns `onHorn`/`onSkill`/`onHop`/`onBump`.
 */
export interface BuggyHooks {
  readonly tuning: Readonly<BuggyTuning>;
  setTuning(patch: Partial<BuggyTuning>): void;
  /** Speed burst: top speed +`extra` m/s for `seconds`, plus an instant forward `kick` (m/s). */
  boost(extra: number, seconds: number, kick?: number): void;
  /** Seconds of boost left (0 = none). */
  readonly boostLeft: number;
  /** F while driving: replaces the default horn sound when set. */
  onHorn: (() => void) | null;
  /** Skill key (Q / LB / touch skill button) while driving. */
  onSkill: (() => void) | null;
  /** The buggy hopped (Space while driving). */
  onHop: (() => void) | null;
  /** The buggy bumped into something; `speed` = size of the bump. */
  onBump: ((speed: number) => void) | null;
  /** The leaning/bouncing body (child of `object`): add-on parts go here, chassis space (+Z forward, +Y up). */
  readonly body: THREE.Object3D;
  /** The driver's seat (child of `body`). */
  readonly seat: THREE.Object3D;
  /** True while the player drives it. */
  readonly driven: boolean;
  /** Signed forward speed, m/s. */
  readonly forwardSpeed: number;
  /** Heading (yaw of the nose; facing = (sin, 0, cos)). */
  heading(): number;
  /** Hold still (start grid countdown): the car stays put; throttle only revs the engine. */
  hold: boolean;
}

/** VehiclesApi plus a way for activities to seat the player in a vehicle (race start). */
export interface VehiclesPublic extends VehiclesApi {
  /** Put the player (on foot) into vehicle `id` straight away. Returns false if not possible. */
  board(id: string): boolean;
}

export interface VehicleInternal {
  readonly api: VehiclePublic;
  /** Player mode while on board. */
  readonly mode: 'driving' | 'riding';
  readonly icon: IconName;
  /** The rider's feet go here; the avatar plays `seatAnim`. */
  readonly seat: THREE.Object3D;
  readonly seatAnim: PlayerAnim;
  readonly chase: ChaseSource;
  /** Where the E prompt floats. */
  promptPosition(): THREE.Vector3;
  /** `input` is null when nobody is driving (or the game is paused/title). */
  update(dt: number, input: Readonly<InputState> | null): void;
  onEnter(): void;
  onExit(): void;
  /** A free spot beside the vehicle to step off to. */
  exitSpot(): { position: THREE.Vector3; yaw: number };
  /** Unstick: upright on the nearest road (or last safe spot). */
  rescue(): void;
  /** Back to its parking spot (new session). */
  park(): void;
  /** R keeps the rider on board (the horse): `rescue` moves vehicle and rider together. */
  readonly rescueKeepsRider?: boolean;
  /** Called every frame before the player's animation update (undo procedural rider posing). */
  beforePlayer?(): void;
  /** Called every frame after the player's update; `riding` = the player is on this vehicle. */
  lateUpdate?(dt: number, riding: boolean): void;
  dispose(): void;
}
