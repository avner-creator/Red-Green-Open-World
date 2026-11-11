/**
 * Floppy hero: springy secondary motion layered on the clip pose of any catalog character.
 *
 * - Head (and neck) lag behind the body: accelerate and the head tips back, brake and it nods,
 *   land and it bobs; a sharp turn swings it sideways.
 * - Torso sways a little with the same forces (a softer, slower spring).
 * - Arms flail in the air (each its own rhythm) and swing loosely after hard stops.
 * - Tails (the T-rex) whip after turns and sway at rest.
 *
 * Purely visual: nothing here feeds back into movement, so input stays exact. Additive on the
 * clip pose with save/restore (like the seat layer and the rider pose), so bones the clip does not
 * key never drift. Rotations are about the character's own axes (side = X, up = Y, forward = Z).
 */
import * as THREE from 'three';
import { springStep } from './wobble-math';
import type { Spring } from './wobble-math';

export interface WobbleDrive {
  /** Body-frame acceleration, m/s² (side = +X, up, forward = +Z). Clamped by the caller. */
  side: number;
  up: number;
  fwd: number;
  /** Yaw rate, rad/s. */
  yawRate: number;
  /** 0..1 how airborne (arms flail). */
  air: number;
  /** 0..1 overall wobble strength (lower in vehicles). */
  amount: number;
  /** 0..1 arm freedom (0 when the arms hold reins / a wheel). */
  arms: number;
}

export interface Wobble {
  /** Put the clip pose back (call before the mixer update). */
  restore(): void;
  /** Advance the springs and pose the bones (call after the mixer update). */
  apply(dt: number, d: WobbleDrive): void;
  /** Current head offsets (pitch, roll), radians: for tests. */
  readonly head: { pitch: number; roll: number };
}

const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const Z = new THREE.Vector3(0, 0, 1);
const _objQ = new THREE.Quaternion();
const _parQ = new THREE.Quaternion();
const _dq = new THREE.Quaternion();
const _wq = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

interface Saved {
  bone: THREE.Object3D;
  q: THREE.Quaternion;
  /** What we wrote: if someone else rewrote the bone since, we leave it alone on restore. */
  wrote: THREE.Quaternion;
}

const spring = (): Spring => ({ x: 0, v: 0 });

