/**
 * Visual-only tricks for the player avatar: flips/spins about the BODY CENTRE and a big
 * squash-and-stretch, layered on top of what the core controller sets each frame.
 *
 * Core builds `object → squash (feet) → spin (body centre)` and re-sets both groups every frame, so
 * multiplying after `core.update` never accumulates and never fights the controller.
 *
 * WANTED CORE API (so this stops relying on the group layout):
 *   PlayerApi.setVisualRotation(q: THREE.Quaternion | null): void   // applied about the body centre
 *   PlayerApi.setVisualStretch(s: number): void                     // extra squash(-)/stretch(+) 0..1
 */
import * as THREE from 'three';
import type { PlayerApi } from '../types';

export interface PlayerVisualHook {
  setVisualRotation?: (q: THREE.Quaternion | null) => void;
  setVisualStretch?: (s: number) => void;
}

export class PlayerVisual {
  /** Extra stretch (+) / squash (-), a damped spring. */
  stretch = 0;
  private stretchV = 0;
  private pitch = 0;
  private yaw = 0;
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly squash: THREE.Object3D | null;
  private readonly spin: THREE.Object3D | null;

  constructor(private readonly player: PlayerApi) {
    const sq = player.object.children[0] ?? null;
    this.squash = sq;
    this.spin = sq?.children[0] ?? null;
  }

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
    this.stretchV += (-170 * this.stretch - 11 * this.stretchV) * dt;
    this.stretch += this.stretchV * dt;
    this.stretch = Math.max(-0.55, Math.min(0.75, this.stretch));
    const hook = this.player as unknown as PlayerVisualHook;
    const tricking = this.pitch !== 0 || this.yaw !== 0;
    const stretching = Math.abs(this.stretch) > 0.004 || Math.abs(this.stretchV) > 0.02;
    if (!tricking && !stretching) return;
    if (hook.setVisualRotation && hook.setVisualStretch) {
      this.e.set(this.pitch, this.yaw, 0);
      hook.setVisualRotation(this.q.setFromEuler(this.e));
      hook.setVisualStretch(this.stretch);
      return;
    }
    if (tricking) {
      this.e.set(this.pitch, this.yaw, 0);
      this.q.setFromEuler(this.e);
      (this.spin ?? this.player.object).quaternion.premultiply(this.q);
    }
    if (stretching && this.squash) {
      const s = this.stretch;
      this.squash.scale.multiply(new THREE.Vector3(1 - s * 0.5, 1 + s, 1 - s * 0.5));
    }
  }
}
