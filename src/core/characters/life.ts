/**
 * The "alive" layer on top of the clips: breathing, bouncy squash & stretch on every step, a
 * wandering head and eyes when idle, blinks, springy ears/tails/antennae that lag behind the body,
 * a little dance when left alone, and a face that follows what the hero is doing.
 *
 * Pure presentation: never moves the character's root or touches physics. Bone offsets are
 * re-applied every frame after the mixer and undone before the next mixer update, so bones the
 * clip does not key never drift.
 */
import * as THREE from 'three';
import type { PlayerAnim } from '../../types';
import type { FaceRig, FaceState } from './face';

export type LifeAnim = PlayerAnim | 'emote';

/** The face each animation wears (overridable for a moment with `express`). */
export const ANIM_FACE: Readonly<Record<LifeAnim, FaceState>> = {
  idle: 'neutral',
  walk: 'neutral',
  run: 'determined',
  jump: 'wow',
  fall: 'wow',
  flop: 'giggle',
  dance: 'happy',
  wave: 'happy',
  cheer: 'happy',
  sit: 'neutral',
  emote: 'happy',
};

/** Seconds of standing still before the hero does a little dance on its own. */
export const FIDGET_AFTER = 7;
/** Seconds of standing still before the eyes get sleepy. */
export const SLEEPY_AFTER = 22;

export interface LifeOptions {
  /** Springy bones (ears, tails, antennae), from the root of each chain. */
  springs?: readonly string[];
  /** Head bone for look-around. */
  head?: string;
  /** Base model scale (squash/stretch multiplies it). */
  scale: number;
  /** Step frequency per clip cycle (2 for bipeds). */
  steps?: number;
}

interface SpringBone {
  bone: THREE.Object3D;
  saved: THREE.Quaternion;
  /** Depth in its chain (later links swing more). */
  depth: number;
}

export interface Life {
  /** Called by the loader after the mixer: `anim` = current anim, `phase` = 0..1 through its clip. */
  update(dt: number, anim: LifeAnim | null, phase: number, rate: number): void;
  /** Undo bone offsets (call before `mixer.update`). */
  restore(): void;
  /** Wear a face for `seconds` (then back to the animation's face). */
  express(state: FaceState, seconds: number): void;
  /** True while the idle fidget dance should play. */
  readonly fidget: boolean;
  /** Seconds idle so far. */
  readonly idleTime: number;
}