export function createWobble(object: THREE.Object3D): Wobble {
  // Bones first (a mesh may share a bone's name); glTF loading strips dots ("UpperArm.L" → "UpperArmL").
  const find = (...names: string[]): THREE.Object3D | null => {
    for (const n of names) {
      for (const name of [n, n.replace(/\./g, '')]) {
        let bone: THREE.Object3D | null = null;
        object.traverse((o) => {
          if (!bone && o.name === name && (o as THREE.Bone).isBone) bone = o;
        });
        if (bone) return bone;
      }
    }
    return null;
  };
  const headBone = find('Head');
  const neckBone = find('Neck');
  const torsoBone = find('Torso', 'Shoulders');
  const armL = find('UpperArm.L');
  const armR = find('UpperArm.R');
  const tail: THREE.Object3D[] = [];
  for (let i = 1; i <= 6; i++) {
    const b = find(`Tail${i}`);
    if (b) tail.push(b);
  }
  // Which side each arm hangs on (in the character's own frame), measured on first use.
  let armSide: [number, number] | null = null;

  const saved: Saved[] = [];
  const pool: Saved[] = [];
  const headP = spring();
  const headR = spring();
  const torsoP = spring();
  const torsoR = spring();
  const tailY = spring();
  const tailP = spring();
  const armSwing = spring();
  let t = Math.random() * 10;

  const rotate = (bone: THREE.Object3D | null, axis: THREE.Vector3, angle: number): void => {
    if (!bone || Math.abs(angle) < 1e-4) return;
    let s = saved.find((e) => e.bone === bone);
    if (!s) {
      s = pool.pop() ?? { bone, q: new THREE.Quaternion(), wrote: new THREE.Quaternion() };
      s.bone = bone;
      s.q.copy(bone.quaternion);
      saved.push(s);
    }
    // World axis of the character frame → bone-local rotation: local' = P⁻¹ · dq · P · local.
    _axis.copy(axis).applyQuaternion(_objQ);
    _dq.setFromAxisAngle(_axis, angle);
    if (bone.parent) bone.parent.matrixWorld.decompose(_p, _parQ, _s);
    else _parQ.identity();
    _wq.copy(_parQ).invert().multiply(_dq).multiply(_parQ);
    bone.quaternion.premultiply(_wq).normalize();
    s.wrote.copy(bone.quaternion);
  };

  const api: Wobble = {
    head: { pitch: 0, roll: 0 },
    restore() {
      for (const s of saved) {
        if (s.bone.quaternion.equals(s.wrote)) s.bone.quaternion.copy(s.q);
        pool.push(s);
      }
      saved.length = 0;
    },
    apply(dt, d) {
      t += dt;
      const k = d.amount;
      // Springs: force = gain × acceleration (inertia: the head lags the body).
      const hp = springStep(headP, (-0.9 * d.fwd + 0.25 * d.up) * k, 11, 0.24, dt, 0.5);
      const hr = springStep(headR, (0.9 * d.side + 1.2 * d.yawRate) * k, 10, 0.24, dt, 0.45);
      const tp = springStep(torsoP, (-0.3 * d.fwd + 0.1 * d.up) * k, 7.5, 0.4, dt, 0.22);
      const tr = springStep(torsoR, (0.3 * d.side + 0.5 * d.yawRate) * k, 7, 0.4, dt, 0.2);
      const ty = springStep(tailY, (-0.5 * d.side - 2.4 * d.yawRate) * k, 6, 0.22, dt, 0.7);
      const tpp = springStep(tailP, (0.35 * d.up + 0.25 * d.fwd) * k, 6.5, 0.25, dt, 0.5);
      const sw = springStep(armSwing, -0.8 * d.fwd * k, 8, 0.2, dt, 0.6);
      api.head.pitch = hp;
      api.head.roll = hr;
      if (hp === 0 && hr === 0 && tp === 0 && tr === 0 && ty === 0 && d.air * d.arms === 0 && tail.length === 0) return;

      // Fresh world matrices for the clip pose (the axes below need the parents' rotations).
      object.updateMatrixWorld(true);
      object.matrixWorld.decompose(_p, _objQ, _s);

      rotate(torsoBone, X, tp);
      rotate(torsoBone, Z, tr);
      if (torsoBone) torsoBone.updateMatrixWorld(true);
      if (neckBone && neckBone !== headBone) {
        rotate(neckBone, X, hp * 0.4);
        rotate(neckBone, Z, hr * 0.4);
        neckBone.updateMatrixWorld(true);
      }
      rotate(headBone, X, hp * (neckBone ? 0.6 : 1));
      rotate(headBone, Z, hr * (neckBone ? 0.6 : 1));

      if (armL && armR && d.arms > 0) {
        if (!armSide) {
          armL.getWorldPosition(_p);
          object.worldToLocal(_p);
          const l = Math.sign(_p.x) || 1;
          armSide = [l, -l];
        }
        const air = d.air * d.arms;
        const arms: [THREE.Object3D, number, number][] = [
          [armL, armSide[0], 0],
          [armR, armSide[1], 2.1],
        ];
        for (const [bone, side, ph] of arms) {
          // Flail: up-and-out flaps plus a forward/back paddle, each arm on its own beat.
          const out = air * (0.75 + 0.45 * Math.sin(t * 9.5 + ph));
          const paddle = air * 0.7 * Math.sin(t * 6.8 + ph * 1.7) + sw * d.arms;
          rotate(bone, Z, side * out);
          rotate(bone, X, paddle);
        }
      }

      if (tail.length) {
        if (torsoBone) torsoBone.updateMatrixWorld(true);
        for (let i = 0; i < tail.length; i++) {
          const b = tail[i] as THREE.Object3D;
          b.parent?.updateMatrixWorld(false);
          // Whip: later segments lag (phase) and swing more.
          const lag = Math.sin(t * 2.2 - i * 0.7) * 0.05;
          rotate(b, Y, (ty * (0.25 + 0.12 * i) + lag) * k);
          rotate(b, X, tpp * (0.2 + 0.08 * i));
          b.updateMatrixWorld(false);
        }
      }
    },
  };
  return api;
}
