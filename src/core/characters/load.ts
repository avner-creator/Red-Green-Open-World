/**
 * Loads one catalog character and wires it up: scaled so the feet sit at the origin and it faces
 * +Z, an AnimationMixer with the catalog's PlayerAnim → clip mapping, and attach anchors for
 * outfits. The game's player controller can use this as-is (it does not touch physics or input).
 *
 * Character GLBs are meshopt-compressed, so the loader needs the meshopt decoder.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { PlayerAnim } from '../../types';
import type { AttachPart, CharacterDef, ClipRef } from './catalog';
import { buildFace, type FaceRig, type FaceState } from './face';
import { createLife, type Life } from './life';
import { mergeCharacterMeshes } from './merge';
import { smoothNormals, warmCharacter } from './warm';

export interface LoadedCharacter {
  readonly def: CharacterDef;
  /** Feet at the origin, facing +Z, already scaled to `def.scale`. */
  readonly object: THREE.Group;
  /** Anchors that follow their bone; children are authored in metres, +Y up, +Z forward. */
  readonly anchors: Readonly<Record<AttachPart, THREE.Object3D>>;
  readonly mixer: THREE.AnimationMixer;
  /** Play a PlayerAnim (or the signature emote), cross-fading from the current clip. */
  play(anim: PlayerAnim | 'emote', rate?: number, fade?: number, restart?: boolean): void;
  update(dt: number): void;
  /** Big cartoon eyes (null when the catalog gives no face). */
  readonly face: FaceRig | null;
  /** Wear an expression for a moment (happy, wow, determined, giggle, sleepy). */
  express(state: FaceState, seconds?: number): void;
}

let sharedLoader: GLTFLoader | null = null;

export function characterLoader(): GLTFLoader {
  if (!sharedLoader) {
    sharedLoader = new GLTFLoader();
    sharedLoader.setMeshoptDecoder(MeshoptDecoder);
  }
  return sharedLoader;
}

