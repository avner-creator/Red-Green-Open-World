/**
 * Townsfolk: six friendly locals standing at their stalls and benches. They are the space-suit
 * hero models re-tinted (pastel) with a straw carnival hat, so no extra download beyond the hero
 * GLBs (each ≤ 420 KB, already in ASSETS.md), and they load only once play starts.
 *
 * They turn their heads (and, if needed, their bodies) to look at the player; cheer when the
 * player does a stunt; wave back at an emote; and when the player stands idle next to one, it turns
 * and points at the nearest ATTRACTION (anchors only — never a gem or key). No dialogue text.
 * One draw call each (+ one in the shadow pass), drawn only within 70 m and in view.
 */
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Anchor, AnchorName, Quality } from '../../types';
import { characterLoader } from '../../core/characters/load';
import { getCharacter } from '../../core/characters/catalog';
import { ATTRACTIONS, FOLK, pointTarget, type FolkDef, type FolkModel } from './places';
import { damp, turnToward, wrapAngle, yawTo } from './math';
import { hatGeo, critterMaterial } from './geo';
import { Pool } from './pool';
import { asShadowProxy } from '../../core/shadow-proxy';

/** Shared capsule the townsfolk cast their shadow with (skinned models skip the shadow pass). */
const FOLK_SHADOW_GEO = new THREE.CapsuleGeometry(0.3, 0.8, 2, 8);

export type FolkState = 'idle' | 'wave' | 'cheer' | 'point';

export interface FolkView {
  cam: THREE.PerspectiveCamera;
  player: { x: number; y: number; z: number; speed: number; onFoot: boolean } | null;
}

interface Folk {
  def: FolkDef;
  y: number;
  root: THREE.Group;
  mixer: THREE.AnimationMixer;
  clips: Map<string, THREE.AnimationAction>;
  cur: THREE.AnimationAction | null;
  head: THREE.Object3D | null;
  upper: THREE.Object3D | null;
  lower: THREE.Object3D | null;
  hat: THREE.Object3D;
  hatColor: THREE.Color;
  yaw: number;
  state: FolkState;
  stateT: number;
  delay: number;
  next: FolkState | null;
  cooldown: number;
  pointAt: { x: number; z: number; name: AnchorName } | null;
  /** The last pointing target (the arm eases down towards rest from it). */
  lastPoint: { x: number; z: number; name: AnchorName } | null;
  headW: number;
  armW: number;
  headYaw: number;
  /** Mixer time debt (far townsfolk animate at a lower rate). */
  acc: number;
}

export interface Townsfolk {
  group: THREE.Group;
  /** Start loading the models (idempotent). */
  load(): Promise<void>;
  update(dt: number, view: FolkView): void;
  setQuality(q: Quality): void;
  /** React to a stunt / emote near the player. */
  cheer(px: number, pz: number): void;
  wave(px: number, pz: number): void;
  /** Contact shadows wanted this frame (Low quality: no shadow map). */
  blobs(out: [number, number, number, number][]): void;
  readonly ready: boolean;
  debug(): { id: string; state: FolkState; x: number; z: number; visible: boolean; pointAt: AnchorName | null }[];
}

const DURATION: Record<FolkState, number> = { idle: 0, wave: 2.6, cheer: 2.0, point: 3.6 };
const CLIP: Record<FolkState, string> = { idle: 'Idle', wave: 'Wave', cheer: 'Jump', point: 'Idle' };
const LOOK_R = 12;
const POINT_R = 6.5;
const IDLE_BEFORE_POINT = 2.2;
const FAR = 70;

const Y_AXIS = new THREE.Vector3(0, 1, 0);
export const FOLK_DEBUG = { ik: true };

