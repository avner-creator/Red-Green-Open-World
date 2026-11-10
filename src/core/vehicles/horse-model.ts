/**
 * Horse visuals: the CC0 Quaternius horse (public/assets/models/horse.glb, built by
 * tools/horse/build.mjs), one skinned clone per horse with its own coat materials, a procedural
 * saddle, blanket, bridle and reins, gait clips with cross-fades, and a procedural overlay layer
 * (tail swish, ear flicks, folded forelegs for the rear-up emote).
 *
 * Loads lazily: `ready` turns true once the GLB is in. Until then the horse is invisible and
 * cannot be mounted. Space: feet (hooves) at the origin, +Z forward, +Y up, metres.
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { PoseLayer, aimBone, findBone, rotateBoneWorld } from './bone-pose';
import type { Gait } from './horse-math';

export const HORSE_MODEL_URL = 'assets/models/horse.glb';
/** GLB → metres. Withers ≈ 1.6 m, ears ≈ 2.25 m, nose-to-tail ≈ 2.65 m. */
export const HORSE_SCALE = 0.47;
/** Top of the back under the saddle, horse space at rest (just behind the withers). */
const SADDLE_REST = new THREE.Vector3(0, 1.61, -0.06);
/** The seat of the saddle is this far above the back (blanket + leather). */
const SEAT_ABOVE_BACK = 0.08;
/** Hind hooves: the pivot for rearing up. */
const REAR_PIVOT_Z = -0.85;

export type HorseAnim = Gait | 'jump' | 'land';

export interface HorseModel {
  /** Hooves on the ground; position + yaw. */
  readonly root: THREE.Group;
  /** Pitch / roll / rear-up pivot inside the root. */
  readonly body: THREE.Group;
  /** Contact shadow blob (add to the scene separately; follows in `placeBlob`). */
  readonly blob: THREE.Mesh;
  readonly ready: boolean;
  /** World position of the saddle seat (where the rider's seat bones go). */
  saddle(out: THREE.Vector3): THREE.Vector3;
  /** World position of the bit (for the prompt and the reins). */
  head(out: THREE.Vector3): THREE.Vector3;
  setCoat(color: THREE.ColorRepresentation): void;
  /** Gait / action clip and playback rate. */
  play(anim: HorseAnim, rate?: number, restart?: boolean): void;
  /** Start an idle variation (graze, head low, ear flick). */
  idleVariation(index: number): void;
  /**
   * Advance clips and the overlay. `turn` (−1..1) bends the tail and neck into turns, `rear`
   * (0..1) folds the forelegs, `swish` drives the tail swish phase.
   */
  update(dt: number, o: { turn: number; rear: number; time: number; earFlick: number }): void;
  /** Tack reins between the bit and the rider's hands (null hides them). */
  setReins(hands: readonly [THREE.Vector3, THREE.Vector3] | null): void;
  dispose(): void;
}

let gltfPromise: Promise<GLTF> | null = null;
function loadHorseGltf(): Promise<GLTF> {
  if (!gltfPromise) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    gltfPromise = loader.loadAsync(`${import.meta.env.BASE_URL}${HORSE_MODEL_URL}`);
    gltfPromise.catch(() => {
      gltfPromise = null;
    });
  }
  return gltfPromise;
}

const CLIP: Record<HorseAnim, string> = {
  idle: 'Idle',
  walk: 'Walk',
  trot: 'Trot',
  gallop: 'Gallop',
  jump: 'Gallop_Jump',
  land: 'Jump_toIdle',
};
const IDLE_VARIATIONS = ['Idle', 'Idle_2', 'Idle_Headlow', 'Eating'] as const;

// ── Tack (procedural) ──

/**
 * A curved pad over the barrel: an annular sector (radius `r`, thickness `t`, ±`half` radians
 * from the top) extruded `depth` along the spine, rounded at the ends. Top of the arc at y = 0.
 */
function pad(r: number, t: number, half: number, depth: number, bevel = 0.012): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const a0 = Math.PI / 2 - half;
  const a1 = Math.PI / 2 + half;
  s.absarc(0, 0, r + t, a0, a1, false);
  s.absarc(0, 0, r, a1, a0, true);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 18 });
  g.translate(0, -(r + t), -depth / 2);
  return g;
}

/** A thin strap (cylinder) between two points. */
function strap(a: THREE.Vector3, b: THREE.Vector3, radius: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(radius, radius, len, 6).translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyQuaternion(q).translate(a.x, a.y, a.z);
  return g;
}

