/**
 * Additive procedural posing on top of an AnimationMixer: rotate bones about world axes, aim a
 * two-bone limb at world directions (carrying along IK end bones that are not its children, as
 * in the Quaternius rigs where feet hang off the root), and undo everything before the next
 * mixer update so bones the clip does not key never drift.
 *
 * Usage each frame:  layer.restore() → mixer.update() → root.updateMatrixWorld(true) → posing.
 */
import * as THREE from 'three';

const _pq = new THREE.Quaternion();
const _wq = new THREE.Quaternion();
const _dq = new THREE.Quaternion();
const _id = new THREE.Quaternion();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _s = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** Remembers the clip pose of every bone it touches and puts it back on `restore`. */
export class PoseLayer {
  private readonly saved = new Map<THREE.Object3D, { q: THREE.Quaternion; p: THREE.Vector3 }>();

  /** Save a bone's current (clip) transform before changing it. Idempotent within a frame. */
  touch(bone: THREE.Object3D): void {
    if (this.saved.has(bone)) return;
    this.saved.set(bone, { q: bone.quaternion.clone(), p: bone.position.clone() });
  }

  /** Put every touched bone back to its saved transform (call before the next mixer update). */
  restore(): void {
    for (const [bone, s] of this.saved) {
      bone.quaternion.copy(s.q);
      bone.position.copy(s.p);
    }
    this.saved.clear();
  }

  /** Forget saved transforms without restoring (the bones now belong to someone else). */
  clear(): void {
    this.saved.clear();
  }

  get size(): number {
    return this.saved.size;
  }
}

/** World rotation of `o` (ignores scale). `o.matrixWorld` must be current. */
export function worldQuat(o: THREE.Object3D, out: THREE.Quaternion): THREE.Quaternion {
  o.matrixWorld.decompose(_a, out, _s);
  return out;
}

/** Pre-multiply a world-space rotation `dq` onto `bone` (about its own pivot). Updates its subtree. */
export function applyWorldRotation(bone: THREE.Object3D, dq: THREE.Quaternion): void {
  if (bone.parent) worldQuat(bone.parent, _pq);
  else _pq.identity();
  // local' = P⁻¹ · dq · P · local
  _wq.copy(_pq).invert().multiply(dq).multiply(_pq);
  bone.quaternion.premultiply(_wq).normalize();
  bone.updateMatrixWorld(true);
}

/** Rotate `bone` by `angle` about a world-space `axis` (unit). */
export function rotateBoneWorld(layer: PoseLayer, bone: THREE.Object3D, axis: THREE.Vector3, angle: number): void {
  if (Math.abs(angle) < 1e-5) return;
  layer.touch(bone);
  _dq.setFromAxisAngle(axis, angle);
  applyWorldRotation(bone, _dq);
}

/**
 * Move a bone that is NOT a descendant of the rotated bone as if it were: rotate its world
 * transform by `dq` about `pivot`.
 */
function carry(layer: PoseLayer, follower: THREE.Object3D, pivot: THREE.Vector3, dq: THREE.Quaternion): void {
  layer.touch(follower);
  follower.updateMatrixWorld(true);
  const fp = _c.setFromMatrixPosition(follower.matrixWorld);
  fp.sub(pivot).applyQuaternion(dq).add(pivot);
  worldQuat(follower, _wq).premultiply(dq);
  const parent = follower.parent;
  if (parent) {
    _m.copy(parent.matrixWorld).invert();
    follower.position.copy(fp.applyMatrix4(_m));
    worldQuat(parent, _pq);
    follower.quaternion.copy(_pq.invert().multiply(_wq)).normalize();
  } else {
    follower.position.copy(fp);
    follower.quaternion.copy(_wq);
  }
  follower.updateMatrixWorld(true);
}

function isDescendant(o: THREE.Object3D, ancestor: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o.parent; p; p = p.parent) if (p === ancestor) return true;
  return false;
}

/**
 * Turn `bone` so the direction from its pivot to `tip` (its child joint, or a world point)
 * points along the world direction `dir`, blended by `weight` (0..1). `followers` are bones that
 * should move as if they were children (IK feet/hooves parented elsewhere). Returns false if the
 * bone has no length.
 */
export function aimBone(
  layer: PoseLayer,
  bone: THREE.Object3D,
  tip: THREE.Object3D | THREE.Vector3,
  dir: THREE.Vector3,
  weight: number,
  followers: readonly THREE.Object3D[] = [],
): boolean {
  if (weight <= 0) return true;
  bone.updateMatrixWorld(true);
  if (tip instanceof THREE.Object3D) {
    tip.updateMatrixWorld(true);
    _b.setFromMatrixPosition(tip.matrixWorld);
  } else _b.copy(tip);
  const pivot = _a.setFromMatrixPosition(bone.matrixWorld);
  const cur = _b.sub(pivot);
  const len = cur.length();
  if (len < 1e-6) return false;
  cur.divideScalar(len);
  _dq.setFromUnitVectors(cur, _c.copy(dir).normalize());
  if (weight < 1) _dq.slerpQuaternions(_id, _dq.clone(), weight);
  layer.touch(bone);
  const pv = pivot.clone();
  const dq = _dq.clone();
  applyWorldRotation(bone, dq);
  for (const f of followers) if (!isDescendant(f, bone)) carry(layer, f, pv, dq);
  return true;
}

/** First Bone named `name` under `root` (falls back to any node with that name). */
export function findBone(root: THREE.Object3D, name: string): THREE.Object3D | null {
  let bone: THREE.Object3D | null = null;
  let any: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (o.name !== name) return;
    if (!bone && (o as THREE.Bone).isBone) bone = o;
    if (!any) any = o;
  });
  return bone ?? any;
}

/** World position of the average of `o`'s child bones (the far end of a bone with no tip node). */
export function childCentre(o: THREE.Object3D, out: THREE.Vector3): boolean {
  let n = 0;
  out.set(0, 0, 0);
  for (const c of o.children) {
    if (!(c as THREE.Bone).isBone) continue;
    c.updateMatrixWorld(true);
    out.add(_c.setFromMatrixPosition(c.matrixWorld));
    n++;
  }
  if (n === 0) return false;
  out.divideScalar(n);
  return true;
}
