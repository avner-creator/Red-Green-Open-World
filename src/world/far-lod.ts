/**
 * Distance LOD for everything the attractions add to the scene (outside the world's own batcher).
 *
 * Every mesh under a top-level scene object (and under extra roots handed in with `addFarRoot`,
 * e.g. vision-layer objects) gets the same size-class draw distances as the merged static props:
 * small parts stop drawing where they would be a few pixels tall, big shells (r ≥ 4 m) always draw.
 * Hiding works through `layers` (mask 0 = no camera draws it, shadow map included), so it never
 * touches an object's own `visible` flag, which gameplay code owns.
 *
 * Skipped: meshes with `frustumCulled = false` (their bounds are not meaningful: shader-placed or
 * culled by their owner), and the player, the buddy and the world root (the world LODs itself).
 */
import * as THREE from 'three';
import type { Quality } from '../types';
import { STATIC_MAX_DIST } from './batch';

/** Size classes by world bounding radius (m), the same as the static batcher's. */
const CLASS_R = [0.3, 0.6, 1.5, 4] as const;
/** Top-level objects never touched. */
const SKIP_ROOT = /^(world|player|pip|skill-|Vision\.)/;
/** Re-scan the scene for new objects this often (frames). */
const RESCAN = 90;

interface Entry {
  obj: THREE.Object3D;
  /** The mask the object had when registered (restored when it comes back into range). */
  mask: number;
  hidden: boolean;
  /** Local bounding sphere (geometry or instanced bounds). */
  sphere: THREE.Sphere;
}

const extraRoots = new Set<THREE.Object3D>();
const entries = new Map<THREE.Object3D, Entry>();

/** Put an object outside `ctx.scene` (e.g. a vision-layer root) under the same distance LOD. */
export function addFarRoot(root: THREE.Object3D): void {
  extraRoots.add(root);
  frame = RESCAN; // pick it up on the next update
}

/** Never distance-cull this object or anything under it (e.g. a hero prop seen from far away). */
export function keepNear(obj: THREE.Object3D): void {
  obj.userData.farLodKeep = true;
}

function sphereOf(o: THREE.Object3D): THREE.Sphere | null {
  const m = o as THREE.Mesh;
  if (!m.geometry || o.frustumCulled === false) return null;
  const inst = o as THREE.InstancedMesh;
  if (inst.isInstancedMesh) {
    if (!inst.boundingSphere) inst.computeBoundingSphere();
    return inst.boundingSphere;
  }
  if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
  return m.geometry.boundingSphere;
}

function collect(root: THREE.Object3D, seen: Set<THREE.Object3D>): void {
  const walk = (o: THREE.Object3D): void => {
    if (o.userData.farLodKeep) return;
    if ((o as THREE.Mesh).isMesh || (o as THREE.Line).isLine || (o as THREE.Points).isPoints) {
      seen.add(o);
      if (!entries.has(o)) {
        const s = sphereOf(o);
        if (s && Number.isFinite(s.radius)) entries.set(o, { obj: o, mask: o.layers.mask, hidden: false, sphere: s });
      }
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
}

let frame = RESCAN;
const lastCam = new THREE.Vector3(1e9, 0, 0);
const cam = new THREE.Vector3();
const c = new THREE.Vector3();

/** Called by the world every frame (after the activities' updates). */
export function updateFarLod(scene: THREE.Scene, camera: THREE.Camera, quality: Quality): void {
  camera.getWorldPosition(cam);
  let force = false;
  if (++frame >= RESCAN) {
    frame = 0;
    force = true;
    const seen = new Set<THREE.Object3D>();
    for (const o of scene.children) if (!SKIP_ROOT.test(o.name) && !o.userData.farLodKeep) collect(o, seen);
    for (const r of extraRoots) collect(r, seen);
    for (const [o, e] of entries) {
      if (seen.has(o)) continue;
      if (e.hidden) o.layers.mask = e.mask;
      entries.delete(o);
    }
  }
  // Moving things (rival buggies, the dragon) need a refresh too, but a few frames late is fine.
  if (!force && cam.distanceToSquared(lastCam) < 1 && frame % 15 !== 0) return;
  lastCam.copy(cam);
  const maxD = STATIC_MAX_DIST[quality];
  for (const e of entries.values()) {
    const o = e.obj;
    c.copy(e.sphere.center).applyMatrix4(o.matrixWorld);
    const r = e.sphere.radius * o.matrixWorld.getMaxScaleOnAxis();
    let cls = 0;
    while (cls < CLASS_R.length && r < CLASS_R[CLASS_R.length - 1 - cls]) cls++;
    const far = c.distanceTo(cam) - r > maxD[cls];
    if (far === e.hidden) continue;
    if (far) {
      e.mask = o.layers.mask;
      o.layers.mask = 0;
    } else o.layers.mask = e.mask;
    e.hidden = far;
  }
}
