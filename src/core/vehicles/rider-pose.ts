/**
 * Riding pose for any playable character: on top of the character's `sit` clip, the thighs open
 * around the horse's barrel, the shins hang down, the hands come forward to the reins, and the
 * seat bones are measured so the vehicle can put them exactly on the saddle.
 *
 * Works from bone names, so every catalog rig is covered: the robot and the four space-suit
 * characters share the humanoid names (UpperLeg/LowerLeg/Foot, UpperArm/LowerArm), the dinosaur
 * uses BackUpLeg/BackLowLeg/BackFoot. Feet in these rigs are IK bones parented to the root, so
 * they are carried along with the shins (see `aimBone` followers).
 *
 * Frame order: `restore()` before the player's mixer update, `apply()` after it.
 */
import * as THREE from 'three';
import { PoseLayer, aimBone, childCentre, findBone, rotateBoneWorld } from './bone-pose';

interface Limb {
  upper: THREE.Object3D;
  lower: THREE.Object3D;
  /** The bone at the far end of `lower` (a foot, or null: use the centre of lower's children). */
  end: THREE.Object3D | null;
  side: 1 | -1;
}

interface Rig {
  /** Any bone of the current character (to notice a character swap). */
  probe: THREE.Object3D;
  legs: Limb[];
  arms: Limb[];
  /** Seat bones sit this far below the hip joints (buttocks / suit padding), metres. */
  seatDrop: number;
  /** Leg directions differ for the dinosaur (short legs, wide hips). */
  kind: 'humanoid' | 'rex';
  /** Sit back by this much (radians, nose up): the dinosaur's long body balances over its hips. */
  lean: number;
  /** Extra bends in the rider's frame (radians about its +X = nose down / tail down). */
  bends: { bone: THREE.Object3D; pitch: number }[];
}

/** Leg and arm target directions in the rider's frame (+X left, +Y up, +Z forward), left side. */
const DIRS = {
  humanoid: {
    thigh: new THREE.Vector3(0.55, -0.6, 0.55),
    shin: new THREE.Vector3(0.2, -1, -0.12),
    upperArm: new THREE.Vector3(0.22, -0.8, 0.55),
    foreArm: new THREE.Vector3(-0.12, -0.3, 1),
  },
  rex: {
    thigh: new THREE.Vector3(0.8, -0.4, 0.35),
    shin: new THREE.Vector3(0.3, -1, -0.4),
    upperArm: new THREE.Vector3(0.3, -0.5, 0.8),
    foreArm: new THREE.Vector3(0, -0.3, 1),
  },
} as const;

function limb(root: THREE.Object3D, upper: string, lower: string, end: string | null, side: 1 | -1): Limb | null {
  const u = findBone(root, upper);
  const l = findBone(root, lower);
  if (!u || !l) return null;
  return { upper: u, lower: l, end: end ? findBone(root, end) : null, side };
}

function detectRig(root: THREE.Object3D): Rig | null {
  // three.js strips the dots from glTF node names: "UpperLeg.L" → "UpperLegL".
  const humanLegs = [limb(root, 'UpperLegL', 'LowerLegL', 'FootL', 1), limb(root, 'UpperLegR', 'LowerLegR', 'FootR', -1)];
  if (humanLegs[0] && humanLegs[1]) {
    const arms = [limb(root, 'UpperArmL', 'LowerArmL', null, 1), limb(root, 'UpperArmR', 'LowerArmR', null, -1)].filter((x): x is Limb => !!x);
    return { probe: humanLegs[0].upper, legs: humanLegs as Limb[], arms, seatDrop: 0.1, kind: 'humanoid', lean: 0, bends: [] };
  }
  const rexLegs = [limb(root, 'BackUpLegL', 'BackLowLegL', 'BackFootL', 1), limb(root, 'BackUpLegR', 'BackLowLegR', 'BackFootR', -1)];
  if (rexLegs[0] && rexLegs[1]) {
    const arms = [limb(root, 'FrontUpLegL', 'FrontLowLegL', 'FrontFootL', 1), limb(root, 'FrontUpLegR', 'FrontLowLegR', 'FrontFootR', -1)].filter((x): x is Limb => !!x);
    // Tail lies down over the horse's rump, neck curls up so the head is not on the horse's.
    const bends: { bone: THREE.Object3D; pitch: number }[] = [];
    for (const [n, pitch] of [['Tail1', 0.2], ['Tail2', 0.15], ['Tail3', 0.1], ['Neck', -0.25]] as const) {
      const bone = findBone(root, n);
      if (bone) bends.push({ bone, pitch });
    }
    return { probe: rexLegs[0].upper, legs: rexLegs as Limb[], arms, seatDrop: 0.16, kind: 'rex', lean: 0.38, bends };
  }
  return null;
}

