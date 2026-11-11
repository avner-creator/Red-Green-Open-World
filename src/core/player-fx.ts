/**
 * Procedural cartoon motion layered on the avatar: squash & stretch spring, respawn pop and the
 * flop tumble (forward flip → pancake squash → jelly wobble → pop up). Never a physics ragdoll.
 */
import * as THREE from 'three';
import type { PlayerModel } from './player-model';
import { springStep } from './characters/wobble-math';
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
  /**
   * Extra activity pose layered on top (PlayerApi.setVisualRotation/setVisualStretch): `q` about
   * the body centre (applied after the flop tumble), `stretch` + = tall and thin, - = flat and wide.
   * Written immediately, so it shows on the frame it is set.
   */
  setExtra(q: THREE.Quaternion | null, stretch: number): void;
  /**
   * Skill pose layer (core skills only): `flip` about X (forward flip / lean), `spin` about Y,
   * `stretch` like setExtra's. Written on the next update.
   */
  setSkillPose(flip: number, spin: number, stretch: number): void;
  /** Body-frame acceleration for the lean/stumble springs (forward, side), m/s². Visual only. */
  lean(fwd: number, side: number): void;
  /** Forward stumble impulse (radians-ish) after a hard landing. */
  stumble(amount: number): void;
}

export function createPlayerFx(model: PlayerModel): PlayerFx {
  let sq = 0;
  let sqVel = 0;
  let popT = 1;
  let flopT = -1;
  // Base pose from the springs/flop, kept so the extra layer can be re-applied at any time.
  let baseSy = 1;
  let baseSxz = 1;
  let baseFlip = 0;
  let baseTwist = 0;
  let baseHop = 0;
  const extraQ = new THREE.Quaternion();
  let hasExtraQ = false;
  let extraStretch = 0;
  let skillFlip = 0;
  let skillSpin = 0;
  let skillStretch = 0;
  const leanP = { x: 0, v: 0 };
  const leanR = { x: 0, v: 0 };
  let leanFwd = 0;
  let leanSide = 0;

  const write = (): void => {
    const st = Math.max(-0.9, extraStretch + skillStretch);
    model.squash.scale.set(baseSxz * (1 - st * 0.5), baseSy * (1 + st), baseSxz * (1 - st * 0.5));
    const lean = flopT >= 0 ? 0 : 1;
    model.spin.rotation.set(baseFlip + skillFlip + leanP.x * lean, baseTwist + skillSpin, leanR.x * lean);
    if (hasExtraQ) model.spin.quaternion.premultiply(extraQ);
    model.spin.position.y = model.centre + baseHop;
  };

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
      baseSy = baseSxz = 1;
      baseFlip = baseTwist = baseHop = 0;
      hasExtraQ = false;
      extraStretch = 0;
      skillFlip = skillSpin = skillStretch = 0;
      leanP.x = leanP.v = leanR.x = leanR.v = 0;
      leanFwd = leanSide = 0;
      write();
    },
    lean(fwd, side) {
      leanFwd = fwd;
      leanSide = side;
    },
    stumble(amount) {
      leanP.v += amount * 14;
    },
    setSkillPose(flip, spin, stretch) {
      skillFlip = flip;
      skillSpin = spin;
      skillStretch = stretch;
    },
    setExtra(q, stretch) {
      hasExtraQ = q !== null;
      if (q) extraQ.copy(q);
      extraStretch = Number.isFinite(stretch) ? Math.max(-0.9, Math.min(2, stretch)) : 0;
      write();
    },
    update(dt) {
      // Lean & stumble: the body tips with braking/turning and bobs back (inertia, cartoon-soft).
      springStep(leanP, -0.35 * leanFwd, 7, 0.32, dt, 0.18);
      springStep(leanR, 0.3 * leanSide, 7, 0.35, dt, 0.14);
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
      baseSy = sy * scale;
      baseSxz = sxz * scale;
      baseFlip = flip % TAU;
      baseTwist = twist;
      baseHop = hop;
      write();
    },
  };
}
