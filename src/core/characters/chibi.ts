/**
 * Chibi proportions and a friendly stance, layered onto a loaded hero at runtime:
 * - per-bone scale multipliers (big head, short chunky limbs, round belly, big feet), applied
 *   once after meshes are merged and the face/anchors are attached (so eyes, hats and glasses
 *   grow and move with the head); scale tracks on those bones are stripped from the clips;
 * - the model is lifted/lowered so the feet stay on the ground after the scaling;
 * - a "relax" layer for calm animations: named bones are aimed toward a character-space direction
 *   (arms hanging at the sides, spine upright) and given small extra tilts (head tilt), eased in.
 * Pure presentation: no physics, no root motion.
 */
import * as THREE from 'three';
import type { ChibiDef } from './catalog';
import type { LifeAnim } from './life';

type Vec3 = readonly [number, number, number];

/** Animations the relaxed stance blends into (full weight) or partly (half weight). */
const RELAX_FULL: ReadonlySet<LifeAnim> = new Set<LifeAnim>(['idle']);
const RELAX_HALF: ReadonlySet<LifeAnim> = new Set<LifeAnim>(['walk', 'sit']);

export interface ChibiRig {
  /** Model offset (character space) that keeps the feet on the ground after scaling. */
  readonly lift: number;
  /** After the mixer (and before life): ease in the relaxed stance for `anim`. */
  update(dt: number, anim: LifeAnim | null): void;
  /** Undo the stance offsets (call before the mixer). */
  restore(): void;
}

/** Find a node by its source name (GLTFLoader drops dots: 'UpperArm.L' → 'UpperArmL'). */
export function findNode(root: THREE.Object3D, name: string): THREE.Object3D | undefined {
  return root.getObjectByName(name) ?? root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
}

function lowestY(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root, true);
  return box.isEmpty() ? 0 : box.min.y;
}

/**
 * Apply chibi bone scales to `model` (inside `object`, at the rest pose) and build the stance rig.
 * `clips` lose any scale tracks on scaled bones (the scale must stay).
 */
export function applyChibi(object: THREE.Object3D, model: THREE.Object3D, def: ChibiDef | undefined, clips: THREE.AnimationClip[]): ChibiRig {
  let lift = 0;
  if (def?.bones) {
    const before = lowestY(object);
    const names = new Set(Object.keys(def.bones).map((n) => THREE.PropertyBinding.sanitizeNodeName(n)));
    for (const clip of clips) {
      clip.tracks = clip.tracks.filter((t) => {
        const p = THREE.PropertyBinding.parseTrackName(t.name);
        return !(p.propertyName === 'scale' && names.has(p.nodeName));
      });
    }
    for (const [name, s] of Object.entries(def.bones)) {
      const bone = findNode(model, name);
      if (!bone) continue;
      if (typeof s === 'number') bone.scale.multiplyScalar(s);
      else bone.scale.multiply(new THREE.Vector3(s[0], s[1], s[2]));
    }
    // Keep the lowest point where it was (feet on the ground), in character space.
    const after = lowestY(object);
    lift = (before - after) / Math.max(1e-6, object.scale.y);
    if (def.lift) lift += def.lift;
  }

  interface Aim {
    bone: THREE.Object3D;
    child: THREE.Object3D;
    dir: THREE.Vector3;
    w: number;
    saved: THREE.Quaternion;
  }
  interface Tilt {
    bone: THREE.Object3D;
    q: THREE.Quaternion;
    saved: THREE.Quaternion;
  }
  const aims: Aim[] = [];
  const tilts: Tilt[] = [];
  for (const a of def?.aim ?? []) {
    const bone = findNode(model, a.bone);
    const child = findNode(model, a.child);
    if (bone && child) aims.push({ bone, child, dir: new THREE.Vector3(...(a.dir as Vec3)).normalize(), w: a.w ?? 1, saved: new THREE.Quaternion() });
  }
  for (const [name, e] of Object.entries(def?.tilt ?? {})) {
    const bone = findNode(model, name);
    if (bone) tilts.push({ bone, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2])), saved: new THREE.Quaternion() });
  }

  let weight = 0;
  let applied = false;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const want = new THREE.Vector3();
  const objQ = new THREE.Quaternion();
  const parentQ = new THREE.Quaternion();
  const boneQ = new THREE.Quaternion();
  const delta = new THREE.Quaternion();
  const tmp = new THREE.Quaternion();
  const id = new THREE.Quaternion();

  return {
    lift,
    restore() {
      if (!applied) return;
      // Reverse order: aims were applied parent-first.
      for (let i = aims.length - 1; i >= 0; i--) aims[i].bone.quaternion.copy(aims[i].saved);
      for (const t of tilts) t.bone.quaternion.copy(t.saved);
      applied = false;
    },
    update(dt, anim) {
      if (!aims.length && !tilts.length) return;
      const target = anim && RELAX_FULL.has(anim) ? 1 : anim && RELAX_HALF.has(anim) ? 0.5 : 0;
      const k = 1 - Math.exp(-dt * 6);
      weight = dt <= 0 ? target : weight + (target - weight) * k;
      if (weight < 1e-3) return;
      for (const t of tilts) {
        t.saved.copy(t.bone.quaternion);
        tmp.copy(id).slerp(t.q, weight);
        t.bone.quaternion.multiply(tmp);
      }
      object.getWorldQuaternion(objQ);
      for (const s of aims) {
        s.saved.copy(s.bone.quaternion);
        s.bone.updateWorldMatrix(true, true);
        s.bone.getWorldPosition(a);
        s.child.getWorldPosition(b);
        b.sub(a);
        if (b.lengthSq() < 1e-10) continue;
        b.normalize();
        want.copy(s.dir).applyQuaternion(objQ);
        delta.setFromUnitVectors(b, want);
        tmp.copy(id).slerp(delta, weight * s.w);
        // World delta → local: L' = P⁻¹ · D · P · L.
        const parent = s.bone.parent;
        if (!parent) continue;
        parent.getWorldQuaternion(parentQ);
        boneQ.copy(parentQ).invert().multiply(tmp).multiply(parentQ);
        s.bone.quaternion.premultiply(boneQ);
      }
      object.updateMatrixWorld(true);
      applied = true;
    },
  };
}

