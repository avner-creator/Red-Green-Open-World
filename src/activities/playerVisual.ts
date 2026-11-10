/**
 * Visual-only tricks for the player avatar: flips/spins about the BODY CENTRE and a big
 * squash-and-stretch, through PlayerApi.setVisualRotation / setVisualStretch.
 *
 * Core clears both whenever an external controller is released, on respawn and on flop; this
 * class also clears them itself once the trick has ended and the spring has settled, and never
 * writes during a flop (the flop tumble owns the pose).
 */
import * as THREE from 'three';
import type { PlayerApi } from '../types';

export class PlayerVisual {
  /** Extra stretch (+) / squash (-), a damped spring. */
  stretch = 0;
  private stretchV = 0;
  private pitch = 0;
  private yaw = 0;
  /** Something non-neutral was written to the player last frame. */
  private applied = false;
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');

  constructor(private readonly player: PlayerApi) {}

  /** Kick the stretch spring (positive = tall and thin, negative = flat and wide). */
  kick(amount: number): void {
    this.stretchV += amount;
  }

  setTrick(pitch: number, yaw: number): void {
    this.pitch = pitch;
    this.yaw = yaw;
  }

  clear(): void {
    this.pitch = this.yaw = 0;
  }

  /** Advance the spring and write the result onto the avatar. Call once per frame after core. */
  update(dt: number): void {
    const player = this.player;
    if (player.mode === 'flop') {
      // Core already cleared the layer when the flop started; drop our spring too.
      this.stretch = this.stretchV = 0;
      this.pitch = this.yaw = 0;
      this.applied = false;
      return;
    }
    this.stretchV += (-170 * this.stretch - 11 * this.stretchV) * dt;
    this.stretch += this.stretchV * dt;
    this.stretch = Math.max(-0.55, Math.min(0.75, this.stretch));
    const tricking = this.pitch !== 0 || this.yaw !== 0;
    const stretching = Math.abs(this.stretch) > 0.004 || Math.abs(this.stretchV) > 0.02;
    if (!tricking && !stretching) {
      this.stretch = this.stretchV = 0;
      if (this.applied) {
        player.setVisualRotation(null);
        player.setVisualStretch(0);
        this.applied = false;
      }
      return;
    }
    if (tricking) {
      this.e.set(this.pitch, this.yaw, 0);
      player.setVisualRotation(this.q.setFromEuler(this.e));
    } else {
      player.setVisualRotation(null);
    }
    player.setVisualStretch(stretching ? this.stretch : 0);
    this.applied = true;
  }
}