export function createLife(model: THREE.Object3D, face: FaceRig | null, opt: LifeOptions): Life {
  const springs: SpringBone[] = [];
  for (const name of opt.springs ?? []) {
    let b = model.getObjectByName(name);
    let depth = 0;
    // Walk down the chain (first child bone each step) so a tail swings as a whole.
    while (b && depth < 6) {
      springs.push({ bone: b, saved: new THREE.Quaternion(), depth });
      b = b.children.find((c) => (c as THREE.Bone).isBone);
      depth++;
    }
  }
  const head = opt.head ? model.getObjectByName(opt.head) ?? null : null;
  const headSaved = new THREE.Quaternion();
  let applied = false;

  const prevPos = new THREE.Vector3();
  const prevVel = new THREE.Vector3();
  let havePrev = false;
  let prevYaw = 0;
  // Spring state: swing (x = pitch, z = roll) and its velocity.
  const sw = new THREE.Vector2();
  const swv = new THREE.Vector2();
  const tmp = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const e = new THREE.Euler();
  const wq = new THREE.Quaternion();
  const wqInv = new THREE.Quaternion();
  const pq = new THREE.Quaternion();

  let t = Math.random() * 10;
  let idle = 0;
  let fidget = false;
  let nextFidget = FIDGET_AFTER;
  let exprState: FaceState | null = null;
  let exprT = 0;
  let blinkIn = 1.5 + Math.random() * 2;
  let lookT = 0;
  let lookYaw = 0;
  let lookPitch = 0;
  let headYaw = 0;
  let headPitch = 0;
  let lastAnim: LifeAnim | null = null;
  let stretchV = 0;
  let stretch = 0;

  return {
    get fidget() {
      return fidget;
    },
    get idleTime() {
      return idle;
    },
    express(state, seconds) {
      exprState = state;
      exprT = seconds;
    },
    restore() {
      if (!applied) return;
      for (const s of springs) s.bone.quaternion.copy(s.saved);
      if (head) head.quaternion.copy(headSaved);
      applied = false;
    },
    update(dt, anim, phase, rate) {
      t += dt;
      const isIdle = anim === 'idle' || (anim === 'emote' && fidget);
      if (anim !== lastAnim && !(fidget && anim === 'idle')) {
        // A fresh action: perk up (wow on take-off, a squash pop on landing).
        if (anim === 'jump') stretchV += 2.2;
        if (lastAnim === 'fall' && (anim === 'idle' || anim === 'walk' || anim === 'run')) stretchV -= 2.6;
        lastAnim = anim;
      }
      if (isIdle) idle += dt;
      else {
        idle = 0;
        nextFidget = FIDGET_AFTER;
        fidget = false;
      }
      if (anim === 'idle' && !fidget && idle > nextFidget) {
        fidget = true;
      } else if (fidget && idle > nextFidget + 3.6) {
        fidget = false;
        nextFidget = idle + 8 + Math.random() * 5;
      }

      // ── squash & stretch: breathing in idle, a bounce on every step when moving.
      const moving = anim === 'walk' || anim === 'run';
      const steps = opt.steps ?? 2;
      let target = 0;
      if (moving) target = (anim === 'run' ? 0.07 : 0.045) * Math.cos(phase * Math.PI * 2 * steps);
      else if (anim === 'idle' || anim === 'sit') target = 0.014 * Math.sin(t * 2.4);
      else if (anim === 'dance' || anim === 'emote' || anim === 'cheer') target = 0.05 * Math.cos(phase * Math.PI * 4);
      // Spring towards the target so landings and take-offs wobble.
      stretchV += ((target - stretch) * 260 - stretchV * 16) * dt;
      stretch += stretchV * dt;
      stretch = Math.max(-0.25, Math.min(0.25, stretch));
      const sy = 1 + stretch;
      const sxz = 1 - stretch * 0.5;
      model.scale.set(opt.scale * sxz, opt.scale * sy, opt.scale * sxz);

      // ── face
      if (exprT > 0) exprT -= dt;
      let mood: FaceState = anim ? ANIM_FACE[anim] : 'neutral';
      if (fidget) mood = 'happy';
      else if (anim === 'idle' && idle > SLEEPY_AFTER) mood = 'sleepy';
      if (exprT > 0 && exprState) mood = exprState;
      if (face) {
        face.set(mood);
        blinkIn -= dt;
        if (blinkIn <= 0) {
          face.blink();
          // Sometimes a double blink.
          blinkIn = Math.random() < 0.2 ? 0.22 : 2 + Math.random() * 3.5;
        }
      }

      // ── look around when idle (head follows the eyes a little).
      lookT -= dt;
      if (lookT <= 0) {
        lookT = 1.2 + Math.random() * 2.2;
        const wander = anim === 'idle' && !fidget;
        lookYaw = wander ? (Math.random() - 0.5) * 0.9 : 0;
        lookPitch = wander ? (Math.random() - 0.4) * 0.3 : 0;
      }
      face?.look(lookYaw, lookPitch);
      const kh = 1 - Math.exp(-dt * 3);
      headYaw += (lookYaw * 0.45 - headYaw) * kh;
      headPitch += (lookPitch * 0.4 - headPitch) * kh;

      // ── secondary motion from how the body moves through the world.
      model.updateWorldMatrix(true, false);
      model.getWorldPosition(tmp);
      model.getWorldQuaternion(wq);
      e.setFromQuaternion(wq, 'YXZ');
      const yaw = e.y;
      let ax = 0;
      let az = 0;
      if (havePrev && dt > 0) {
        const vx = (tmp.x - prevPos.x) / dt;
        const vy = (tmp.y - prevPos.y) / dt;
        const vz = (tmp.z - prevPos.z) / dt;
        const accX = (vx - prevVel.x) / dt;
        const accY = (vy - prevVel.y) / dt;
        const accZ = (vz - prevVel.z) / dt;
        prevVel.set(vx, vy, vz);
        // Acceleration in the character's frame: forward (z) pitches parts back, sideways rolls.
        const c = Math.cos(yaw);
        const s = Math.sin(yaw);
        const fwd = accX * s + accZ * c;
        const side = accX * c - accZ * s;
        let dyaw = yaw - prevYaw;
        if (dyaw > Math.PI) dyaw -= Math.PI * 2;
        if (dyaw < -Math.PI) dyaw += Math.PI * 2;
        ax = THREE.MathUtils.clamp(fwd * 0.012 - accY * 0.006, -0.8, 0.8);
        az = THREE.MathUtils.clamp(side * 0.012 + (dyaw / dt) * 0.05, -0.8, 0.8);
      }
      prevPos.copy(tmp);
      prevYaw = yaw;
      havePrev = true;
      // Spring-damper: k = 90, c = 9 (bouncy but settles in ~0.6 s).
      const stepBob = moving ? 0.06 * Math.sin(phase * Math.PI * 2 * steps) : 0.03 * Math.sin(t * 1.7);
      swv.x += ((ax + stepBob - sw.x) * 90 - swv.x * 9) * Math.min(dt, 0.05);
      swv.y += ((az - sw.y) * 90 - swv.y * 9) * Math.min(dt, 0.05);
      sw.x += swv.x * Math.min(dt, 0.05);
      sw.y += swv.y * Math.min(dt, 0.05);

      // Apply: save clip pose, then rotate in world-aligned character axes.
      for (const s of springs) s.saved.copy(s.bone.quaternion);
      if (head) headSaved.copy(head.quaternion);
      const wiggle = Math.sin(t * 3.1) * 0.05 * (isIdle ? 1 : 0.3);
      for (const s of springs) {
        const k = 0.55 + s.depth * 0.25;
        const parent = s.bone.parent;
        if (!parent) continue;
        parent.getWorldQuaternion(pq);
        wqInv.copy(pq).invert();
        e.set(sw.x * k, wiggle * k + sw.y * k * 0.5, sw.y * k, 'XYZ');
        // world delta → local: P⁻¹ · (W · R · W⁻¹) · P · L, with W = the model's yaw frame.
        tmpQ.setFromEuler(e);
        tmpQ.premultiply(wq).multiply(wq.clone().invert());
        tmpQ.premultiply(wqInv).multiply(pq);
        s.bone.quaternion.premultiply(tmpQ);
      }
      if (head && (Math.abs(headYaw) > 1e-3 || Math.abs(headPitch) > 1e-3)) {
        const parent = head.parent;
        if (parent) {
          parent.getWorldQuaternion(pq);
          wqInv.copy(pq).invert();
          e.set(-headPitch, headYaw, 0, 'YXZ');
          tmpQ.setFromEuler(e);
          tmpQ.premultiply(wq).multiply(wq.clone().invert());
          tmpQ.premultiply(wqInv).multiply(pq);
          head.quaternion.premultiply(tmpQ);
        }
      }
      applied = true;
      face?.update(dt);
      void rate;
    },
  };
}