/**
 * Recolour flat (untextured) materials by name at load: e.g. a robot's near-black joints become
 * a candy colour. Returns how many materials changed.
 */
export function recolourMaterials(model: THREE.Object3D, colours: Readonly<Record<string, string>> | undefined): number {
  if (!colours) return 0;
  let n = 0;
  const seen = new Set<THREE.Material>();
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (seen.has(m)) continue;
      seen.add(m);
      const c = colours[m.name];
      const std = m as THREE.MeshStandardMaterial;
      if (c && std.color) {
        std.color.set(c);
        n++;
      }
    }
  });
  return n;
}

/**
 * Tag vertices of a skinned mesh by body region for the shader recolour (attribute `aRegion`):
 * 1 = hand (dominant bone is a finger/hand bone), 2 = head (bone at or under the head bone, above
 * the bottom `collar` fraction of the head's height: a suit collar skinned to the head stays body),
 * 0 = everything else.
 */
export function tagRegions(model: THREE.Object3D, handBone: RegExp, headBone: string, collar = 0.25, reskinCollar = true): void {
  model.updateMatrixWorld(true);
  const p = new THREE.Vector3();
  model.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.geometry.attributes.skinIndex) return;
    const bones = mesh.skeleton.bones;
    const head = bones.find((bn) => bn.name === headBone);
    const underHead = bones.map((bn) => {
      for (let p: THREE.Object3D | null = bn; p; p = p.parent) if (p === head) return true;
      return false;
    });
    const isHand = bones.map((bn) => handBone.test(bn.name));
    const isNeck = bones.map((bn) => !!head && bn === head.parent);
    const neckish = new Uint8Array(mesh.geometry.attributes.skinIndex.count);
    const si = mesh.geometry.attributes.skinIndex;
    const sw = mesh.geometry.attributes.skinWeight;
    const out = new Float32Array(si.count);
    const ys = new Float32Array(si.count);
    let lo = Infinity;
    let hi = -Infinity;
    for (let v = 0; v < si.count; v++) {
      let hand = 0;
      let headW = 0;
      let neckW = 0;
      for (let k = 0; k < 4; k++) {
        const bi = si.getComponent(v, k);
        const w = sw.getComponent(v, k);
        if (isHand[bi]) hand += w;
        if (underHead[bi]) headW += w;
        if (isNeck[bi]) neckW += w;
      }
      neckish[v] = neckW + headW > 0.5 ? 1 : 0;
      out[v] = hand > 0.5 ? 1 : headW > 0.5 ? 2 : 0;
      if (neckish[v]) {
        mesh.getVertexPosition(v, p).applyMatrix4(mesh.matrixWorld);
        ys[v] = p.y;
      }
      if (out[v] === 2) {
        lo = Math.min(lo, ys[v]);
        hi = Math.max(hi, ys[v]);
      }
    }
    const cut = lo + (hi - lo) * collar;
    // The suit's helmet collar is skinned to the head: hand it to a tiny helper bone under the
    // neck instead, so it shrinks away into the suit (a bigger head would make it a giant ring).
    let neck = -1;
    if (reskinCollar && head?.parent) {
      const helper = new THREE.Bone();
      helper.name = 'chibi-collar';
      head.parent.add(helper);
      helper.position.copy(head.position).multiplyScalar(0.6);
      helper.updateMatrixWorld(true);
      const inv = helper.matrixWorld.clone().invert();
      mesh.bind(new THREE.Skeleton([...bones, helper], [...mesh.skeleton.boneInverses, inv]), mesh.bindMatrix);
      helper.scale.setScalar(0.02);
      neck = bones.length;
    }
    const idx = new Uint16Array(si.count * 4);
    const wgt = new Float32Array(si.count * 4);
    for (let v = 0; v < si.count; v++) {
      const ring = neckish[v] === 1 && out[v] !== 1 && ys[v] < cut;
      if (ring) out[v] = 0;
      for (let k = 0; k < 4; k++) {
        idx[v * 4 + k] = ring && neck >= 0 ? (k === 0 ? neck : 0) : si.getComponent(v, k);
        wgt[v * 4 + k] = ring && neck >= 0 ? (k === 0 ? 1 : 0) : sw.getComponent(v, k);
      }
    }
    if (reskinCollar) {
      mesh.geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
      mesh.geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wgt, 4));
    }
    mesh.geometry.setAttribute('aRegion', new THREE.BufferAttribute(out, 1));
  });
}