export async function loadCharacter(def: CharacterDef, loader = characterLoader()): Promise<LoadedCharacter> {
  const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}${def.modelUrl}`);
  const object = new THREE.Group();
  object.name = `character-${def.id}`;
  const model = gltf.scene;
  model.scale.setScalar(def.scale);
  object.add(model);
  // One skinned mesh per material (the robot: 19 meshes → 5 draws per pass).
  mergeCharacterMeshes(model, gltf.animations);
  if (def.smooth) smoothNormals(model);
  warmCharacter(model, def.warm);
  model.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = false;
      o.frustumCulled = false; // skinned bounds don't follow animations
    }
  });
  // Face: eyes, lids and blush on pivots under the head bone, merged into one extra draw.
  let face: FaceRig | null = null;
  const faceBone = def.face ? model.getObjectByName(def.face.bone) : undefined;
  if (def.face && faceBone) {
    object.updateMatrixWorld(true);
    face = buildFace(def.face, object, faceBone);
    mergeCharacterMeshes(model, gltf.animations, (m) => m.name === 'face-part');
    model.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.name.startsWith('merged-hero-face')) {
        o.castShadow = false;
        o.frustumCulled = false;
      }
    });
  }
  const life: Life = createLife(model, face, { springs: def.springs, head: def.face?.bone, scale: def.scale, steps: def.steps });

  // Anchors: positioned at the rest pose in character space (metres), then re-parented onto
  // their bone keeping the world transform, so they follow the animation.
  object.updateMatrixWorld(true);
  const anchors = {} as Record<AttachPart, THREE.Object3D>;
  for (const part of Object.keys(def.attach) as AttachPart[]) {
    const spot = def.attach[part];
    const anchor = new THREE.Object3D();
    anchor.name = `attach-${part}`;
    anchor.position.fromArray(spot.offset);
    if (spot.rotation) anchor.rotation.set(spot.rotation[0], spot.rotation[1], spot.rotation[2]);
    if (spot.scale !== undefined) anchor.scale.setScalar(spot.scale);
    object.add(anchor);
    anchor.updateMatrixWorld(true);
    const bone = model.getObjectByName(spot.bone);
    if (bone) bone.attach(anchor);
    anchors[part] = anchor;
  }

  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map<string, THREE.AnimationAction>();
  for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
  let current: THREE.AnimationAction | null = null;
  let currentRef: ClipRef | null = null;
  let currentAnim: PlayerAnim | 'emote' | null = null;
  let currentRate = 1;
  /** The idle fidget dance is playing in place of the idle clip. */
  let fidgetAction: THREE.AnimationAction | null = null;
  const fidgetRef = def.emote.loop ? def.emote : def.anims.dance;

  // Seated pose layer (catalog `seat`): eased in while the `sit` clip plays.
  const seatBones: { bone: THREE.Object3D; q: THREE.Quaternion; saved: THREE.Quaternion }[] = [];
  for (const [name, e] of Object.entries(def.seat?.bones ?? {})) {
    const bone = model.getObjectByName(name);
    if (bone) {
      seatBones.push({ bone, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(e[0], e[1], e[2])), saved: new THREE.Quaternion() });
    }
  }
  const seatOffset = new THREE.Vector3().fromArray(def.seat?.offset ?? [0, 0, 0]);
  const tmpQ = new THREE.Quaternion();
  let seatW = 0;
  let seatApplied = false;

  return {
    def,
    object,
    anchors,
    mixer,
    face,
    express(state, seconds = 1.6) {
      life.express(state, seconds);
    },
    play(anim, rate = 1, fade = 0.18, restart = false) {
      const ref = anim === 'emote' ? def.emote : def.anims[anim];
      const next = actions.get(ref.clip);
      if (!next) return;
      currentRate = rate;
      if (fidgetAction) {
        if (anim === 'idle' && !restart) return;
        // Leave the fidget: fade from it to whatever was asked.
        current = fidgetAction;
        fidgetAction = null;
        currentRef = null;
      }
      next.timeScale = rate * (ref.rate ?? 1);
      // Same clip again: keep it (a finished one-shot stays clamped on its last frame instead of
      // restarting every frame; the robot's jump → fall share one clip and just continue).
      if (next === current && !restart && (ref === currentRef || !ref.loop)) {
        currentRef = ref;
        return;
      }
      next.reset();
      next.setLoop(ref.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      next.clampWhenFinished = !ref.loop;
      next.enabled = true;
      next.setEffectiveWeight(1);
      if (ref.startAt) next.time = ref.startAt * next.getClip().duration;
      next.play();
      if (current && current !== next) {
        if (fade > 0) current.crossFadeTo(next, fade, false);
        else current.stop();
      }
      current = next;
      currentRef = ref;
      currentAnim = anim;
    },
    update(dt) {
      // Undo last frame's seat and life layers first (bones the clip doesn't key would otherwise accumulate).
      if (seatApplied) for (const s of seatBones) s.bone.quaternion.copy(s.saved);
      seatApplied = false;
      life.restore();
      // Idle fidget: a little dance when left alone, then back to idle.
      if (life.fidget && currentAnim === 'idle' && !fidgetAction && current) {
        const f = actions.get(fidgetRef.clip);
        if (f && f !== current) {
          f.reset();
          f.setLoop(THREE.LoopRepeat, Infinity);
          f.timeScale = fidgetRef.rate ?? 1;
          f.enabled = true;
          f.setEffectiveWeight(1);
          f.play();
          current.crossFadeTo(f, 0.35, false);
          fidgetAction = f;
        }
      } else if (fidgetAction && !life.fidget && current) {
        current.reset();
        current.enabled = true;
        current.setEffectiveWeight(1);
        current.play();
        fidgetAction.crossFadeTo(current, 0.35, false);
        fidgetAction = null;
      }
      mixer.update(dt);
      const act = fidgetAction ?? current;
      const dur = act ? act.getClip().duration : 1;
      life.update(dt, fidgetAction ? 'emote' : currentAnim, act && dur > 0 ? (act.time / dur) % 1 : 0, currentRate);
      if (!def.seat) return;
      const target = currentAnim === 'sit' ? 1 : 0;
      seatW = target > seatW ? Math.min(1, seatW + dt / 0.3) : Math.max(0, seatW - dt / 0.2);
      model.position.copy(seatOffset).multiplyScalar(seatW);
      if (seatW <= 0) return;
      for (const s of seatBones) {
        s.saved.copy(s.bone.quaternion);
        tmpQ.identity().slerp(s.q, seatW);
        s.bone.quaternion.multiply(tmpQ);
      }
      seatApplied = true;
    },
  };
}