function attachedTo(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === root) return true;
  return false;
}

export interface RiderPose {
  /** Undo last frame's pose (call BEFORE the player's animation update). */
  restore(): void;
  /**
   * Pose the rider (call AFTER the player's animation update). `weight` 0..1 blends the pose in.
   * `frame` is the world rotation the limb directions are relative to (the horse's body; the
   * rider's own rotation if omitted). Returns false if the character has no rig we know (it then
   * just sits).
   */
  apply(weight: number, frame?: THREE.Quaternion): boolean;
  /** How far this character sits back (radians, nose up); the seat applies it. */
  readonly lean: number;
  /** Seat point (between the hip joints, minus the seat drop) in the rider root's local frame. */
  readonly seatLocal: THREE.Vector3;
  /** World positions of the two hands (left, right), valid after `apply`. */
  readonly hands: readonly [THREE.Vector3, THREE.Vector3];
  readonly hasHands: boolean;
}

export function createRiderPose(rider: THREE.Object3D): RiderPose {
  const layer = new PoseLayer();
  let rig: Rig | null = null;
  let hasHands = false;
  const seatLocal = new THREE.Vector3(0, 0.5, 0);
  const hands: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  const q = new THREE.Quaternion();
  const d = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  const tip = new THREE.Vector3();

  const ensureRig = (): Rig | null => {
    if (rig && attachedTo(rig.probe, rider)) return rig;
    layer.clear();
    rig = detectRig(rider);
    return rig;
  };

  /** Rider-frame direction (mirrored for the right side) → world. */
  const world = (v: THREE.Vector3, side: number): THREE.Vector3 => d.set(v.x * side, v.y, v.z).normalize().applyQuaternion(q);

  return {
    seatLocal,
    hands,
    get hasHands() {
      return hasHands;
    },
    get lean() {
      return ensureRig()?.lean ?? 0;
    },
    restore() {
      layer.restore();
    },
    apply(weight, frame) {
      const r = ensureRig();
      hasHands = false;
      if (!r) return false;
      rider.updateMatrixWorld(true);
      q.setFromRotationMatrix(rider.matrixWorld);
      const dirs = DIRS[r.kind];
      const w = Math.min(1, Math.max(0, weight));
      if (w > 0) {
        // Body bends first (tail, neck), in the rider's own frame.
        d.set(1, 0, 0).applyQuaternion(q);
        for (const bend of r.bends) rotateBoneWorld(layer, bend.bone, d, -bend.pitch * w);
        if (frame) q.copy(frame);
        for (const l of r.legs) {
          const followers = l.end ? [l.end] : [];
          aimBone(layer, l.upper, l.lower, world(dirs.thigh, l.side), w, followers);
          if (l.end) aimBone(layer, l.lower, l.end, world(dirs.shin, l.side), w, followers);
        }
        for (const l of r.arms) {
          const followers = l.end ? [l.end] : [];
          aimBone(layer, l.upper, l.lower, world(dirs.upperArm, l.side), w, followers);
          const t = l.end ? l.end.getWorldPosition(tip) : childCentre(l.lower, tip) ? tip : null;
          if (t) aimBone(layer, l.lower, t, world(dirs.foreArm, l.side), w, followers);
        }
      }
      // Seat point: between the hip joints, dropped by the seat padding, in the rider's frame.
      r.legs[0].upper.getWorldPosition(a);
      r.legs[1].upper.getWorldPosition(b);
      a.add(b).multiplyScalar(0.5);
      inv.copy(rider.matrixWorld).invert();
      a.applyMatrix4(inv);
      a.y -= r.seatDrop;
      seatLocal.copy(a);
      // Hands: the far end of each forearm.
      if (r.arms.length === 2) {
        for (let i = 0; i < 2; i++) {
          const l = r.arms[i];
          if (l.end) l.end.getWorldPosition(hands[i]);
          else if (!childCentre(l.lower, hands[i])) l.lower.getWorldPosition(hands[i]);
        }
        hasHands = true;
      }
      return true;
    },
  };
}