interface Tack {
  group: THREE.Group;
  bridle: THREE.Group;
  reins: THREE.Mesh[];
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
}

/** Bridle geometry in head-bone-relative horse space (offsets from the poll at rest). */
const BIT = new THREE.Vector3(0, -0.36, 0.37);

function buildTack(): Tack {
  const leather = new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 0.55 });
  const blanket = new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.9 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x2c4a8c, roughness: 0.85 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xf2c94c, roughness: 0.35, metalness: 0.6 });
  const geometries: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry): THREE.BufferGeometry => {
    geometries.push(g);
    return g;
  };
  const group = new THREE.Group();
  group.name = 'horse-tack';
  // Saddle pad: light cloth over a dark trim edge (reads in both channels on any coat).
  const border = new THREE.Mesh(add(pad(0.31, 0.018, 1.62, 0.78)), trim);
  border.position.y = 0.005;
  const cloth = new THREE.Mesh(add(pad(0.33, 0.02, 1.5, 0.68)), blanket);
  cloth.position.y = 0.03;
  // Saddle: dark leather seat, raised pommel (front) and cantle (back), a little brass horn.
  const seat = new THREE.Mesh(add(pad(0.36, 0.05, 0.85, 0.5, 0.025)), leather);
  seat.position.y = 0.075;
  const pommel = new THREE.Mesh(add(new THREE.CapsuleGeometry(0.055, 0.16, 4, 10).rotateZ(Math.PI / 2)), leather);
  pommel.position.set(0, 0.1, 0.22);
  const cantle = new THREE.Mesh(add(new THREE.CapsuleGeometry(0.06, 0.26, 4, 10).rotateZ(Math.PI / 2)), leather);
  cantle.position.set(0, 0.12, -0.25);
  const horn = new THREE.Mesh(add(new THREE.CylinderGeometry(0.025, 0.035, 0.1, 10)), brass);
  horn.position.set(0, 0.17, 0.25);
  // Side flaps where the rider's legs go, and the girth strap under the belly.
  const flaps = new THREE.Mesh(add(pad(0.35, 0.02, 1.25, 0.34, 0.01)), leather);
  flaps.position.set(0, 0.06, 0.04);
  const girth = new THREE.Mesh(add(pad(0.3, 0.02, Math.PI, 0.09, 0.008)), leather);
  girth.position.set(0, 0.04, 0.16);
  girth.scale.set(0.98, 1.05, 1);
  group.add(border, cloth, flaps, seat, pommel, cantle, horn, girth);

  // Bridle: noseband, cheek straps up to the crown piece behind the ears, brass bit rings.
  const bridle = new THREE.Group();
  const V = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z);
  const nose = new THREE.Mesh(add(new THREE.TorusGeometry(0.125, 0.017, 6, 22)), leather);
  nose.position.set(0, -0.26, 0.31);
  nose.rotation.x = 0.62;
  nose.scale.set(0.92, 1.12, 1);
  const crown = new THREE.Mesh(add(new THREE.TorusGeometry(0.115, 0.017, 6, 16, Math.PI)), leather);
  crown.position.set(0, -0.03, -0.03);
  crown.rotation.x = -0.25;
  const cheeks = [1, -1].map((s) => new THREE.Mesh(add(strap(V(s * 0.113, -0.04, -0.02), V(s * 0.112, -0.3, 0.35), 0.015)), leather));
  const brow = new THREE.Mesh(add(strap(V(0.11, -0.02, 0.07), V(-0.11, -0.02, 0.07), 0.015)), leather);
  const rings = [1, -1].map((s) => {
    const m = new THREE.Mesh(add(new THREE.TorusGeometry(0.03, 0.009, 6, 12)), brass);
    m.position.set(s * 0.115, BIT.y, BIT.z);
    m.rotation.y = Math.PI / 2;
    return m;
  });
  bridle.add(nose, crown, brow, ...cheeks, ...rings);

  // Reins: 2 segments per side (a little sag), unit cylinders stretched each frame.
  const reinGeo = add(new THREE.CylinderGeometry(0.012, 0.012, 1, 5).translate(0, 0.5, 0).rotateX(Math.PI / 2));
  const reins: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(reinGeo, leather);
    m.name = 'horse-rein';
    m.visible = false;
    m.frustumCulled = false;
    reins.push(m);
  }
  for (const o of [group, bridle, ...reins]) {
    o.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) c.castShadow = true;
    });
  }
  return { group, bridle, reins, materials: [leather, blanket, trim, brass], geometries };
}

