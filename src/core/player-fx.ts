/**
 * Procedural cartoon motion layered on the avatar: squash & stretch spring, respawn pop and the
 * flop tumble (forward flip → pancake squash → jelly wobble → pop up). Never a physics ragdoll.
 */
import type { PlayerModel } from './player-model';
import { MOVE } from './tuning';

const TAU = Math.PI * 2;

/** Flop pose at time t (0..duration). Pure; exported for tests. */
export function flopPose(t: number, duration: number = MOVE.flopDuration): { flip: number; twist: number; hop: number; sy: number; sxz: number } {
  const u = Math.min(1, Math.max(0, t / duration));
  const flipEnd = 0.45;
  const landEnd = 0.62;
  const wobbleEnd = 0.85;
  if (u < flipEnd) {
    const k = u / flipEnd;
    const e = 1 - (1 - k) * (1 - k);
    return { flip: e * TAU, twist: e * Math.PI * 0.5, hop: 4 * k * (1 - k) * 0.7, sy: 1 + 0.15 * Math.sin(k * Math.PI), sxz: 1 };
  }
  if (u < landEnd) {
    // Pancake! (cartoon squash, robot is fine)
    const k = (u - flipEnd) / (landEnd - flipEnd);
    const sq = Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5);
    return { flip: TAU, twist: Math.PI * 0.5, hop: 0, sy: 1 - 0.5 * sq, sxz: 1 + 0.35 * sq };
  }
  if (u < wobbleEnd) {
    const k = (u - landEnd) / (wobbleEnd - landEnd);
    const w = Math.sin(k * Math.PI * 4) * (1 - k) * 0.25;
    return { flip: TAU, twist: Math.PI * 0.5 * (1 - k), hop: 0, sy: 0.5 + 0.5 * k + w, sxz: 1.35 - 0.35 * k - w * 0.5 };
  }
  // Pop back up with a stretch.
  const k = (u - wobbleEnd) / (1 - wobbleEnd);
  const s = Math.sin(k * Math.PI);
  return { flip: TAU, twist: 0, hop: 0.25 * s, sy: 1 + 0.25 * s, sxz: 1 - 0.12 * s };
}

export interface PlayerFx {
  /** Landing/jump impulse: negative squashes, positive stretches. */
  kick(amount: number): void;
  pop(): void;
  startFlop(): void;
  readonly flopping: boolean;
  update(dt: number): void;
  reset(): void;
}

export function createPlayerFx(model: PlayerModel): PlayerFx {
  let sq = 0;
  let sqVel = 0;
  let popT = 1;
  let flopT = -1;

  return {
    kick(amount) {
      sqVel += amount;
    },
    pop() {
      popT = 0;
    },
    startFlop() {
      flopT = 0;
    },
    get flopping() {
      return flopT >= 0;
    },
    reset() {
      sq = sqVel = 0;
      flopT = -1;
      popT = 1;
      model.spin.rotation.set(0, 0, 0);
      model.spin.position.y = model.centre;
      model.squash.scale.set(1, 1, 1);
    },
    update(dt) {
      // Damped spring for squash/stretch.
      const k = 260;
      const c = 16;
      sqVel += (-k * sq - c * sqVel) * dt;
      sq += sqVel * dt;
      sq = Math.max(-0.45, Math.min(0.45, sq));

      let sy = 1 + sq;
      let sxz = 1 - sq * 0.5;
      let flip = 0;
      let twist = 0;
      let hop = 0;
      if (flopT >= 0) {
        flopT += dt;
        const p = flopPose(flopT);
        flip = p.flip;
        twist = p.twist;
        hop = p.hop;
        sy *= p.sy;
        sxz *= p.sxz;
        if (flopT >= MOVE.flopDuration) {
          flopT = -1;
          flip = twist = hop = 0;
        }
      }
      let scale = 1;
      if (popT < 1) {
        popT = Math.min(1, popT + dt / 0.4);
        // Elastic overshoot from small to full size.
        const t = popT;
        scale = 1 - Math.pow(2, -9 * t) * Math.cos(t * Math.PI * 3) * 0.8;
      }
      model.squash.scale.set(sxz * scale, sy * scale, sxz * scale);
      model.spin.rotation.set(flip % TAU, twist, 0);
      model.spin.position.y = model.centre + hop;
    },
  };
}
