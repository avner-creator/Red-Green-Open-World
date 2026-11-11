/**
 * The one shared sky-ride controller (an ExternalController) used by the stunt plane and the
 * dragon: it takes the player only from walk mode (never from another ride), seats the avatar on the
 * craft's seat with the craft's pitch/roll, reads the stick ("steer where you look" + auto-level),
 * finds the surface under the craft (terrain, roofs, sea) for the no-crash floor, owns the camera
 * override and the wind/engine loops, and hands the player back on the ground in walk mode.
 */
import * as THREE from 'three';
import { PLAYER } from '../../config';
import type { ExternalController, GameContext, InputState } from '../../types';
import { getFlight } from '../flight';
import { clamp } from './flightModel';
import type { FlyControls } from './flightModel';

export interface PilotHooks {
  /** Per-frame ride logic (inside the player's update). Return false to end the ride. */
  step(dt: number, input: Readonly<InputState>): boolean;
  /** Control was taken away or the ride ended (always called once). */
  onRelease(): void;
}

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
const tmpV = new THREE.Vector3();
const seatPos = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

export class SkyPilot {
  private hooks: PilotHooks | null = null;
  private cameraOwned = false;
  /** Accumulated vertical look (mouse/right stick), eases back to 0. */
  private lookPitch = 0;
  private sinceLook = 99;
  private readonly controller: ExternalController;

  constructor(private readonly ctx: GameContext) {
    this.controller = {
      update: (dt, input) => {
        const h = this.hooks;
        if (!h) return false;
        try {
          return h.step(dt, input);
        } catch (err) {
          console.error('sky ride failed', err);
          return false;
        }
      },
      onRelease: () => this.finish(),
    };
  }

  get active(): boolean {
    return this.hooks !== null;
  }

  /** Can a sky ride start now? Only on foot, playing, and not while another ride owns the player. */
  canTake(): boolean {
    const ctx = this.ctx;
    if (this.hooks) return false;
    if (ctx.session.state.phase !== 'playing') return false;
    if (ctx.player.mode !== 'walk') return false;
    if (getFlight(ctx).active) return false;
    return true;
  }

  /**
   * Pip's back seat on the craft while it flies, published on the player object as
   * `userData.pipSeat` (the buddy seats Pip there; see docs/streams/foam-sky.md). Null clears it.
   */
  setPipSeat(seat: THREE.Object3D | null): void {
    const ud = this.ctx.player.object.userData as { pipSeat?: THREE.Object3D };
    if (seat) ud.pipSeat = seat;
    else delete ud.pipSeat;
  }

  take(hooks: PilotHooks, pipSeat: THREE.Object3D | null = null): boolean {
    if (!this.canTake()) return false;
    this.setPipSeat(pipSeat);
    this.hooks = hooks;
    this.lookPitch = 0;
    this.sinceLook = 99;
    this.ctx.player.setExternalController(this.controller);
    if (this.ctx.player.mode !== 'external') {
      this.hooks = null;
      this.setPipSeat(null);
      return false;
    }
    return true;
  }

  /** End the ride from outside the controller (session end, dispose). */
  release(): void {
    if (!this.hooks) return;
    this.ctx.player.setExternalController(null);
    this.finish();
  }

  private finish(): void {
    const h = this.hooks;
    if (!h) return;
    this.hooks = null;
    this.setPipSeat(null);
    this.ctx.audio.setLoop('wind', 0);
    this.ctx.audio.setLoop('engine', 0);
    this.releaseCamera();
    this.ctx.player.setTilt(0, 0);
    this.ctx.player.setVisualRotation(null);
    h.onRelease();
  }

  setCamera(o: Parameters<GameContext['cameraRig']['setOverride']>[0]): void {
    this.ctx.cameraRig.setOverride(o);
    this.cameraOwned = true;
  }

  releaseCamera(): void {
    if (!this.cameraOwned) return;
    this.ctx.cameraRig.setOverride(null);
    this.cameraOwned = false;
  }

  /**
   * Put the avatar on `seat` (feet there), facing `yaw`, tilted with the craft (`pitchUp` + = nose
   * up, `roll` + = banked right). The tilt pivots about the body centre, so the feet are shifted to
   * keep the hips on the seat.
   */
  seatRider(seat: THREE.Object3D, yaw: number, pitchUp: number, roll: number): void {
    const player = this.ctx.player;
    seat.updateWorldMatrix(true, false);
    seatPos.setFromMatrixPosition(seat.matrixWorld);
    const c = PLAYER.height / 2;
    tmpE.set(-pitchUp, yaw, roll, 'YXZ');
    tmpQ.setFromEuler(tmpE);
    tmpV.set(0, c, 0).applyQuaternion(tmpQ);
    player.position.set(seatPos.x + tmpV.x, seatPos.y + tmpV.y - c, seatPos.z + tmpV.z);
    player.yaw = yaw;
    player.setTilt(-pitchUp, roll);
  }

  /**
   * Stick → flight controls. Keyboard/gamepad/touch move stick turns and pitches (up = nose up);
   * looking around with the mouse / right stick / touch drag steers towards where you look.
   */
  controls(input: Readonly<InputState>, craftYaw: number, dt: number): FlyControls {
    const looking = Math.abs(input.lookX) + Math.abs(input.lookY) > 1e-5;
    this.sinceLook = looking ? 0 : this.sinceLook + dt;
    this.lookPitch = clamp(this.lookPitch - input.lookY * 2.2, -1, 1);
    this.lookPitch *= Math.exp(-(this.sinceLook > 0.25 ? 3 : 0.5) * dt);
    const camYaw = this.ctx.cameraRig.yaw;
    const lookWeight = this.sinceLook < 1.2 ? 0.9 : 0;
    return {
      turn: clamp(input.moveX, -1, 1),
      climb: clamp(input.moveY + this.lookPitch, -1, 1),
      boost: input.sprint,
      lookYaw: lookWeight > 0 ? camYaw : craftYaw,
      lookWeight,
    };
  }

  /** Did the player touch the controls this frame (any stick or look)? */
  static touched(input: Readonly<InputState>): boolean {
    return Math.abs(input.moveX) + Math.abs(input.moveY) > 0.15 || Math.abs(input.lookX) + Math.abs(input.lookY) > 1e-4;
  }

  /**
   * Top of whatever is under (x, z): terrain, the sea surface, and (when close) roofs and other
   * colliders via a short downward ray.
   */
  surface(x: number, y: number, z: number): number {
    const w = this.ctx.world;
    let top = Math.max(w.heightAt(x, z), w.waterLevel);
    if (y - top < 30) {
      const hit = this.ctx.physics.raycast(tmpV.set(x, y + 0.5, z), DOWN, 32);
      if (hit && hit.point.y > top) top = hit.point.y;
    }
    return top;
  }

  /** Is there a wall straight ahead within `dist` (ray along the travel direction)? */
  wallAhead(from: THREE.Vector3, dir: THREE.Vector3, dist: number): THREE.Vector3 | null {
    const hit = this.ctx.physics.raycast(from, dir, dist);
    if (!hit || hit.normal.y > 0.6) return null;
    return hit.normal;
  }

  dispose(): void {
    this.release();
  }
}

const pilots = new WeakMap<GameContext, SkyPilot>();

/** The one sky pilot per game context (plane and dragon share it, so they never fight). */
export function getSkyPilot(ctx: GameContext): SkyPilot {
  let p = pilots.get(ctx);
  if (!p) {
    p = new SkyPilot(ctx);
    pilots.set(ctx, p);
  }
  return p;
}