let blobTex: THREE.DataTexture | null = null;
/** Soft oval contact shadow (shared by both horses). */
function blobTexture(): THREE.DataTexture {
  if (blobTex) return blobTex;
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot((x / (size - 1)) * 2 - 1, (y / (size - 1)) * 2 - 1);
      const a = Math.max(0, Math.min(1, (1 - d) / 0.7));
      data[(y * size + x) * 4 + 3] = Math.round(a * a * (3 - 2 * a) * 255);
    }
  }
  blobTex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  blobTex.magFilter = THREE.LinearFilter;
  blobTex.minFilter = THREE.LinearFilter;
  blobTex.needsUpdate = true;
  return blobTex;
}

export function createHorseModel(scene: THREE.Scene, coat: THREE.ColorRepresentation, mane: THREE.ColorRepresentation): HorseModel {
  const root = new THREE.Group();
  root.name = 'horse';
  const body = new THREE.Group();
  body.position.z = REAR_PIVOT_Z;
  root.add(body);
  const inner = new THREE.Group();
  inner.position.z = -REAR_PIVOT_Z;
  body.add(inner);

  const blob = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: blobTexture(), color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  blob.scale.set(1.3, 1, 3.0);
  blob.renderOrder = 1;

  const tack = buildTack();
  for (const r of tack.reins) scene.add(r);

  let ready = false;
  let disposed = false;
  let mixer: THREE.AnimationMixer | null = null;
  const actions = new Map<string, THREE.AnimationAction>();
  let current: THREE.AnimationAction | null = null;
  let currentName = '';
  const coatMats: { main?: THREE.MeshStandardMaterial; light?: THREE.MeshStandardMaterial; dark?: THREE.MeshStandardMaterial; hair?: THREE.MeshStandardMaterial } = {};
  const ownMaterials: THREE.Material[] = [];
  const layer = new PoseLayer();
  const bones: Record<string, THREE.Object3D | null> = {};
  const saddleAnchor = new THREE.Object3D();
  const bitAnchor = new THREE.Object3D();
  let coatColor = new THREE.Color(coat);
  const maneColor = new THREE.Color(mane);

  const applyCoat = (): void => {
    if (!coatMats.main) return;
    coatMats.main.color.copy(coatColor);
    coatMats.light?.color.copy(coatColor).lerp(new THREE.Color(1, 1, 1), 0.45);
    coatMats.dark?.color.copy(coatColor).multiplyScalar(0.62);
    coatMats.hair?.color.copy(maneColor);
  };

  loadHorseGltf()
    .then((gltf) => {
      if (disposed) return;
      const model = cloneSkinned(gltf.scene) as THREE.Group;
      model.scale.setScalar(HORSE_SCALE);
      model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        mesh.frustumCulled = false; // skinned bounds don't follow the animation
        const src = mesh.material as THREE.MeshStandardMaterial;
        const key = ({ Main: 'main', Main_Light: 'light', Main_Dark: 'dark', Hair: 'hair' } as const)[src.name as 'Main'];
        if (key) {
          const m = coatMats[key] ?? src.clone();
          coatMats[key] = m;
          if (!ownMaterials.includes(m)) ownMaterials.push(m);
          mesh.material = m;
        }
      });
      inner.add(model);
      for (const name of ['Torso2', 'Head', 'Neck1', 'Neck2', 'Neck3', 'Tail1', 'Tail2', 'Tail3', 'Tail4', 'Tail5', 'Tail6', 'Ear1L', 'Ear1R',
        'FrontUpperLegL', 'FrontLowerLegL', 'FrontUpperLegR', 'FrontLowerLegR', 'FFL', 'FFR', 'IKFrontLegL', 'IKFrontLegR']) {
        bones[name] = findBone(model, name);
      }
      // Anchors placed at rest, then re-parented onto bones so they follow the animation.
      inner.updateMatrixWorld(true);
      root.updateMatrixWorld(true);
      const attach = (anchor: THREE.Object3D, boneName: string, local: THREE.Vector3): void => {
        anchor.position.copy(local);
        root.add(anchor);
        anchor.updateMatrixWorld(true);
        const b = bones[boneName];
        if (b) b.attach(anchor);
      };
      attach(saddleAnchor, 'Torso2', SADDLE_REST);
      tack.group.position.set(0, 0, 0);
      saddleAnchor.add(tack.group);
      // Bridle on the head bone: built at the muzzle in horse space.
      const head = bones.Head;
      if (head) {
        const hp = root.worldToLocal(new THREE.Vector3().setFromMatrixPosition(head.matrixWorld));
        attach(bitAnchor, 'Head', hp.clone().add(BIT));
        tack.bridle.position.copy(hp);
        root.add(tack.bridle);
        tack.bridle.updateMatrixWorld(true);
        head.attach(tack.bridle);
      }
      mixer = new THREE.AnimationMixer(model);
      for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
      applyCoat();
      ready = true;
      play(pending.anim, pending.rate, true);
    })
    .catch((err: unknown) => {
      console.warn('horse model failed to load', err);
    });

  const pending: { anim: HorseAnim | string; rate: number } = { anim: 'idle', rate: 1 };

  function playClip(name: string, rate: number, loop: boolean, fade: number, restart = false): void {
    const next = actions.get(name);
    if (!next) return;
    next.timeScale = rate;
    if (next === current && !restart) return;
    next.reset();
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = !loop;
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.play();
    if (current && current !== next) {
      if (fade > 0) {
        // Sync gait phases so legs don't scramble when walk ↔ trot ↔ gallop blend.
        const a = current.getClip().duration;
        const b = next.getClip().duration;
        if (loop && current.loop === THREE.LoopRepeat && a > 0) next.time = ((current.time % a) / a) * b;
        current.crossFadeTo(next, fade, false);
      } else current.stop();
    }
    current = next;
    currentName = name;
  }

  function play(anim: HorseAnim | string, rate = 1, restart = false): void {
    pending.anim = anim;
    pending.rate = rate;
    if (!ready) return;
    const name = (CLIP as Record<string, string>)[anim] ?? anim;
    const oneShot = anim === 'jump' || anim === 'land';
    const fade = anim === 'jump' ? 0.12 : anim === 'land' ? 0.2 : 0.3;
    if (!restart && (anim === 'idle' && IDLE_VARIATIONS.includes(currentName as 'Idle'))) {
      // Any idle variation counts as idle: let it finish its cycle.
      if (current) current.timeScale = 1;
      return;
    }
    playClip(name, rate, !oneShot, fade, restart);
  }

  const up = new THREE.Vector3(0, 1, 0);
  const fwd = new THREE.Vector3();
  const side = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const q = new THREE.Quaternion();

  return {
    root,
    body,
    blob,
    get ready() {
      return ready;
    },
    saddle(out) {
      if (!ready) return out.copy(SADDLE_REST).setY(SADDLE_REST.y + SEAT_ABOVE_BACK).applyMatrix4(root.matrixWorld);
      saddleAnchor.updateWorldMatrix(true, false);
      out.setFromMatrixPosition(saddleAnchor.matrixWorld);
      q.setFromRotationMatrix(saddleAnchor.matrixWorld);
      return out.addScaledVector(up.set(0, 1, 0).applyQuaternion(q), SEAT_ABOVE_BACK);
    },
    head(out) {
      if (!ready) return out.set(0, 1.7, 1.2).applyMatrix4(root.matrixWorld);
      bitAnchor.updateWorldMatrix(true, false);
      return out.setFromMatrixPosition(bitAnchor.matrixWorld);
    },
    setCoat(c) {
      coatColor = new THREE.Color(c);
      // The mane always contrasts with the coat (brightness, so it reads through either lens).
      const l = coatColor.r * 0.3 + coatColor.g * 0.59 + coatColor.b * 0.11;
      if (l > 0.45 && maneColor.r + maneColor.g + maneColor.b > 1.8) maneColor.set(0x3a3330);
      else if (l <= 0.45 && maneColor.r + maneColor.g + maneColor.b < 1.2) maneColor.set(0xf3eee2);
      applyCoat();
    },
    play,
    idleVariation(i) {
      if (!ready) return;
      const name = IDLE_VARIATIONS[((i % IDLE_VARIATIONS.length) + IDLE_VARIATIONS.length) % IDLE_VARIATIONS.length];
      playClip(name, 1, true, 0.6);
    },
    update(dt, o) {
      if (!ready || !mixer) return;
      layer.restore();
      mixer.update(dt);
      // An idle variation (graze, head low) plays one cycle, then back to the plain idle.
      if (current && currentName !== 'Idle' && IDLE_VARIATIONS.includes(currentName as 'Idle') && current.time > current.getClip().duration * 0.97) {
        playClip('Idle', 1, true, 0.6);
      }
      root.updateMatrixWorld(true);
      q.setFromRotationMatrix(root.matrixWorld);
      fwd.set(0, 0, 1).applyQuaternion(q);
      side.set(1, 0, 0).applyQuaternion(q);
      // Tail swish: a lazy travelling wave, bending into turns.
      const tails = ['Tail1', 'Tail2', 'Tail3', 'Tail4', 'Tail5', 'Tail6'];
      for (let i = 0; i < tails.length; i++) {
        const b = bones[tails[i]];
        if (!b) continue;
        up.set(0, 1, 0);
        const swish = Math.sin(o.time * 2.1 - i * 0.7) * 0.07 * (0.4 + i * 0.15) + Math.sin(o.time * 0.63 + 1.3) * 0.05;
        rotateBoneWorld(layer, b, up, swish - o.turn * 0.07);
      }
      // Neck leans into turns.
      for (const n of ['Neck1', 'Neck2']) {
        const b = bones[n];
        if (b) rotateBoneWorld(layer, b, up, o.turn * 0.12);
      }
      // Ear flicks (o.earFlick: +1 left ear, −1 right ear, scaled by the flick envelope).
      if (o.earFlick !== 0) {
        const b = bones[o.earFlick > 0 ? 'Ear1L' : 'Ear1R'];
        if (b) rotateBoneWorld(layer, b, fwd, Math.sign(o.earFlick) * -0.6 * Math.abs(o.earFlick));
      }
      // Rear-up: forelegs fold up and forward (hooves carried along).
      if (o.rear > 0.01) {
        for (const s of ['L', 'R'] as const) {
          const up1 = bones[`FrontUpperLeg${s}`];
          const low = bones[`FrontLowerLeg${s}`];
          const hoof = bones[`FF${s}`];
          const ik = bones[`IKFrontLeg${s}`];
          if (!up1 || !low) continue;
          const followers = [hoof, ik].filter((b): b is THREE.Object3D => !!b);
          // Thigh forward, cannon bone hanging back down: a proud prance.
          dir.copy(fwd).multiplyScalar(0.85).addScaledVector(up, -0.5);
          aimBone(layer, up1, low, dir, o.rear, followers);
          const tip = hoof ?? ik;
          if (tip) {
            dir.copy(fwd).multiplyScalar(0.25).addScaledVector(up, -1);
            aimBone(layer, low, tip, dir, o.rear, followers);
          }
        }
      }
    },
    setReins(hands) {
      if (!hands || !ready) {
        for (const r of tack.reins) r.visible = false;
        return;
      }
      const bit = new THREE.Vector3();
      bitAnchor.updateWorldMatrix(true, false);
      bit.setFromMatrixPosition(bitAnchor.matrixWorld);
      q.setFromRotationMatrix(root.matrixWorld);
      side.set(1, 0, 0).applyQuaternion(q);
      for (let s = 0; s < 2; s++) {
        const a = bit.clone().addScaledVector(side, s === 0 ? 0.11 : -0.11);
        const b = hands[s];
        const mid = a.clone().lerp(b, 0.5);
        mid.y -= 0.08 + a.distanceTo(b) * 0.06;
        const segs: [THREE.Vector3, THREE.Vector3][] = [[a, mid], [mid, b]];
        for (let k = 0; k < 2; k++) {
          const m = tack.reins[s * 2 + k];
          const [p0, p1] = segs[k];
          m.position.copy(p0);
          m.scale.set(1, 1, Math.max(0.01, p0.distanceTo(p1)));
          m.lookAt(p1);
          m.visible = true;
        }
      }
    },
    dispose() {
      disposed = true;
      root.removeFromParent();
      blob.removeFromParent();
      for (const r of tack.reins) r.removeFromParent();
      tack.bridle.removeFromParent();
      for (const m of tack.materials) m.dispose();
      for (const g of tack.geometries) g.dispose();
      for (const m of ownMaterials) m.dispose();
      blob.geometry.dispose();
      (blob.material as THREE.Material).dispose();
      mixer?.stopAllAction();
    },
  };
}
