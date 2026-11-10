/**
 * The contract every vehicle kind implements (the buggy and the horses share one manager:
 * enter/exit via E, seat, chase camera, rescue on R, park on a new session).
 */
import type * as THREE from 'three';
import type { IconName, InputState, PlayerAnim, VehicleApi } from '../../types';
import type { ChaseSource } from '../camera';

/** VehicleApi plus a test/debug hook to place the vehicle. */
export interface VehiclePublic extends VehicleApi {
  /** Place upright at `position` (on the ground) facing `yaw`, at rest. */
  teleport(position: THREE.Vector3Like, yaw: number): void;
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
