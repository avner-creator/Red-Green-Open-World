/**
 * The robot avatar: CC0 "RobotExpressive" by Tomás Laulhé (Quaternius), recoloured so it reads
 * in both the R-only and G-only channels (light body, dark accents). Falls back to a simple
 * procedural robot if the GLB can't load.
 *
 * Hierarchy: root (feet, yaw) → squash (feet; squash & stretch, pop) → spin (body centre; flop
 * tumble) → model. Attach anchors live on the head/torso bones, in metres, +Y up, +Z forward.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PLAYER } from '../config';
import type { PlayerAnim } from '../types';

export type AttachPart = 'head' | 'back' | 'face';

interface ClipSpec {
  clip: string;
  loop: boolean;
}

/** PlayerAnim → clip. "Death"/"Punch" are deliberately never used. */
const CLIPS: Record<PlayerAnim, ClipSpec> = {
  idle: { clip: 'Idle', loop: true },
  walk: { clip: 'Walking', loop: true },
  run: { clip: 'Running', loop: true },
  jump: { clip: 'Jump', loop: false },
  fall: { clip: 'Jump', loop: false },
  flop: { clip: 'Jump', loop: false },
  dance: { clip: 'Dance', loop: true },
  wave: { clip: 'Wave', loop: true },
  cheer: { clip: 'ThumbsUp', loop: false },
  sit: { clip: 'Sitting', loop: false },
};

/** Colours chosen to separate in luminance in both R and G (no hue-only cues). */
const RECOLOR: Record<string, number> = { Main: 0xeae6dc, Grey: 0x3d434d, Black: 0x15171a };

/** Rest-pose anchor positions in model units (model is ~4.8 units tall, faces +Z). */
const ANCHOR_SPOTS: Record<AttachPart, { bone: RegExp; pos: [number, number, number] }> = {
  head: { bone: /^Head/, pos: [0, 4.6, 0] },
  face: { bone: /^Head/, pos: [0, 3.55, 1.6] },
  back: { bone: /^Torso/, pos: [0, 2.1, -0.72] },
};

export interface PlayerModel {
  readonly root: THREE.Group;
  readonly squash: THREE.Group;
  readonly spin: THREE.Group;
  readonly anchors: Record<AttachPart, THREE.Object3D>;
  /** Play an animation (cross-fades). `rate` scales playback speed. */
  play(anim: PlayerAnim, rate?: number): void;
  update(dt: number): void;
  /** Body centre height above the feet (pivot for the tumble). */
  readonly centre: number;
}

let cachedGltf: Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] } | null> | null = null;

function loadGltf(url: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] } | null> {
  cachedGltf ??= new GLTFLoader()
    .loadAsync(url)
    .then((g) => ({ scene: g.scene, animations: g.animations }))
    .catch((err: unknown) => {
      console.warn('player model failed to load, using fallback', err);
      return null;
    });
  return cachedGltf;
}

function fallbackRobot(): THREE.Group {
  const g = new THREE.Group();
  const light = new THREE.MeshStandardMaterial({ color: RECOLOR.Main, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: RECOLOR.Grey, roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.5, 4, 12), light);
  body.position.y = 0.7;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.45, 0.5), light);
  head.position.y = 1.4;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.05), dark);
  visor.position.set(0, 1.42, 0.26);
  g.add(body, head, visor);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return g;
}

export async function createPlayerModel(url: string): Promise<PlayerModel> {
  const root = new THREE.Group();
  root.name = 'player';
  const squash = new THREE.Group();
  const spin = new THREE.Group();
  const centre = PLAYER.height * 0.5;
  spin.position.y = centre;
  root.add(squash);
  squash.add(spin);

  const anchors = {} as Record<AttachPart, THREE.Object3D>;
  let mixer: THREE.AnimationMixer | null = null;
  const actions = new Map<string, THREE.AnimationAction>();
  let current: THREE.AnimationAction | null = null;

  const gltf = await loadGltf(url);
  if (gltf) {
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const s = PLAYER.height / Math.max(0.01, box.max.y - box.min.y);
    model.scale.setScalar(s);
    model.position.y = -box.min.y * s - centre;
    model.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = false;
        o.frustumCulled = false; // skinned bounds don't follow animations
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          const hex = RECOLOR[m.name];
          if (hex !== undefined && m instanceof THREE.MeshStandardMaterial) {
            m.color.setHex(hex);
            m.roughness = 0.65;
            m.metalness = 0.05;
          }
        }
      }
    });
    spin.add(model);
    // Anchors: place in model space at rest pose, then re-parent onto the bone keeping the world
    // transform, so outfit meshes are authored in metres (+Y up, +Z forward) and follow the bone.
    root.updateMatrixWorld(true);
    for (const part of Object.keys(ANCHOR_SPOTS) as AttachPart[]) {
      const spot = ANCHOR_SPOTS[part];
      const anchor = new THREE.Object3D();
      anchor.name = `attach-${part}`;
      anchor.position.set(...spot.pos);
      model.add(anchor);
      anchor.scale.setScalar(1 / s);
      anchor.updateMatrixWorld(true);
      let bone: THREE.Object3D | null = null;
      model.traverse((o) => {
        if (!bone && (o as THREE.Bone).isBone && spot.bone.test(o.name)) bone = o;
      });
      if (bone) (bone as THREE.Object3D).attach(anchor);
      anchors[part] = anchor;
    }
    mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
  } else {
    const model = fallbackRobot();
    model.position.y = -centre;
    spin.add(model);
    const spots: Record<AttachPart, [number, number, number]> = { head: [0, 1.63, 0], face: [0, 1.42, 0.3], back: [0, 0.8, -0.3] };
    for (const part of Object.keys(spots) as AttachPart[]) {
      const a = new THREE.Object3D();
      a.position.set(...spots[part]);
      model.add(a);
      anchors[part] = a;
    }
  }

  return {
    root,
    squash,
    spin,
    anchors,
    centre,
    play(anim, rate = 1) {
      const spec = CLIPS[anim];
      const next = actions.get(spec.clip);
      if (!next) return;
      next.timeScale = rate;
      if (next === current) return;
      next.reset();
      next.setLoop(spec.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      next.clampWhenFinished = !spec.loop;
      next.enabled = true;
      next.setEffectiveWeight(1);
      next.play();
      if (current) current.crossFadeTo(next, 0.18, false);
      current = next;
    },
    update(dt) {
      mixer?.update(dt);
    },
  };
}