export function createTownsfolk(opts: {
  heightAt(x: number, z: number): number;
  anchors: Readonly<Record<AnchorName, Anchor>>;
  addCollider?(center: THREE.Vector3, halfHeight: number, radius: number): void;
}): Townsfolk {
  const group = new THREE.Group();
  group.name = 'life-townsfolk';
  const hats = new Pool('hats', hatGeo(), critterMaterial(), FOLK.length, { anim: true, color: true });
  hats.mesh.castShadow = true;
  group.add(hats.mesh);
  const folk: Folk[] = [];
  let quality: Quality = 'medium';
  let loading: Promise<void> | null = null;
  let ready = false;
  let idleT = 0;
  const places = ATTRACTIONS.map((name) => ({ name, x: opts.anchors[name].position.x, z: opts.anchors[name].position.z }));

  const frustum = new THREE.Frustum();
  const pm = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  const qc = new THREE.Quaternion();
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const m4 = new THREE.Matrix4();

  const play = (f: Folk, state: FolkState): void => {
    const next = f.clips.get(CLIP[state]);
    if (!next || next === f.cur) return;
    next.reset();
    const once = state === 'cheer';
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.enabled = true;
    next.setEffectiveWeight(1);
    next.play();
    if (f.cur) f.cur.crossFadeTo(next, 0.25, false);
    f.cur = next;
  };

  const setState = (f: Folk, s: FolkState): void => {
    if (s !== 'point' && f.pointAt) {
      f.lastPoint = f.pointAt;
      f.pointAt = null;
    }
    f.state = s;
    f.stateT = 0;
    if (f.root.children.length) play(f, s);
  };

  /** Rotate a bone in world space by `q` (applied on the left), keeping its parent. */
  const rw1 = new THREE.Quaternion();
  const rw2 = new THREE.Quaternion();
  const rotateWorld = (bone: THREE.Object3D, q: THREE.Quaternion): void => {
    bone.getWorldQuaternion(rw1);
    rw1.premultiply(q);
    bone.parent!.getWorldQuaternion(rw2);
    bone.quaternion.copy(rw2.invert().multiply(rw1));
  };

  const api: Townsfolk = {
    group,
    get ready() {
      return ready;
    },
    load() {
      if (loading) return loading;
      const loader = characterLoader();
      const models = [...new Set(FOLK.map((f) => f.model))];
      loading = Promise.all(
        models.map(async (m) => {
          const def = getCharacter(m);
          const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}${def.modelUrl}`);
          return [m, gltf] as const;
        }),
      ).then((loaded) => {
        const byModel = new Map<FolkModel, (typeof loaded)[number][1]>(loaded);
        for (const d of FOLK) {
          const gltf = byModel.get(d.model)!;
          const cdef = getCharacter(d.model);
          const model = SkeletonUtils.clone(gltf.scene);
          model.scale.setScalar(cdef.scale);
          model.traverse((o) => {
            const mesh = o as THREE.Mesh;
            if (!mesh.isMesh) return;
            mesh.castShadow = false;
            mesh.receiveShadow = false;
            mesh.frustumCulled = false;
            const src = mesh.material as THREE.MeshStandardMaterial;
            const mat = src.clone();
            mat.color.multiply(new THREE.Color(d.tint));
            mesh.material = mat;
          });
          const root = new THREE.Group();
          root.name = `folk-${d.id}`;
          root.add(model, asShadowProxy(new THREE.Mesh(FOLK_SHADOW_GEO)).translateY(0.75));
          const y = opts.heightAt(d.x, d.z);
          root.position.set(d.x, y, d.z);
          root.rotation.y = d.yaw;
          root.updateMatrixWorld(true);
          // Hat anchor: the catalog's head attach point, re-parented onto the head bone.
          const hat = new THREE.Object3D();
          const spot = cdef.attach.head;
          hat.position.fromArray(spot.offset);
          hat.scale.setScalar((spot.scale ?? 1) * 0.95);
          root.add(hat);
          hat.updateMatrixWorld(true);
          model.getObjectByName(spot.bone)?.attach(hat);
          const mixer = new THREE.AnimationMixer(model);
          const clips = new Map<string, THREE.AnimationAction>();
          for (const c of gltf.animations) clips.set(c.name, mixer.clipAction(c));
          const f = folk.find((x) => x.def.id === d.id)!;
          Object.assign(f, {
            root, mixer, clips, y, hat,
            head: model.getObjectByName('Head') ?? null,
            // GLTFLoader sanitises node names ('UpperArm.R' → 'UpperArmR').
            upper: model.getObjectByName('UpperArmR') ?? null,
            lower: model.getObjectByName('LowerArmR') ?? null,
          });
          f.root.visible = false;
          group.add(root);
          f.cur = null;
          play(f, f.state);
          // Stagger idle cycles so they don't move in lockstep.
          if (f.cur) (f.cur as THREE.AnimationAction).time = (FOLK.indexOf(d) * 0.37) % 1;
          opts.addCollider?.(new THREE.Vector3(d.x, y + 0.9, d.z), 0.85, 0.35);
        }
        ready = true;
      });
      return loading;
    },
    setQuality(q) {
      quality = q;
    },
    cheer(px, pz) {
      FOLK.forEach((d, i) => {
        const f = folk[i];
        if (Math.hypot(d.x - px, d.z - pz) > 45) return;
        f.next = 'cheer';
        f.delay = 0.12 * i;
      });
    },
    wave(px, pz) {
      FOLK.forEach((d, i) => {
        const f = folk[i];
        if (Math.hypot(d.x - px, d.z - pz) > 25) return;
        f.next = 'wave';
        f.delay = 0.3 + 0.1 * i;
      });
    },
    blobs(out) {
      if (quality !== 'low') return;
      for (const f of folk) if (f.root.visible) out.push([f.def.x, f.y, f.def.z, 1.3]);
    },
    update(dt, view) {
      const cam = view.cam;
      pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      frustum.setFromProjectionMatrix(pm);
      const pl = view.player;
      idleT = pl && pl.onFoot && pl.speed < 0.3 ? idleT + dt : 0;
      hats.begin();
      let pointer: Folk | null = null;
      let best = POINT_R;
      if (pl && idleT > IDLE_BEFORE_POINT) {
        for (const f of folk) {
          const d = Math.hypot(f.def.x - pl.x, f.def.z - pl.z);
          if (d < best && f.cooldown <= 0 && f.state === 'idle' && Math.abs(pl.y - f.y) < 3) {
            best = d;
            pointer = f;
          }
        }
      }
      if (pointer) {
        let tgt = places[0];
        let bd = Infinity;
        for (const p of places) {
          const d = Math.hypot(p.x - pointer.def.x, p.z - pointer.def.z);
          if (d < bd) {
            bd = d;
            tgt = p;
          }
        }
        const [tx, tz] = pointTarget(pointer.def.x, pointer.def.z, { x: tgt.x, z: tgt.z, radius: opts.anchors[tgt.name].radius });
        pointer.pointAt = { x: tx, z: tz, name: tgt.name };
        pointer.cooldown = 12;
        setState(pointer, 'point');
      }
      for (let i = 0; i < folk.length; i++) {
        const f = folk[i];
        const d = f.def;
        if (quality === 'low' && !d.low) {
          f.root.visible = false;
          continue;
        }
        f.cooldown = Math.max(0, f.cooldown - dt);
        if (f.next) {
          f.delay -= dt;
          if (f.delay <= 0) {
            setState(f, f.next);
            f.next = null;
          }
        }
        f.stateT += dt;
        if (f.state !== 'idle' && f.stateT > DURATION[f.state]) setState(f, 'idle');
        // Where the body faces.
        const dp = pl ? Math.hypot(pl.x - d.x, pl.z - d.z) : Infinity;
        const toPlayer = pl ? yawTo(d.x, d.z, pl.x, pl.z) : d.yaw;
        let want = d.yaw;
        if (f.state === 'point' && f.pointAt) want = yawTo(d.x, d.z, f.pointAt.x, f.pointAt.z);
        else if ((f.state === 'cheer' || f.state === 'wave') && dp < 45) want = toPlayer;
        else if (dp < LOOK_R && Math.abs(wrapAngle(toPlayer - f.yaw)) > 1.0) want = toPlayer;
        else if (dp < LOOK_R + 4) want = f.yaw;
        f.yaw = turnToward(f.yaw, want, 2.6 * dt);
        // Head turns towards the player (also while pointing: "over there!").
        const headWant = dp < LOOK_R ? 1 : 0;
        f.headW += (headWant - f.headW) * damp(4, dt);
        f.headYaw = THREE.MathUtils.clamp(wrapAngle(toPlayer - f.yaw), -1.0, 1.0);
        f.armW += ((f.state === 'point' && f.stateT > 0.35 ? 1 : 0) - f.armW) * damp(6, dt);
        if (!f.root.children.length) continue;
        // Visibility: near and in view.
        const near = (cam.position.x - d.x) ** 2 + (cam.position.z - d.z) ** 2 < FAR * FAR;
        sphere.center.set(d.x, f.y + 0.9, d.z);
        sphere.radius = 1.4;
        const vis = near && frustum.intersectsSphere(sphere);
        f.root.visible = vis;
        if (!vis) continue;
        f.root.rotation.y = f.yaw;
        // Animate at full rate near the camera, ~20 Hz further away.
        f.acc += dt;
        const camD = cam.position.distanceTo(sphere.center);
        if (camD > 30 && f.acc < 1 / 20) {
          pushHat(f);
          continue;
        }
        f.mixer.update(f.acc);
        f.acc = 0;
        f.root.updateMatrixWorld(true);
        if (FOLK_DEBUG.ik && f.head && f.headW > 0.01) {
          qa.setFromAxisAngle(Y_AXIS, f.headYaw * f.headW);
          rotateWorld(f.head, qa);
          f.head.updateMatrixWorld(true);
        }
        const aim = f.pointAt ?? f.lastPoint;
        if (FOLK_DEBUG.ik && f.upper && aim && f.armW > 0.01) {
          // Aim the upper arm (bone axis +Y) at the target, a little above the horizon.
          f.upper.getWorldPosition(va);
          vb.set(aim.x - va.x, 0, aim.z - va.z).normalize();
          vb.y = 0.25;
          vb.normalize();
          f.upper.getWorldQuaternion(qb);
          va.copy(Y_AXIS).applyQuaternion(qb);
          qc.setFromUnitVectors(va, vb);
          qa.identity().slerp(qc, f.armW);
          rotateWorld(f.upper, qa);
          f.upper.updateMatrixWorld(true);
          if (f.lower) {
            // Straighten the forearm along the same line.
            f.lower.getWorldQuaternion(qb);
            va.copy(Y_AXIS).applyQuaternion(qb);
            qc.setFromUnitVectors(va, vb);
            qa.identity().slerp(qc, f.armW);
            rotateWorld(f.lower, qa);
          }
        }
        pushHat(f);
      }
      hats.end();
    },
    debug() {
      return folk.map((f) => ({ id: f.def.id, state: f.state, x: f.def.x, z: f.def.z, visible: f.root.visible, pointAt: f.pointAt?.name ?? null }));
    },
  };

  const hatQ = new THREE.Quaternion();
  const hatP = new THREE.Vector3();
  const hatS = new THREE.Vector3();
  function pushHat(f: Folk): void {
    f.hat.updateMatrixWorld(true);
    f.hat.matrixWorld.decompose(hatP, hatQ, hatS);
    m4.compose(hatP, hatQ, hatS);
    hats.push(m4, f.hatColor, 0, 0, 0, 0);
  }

  for (const d of FOLK) {
    folk.push({
      def: d, y: opts.heightAt(d.x, d.z), root: new THREE.Group(), mixer: new THREE.AnimationMixer(new THREE.Object3D()), clips: new Map(), cur: null,
      head: null, upper: null, lower: null, hat: new THREE.Object3D(), hatColor: new THREE.Color(d.hat), yaw: d.yaw, state: 'idle', stateT: 0,
      delay: 0, next: null, cooldown: 0, pointAt: null, lastPoint: null, headW: 0, armW: 0, headYaw: 0, acc: 0,
    });
  }
  return api;
}
