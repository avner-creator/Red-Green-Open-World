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
import { clusterSimplify } from './simplify';

/** Size classes by world bounding radius (m), the same as the static batcher's. */
const CLASS_R = [0.3, 0.6, 1.5, 4] as const;
/** Top-level objects never touched. */
const SKIP_ROOT = /^(world|player|pip|skill-|Vision\.)/;
/**
 * Draw distance per size class. Medium/High: the static props' distances. Low trims every class and
 * also drops whole attraction shells (r ≥ 4 m) beyond 150 m, where the haze already softens them.
 */
const MAX_DIST: Record<Quality, readonly number[]> = {
  low: [150, 50, 40, 26, 18],
  medium: STATIC_MAX_DIST.medium,
  high: STATIC_MAX_DIST.high,
};
/**
 * Big, heavy static meshes (attraction shells: booths, parlour, balloon envelope, arenas) swap to a
 * vertex-clustered stand-in (`simplify.ts`) beyond `STAND_IN_DIST` metres (Low and Medium; High
 * never). Up close they are the original mesh, so the close-up look never changes.
 */
const STAND_IN = { minTris: 3000, minR: 2.5, cells: 28 } as const;
const STAND_IN_DIST: Record<Quality, number> = { low: 25, medium: 70, high: Infinity };
/** Stand-ins per source geometry (shared geometries share their stand-in); null = not worth one. */
const standIns = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry | null>();

/** Can this mesh get a stand-in? Plain static meshes only (no skinning, morphs, dynamic attributes). */
function standInOk(o: THREE.Object3D): boolean {
  const m = o as THREE.Mesh;
  if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material)) return false;
  const g = m.geometry;
  if (g.morphAttributes.position || g.groups.length > 1) return false;
  if (Object.values(g.attributes).some((a) => (a as THREE.BufferAttribute).usage !== undefined && (a as THREE.BufferAttribute).usage !== THREE.StaticDrawUsage)) return false;
  const tris = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  return tris >= STAND_IN.minTris;
}

function standInFor(g: THREE.BufferGeometry, r: number): THREE.BufferGeometry | null {
  let s = standIns.get(g);
  if (s === undefined) {
    s = clusterSimplify(g, (2 * r) / STAND_IN.cells);
    standIns.set(g, s);
  }
  return s;
}

/** Re-scan the scene for new objects this often (frames). */
const RESCAN = 90;

interface Entry {
  obj: THREE.Object3D;
  /** The mask the object had when registered (restored when it comes back into range). */
  mask: number;
  hidden: boolean;
  /** Local bounding sphere (geometry or instanced bounds). */
  sphere: THREE.Sphere;
  /**
   * Objects without usable bounds (`frustumCulled = false`: instanced crowds, skinned characters)
   * are placed by their root's site: the bounds of the root's other meshes, in root space. Their
   * size class still comes from their own geometry.
   */
  site: Site | null;
  /** Low stand-in: eligible, and the original geometry while the stand-in is shown. */
  standIn: boolean;
  original: THREE.BufferGeometry | null;
}

interface Site {
  root: THREE.Object3D;
  /** Centre in root-local space and radius (world units). */
  center: THREE.Vector3;
  r: number;
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
  if (!m.geometry) return null;
  if (o.frustumCulled === false) {
    if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
    return m.geometry.boundingSphere;
  }
  const inst = o as THREE.InstancedMesh;
  if (inst.isInstancedMesh) {
    if (!inst.boundingSphere) inst.computeBoundingSphere();
    return inst.boundingSphere;
  }
  if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
  return m.geometry.boundingSphere;
}

const _box = new THREE.Box3();
const _sb = new THREE.Box3();
const _inv = new THREE.Matrix4();
const _sp = new THREE.Sphere();

function collect(root: THREE.Object3D, seen: Set<THREE.Object3D>): void {
  root.updateWorldMatrix(false, true);
  _box.makeEmpty();
  const loose: Entry[] = [];
  const walk = (o: THREE.Object3D): void => {
    if (o.userData.farLodKeep) return;
    if ((o as THREE.Mesh).isMesh || (o as THREE.Line).isLine || (o as THREE.Points).isPoints) {
      seen.add(o);
      let e = entries.get(o);
      if (!e) {
        const s = sphereOf(o);
        if (s && Number.isFinite(s.radius)) entries.set(o, (e = { obj: o, mask: o.layers.mask, hidden: false, sphere: s, site: null, standIn: o.frustumCulled && standInOk(o), original: null }));
      }
      if (e && o.frustumCulled === false) loose.push(e);
      else if (e && o.visible) {
        _sp.copy(e.sphere).applyMatrix4(o.matrixWorld);
        _box.union(_sp.getBoundingBox(_sb));
      }
    }
    for (const c of o.children) walk(c);
  };
  walk(root);
  if (!loose.length) return;
  if (_box.isEmpty()) {
    // Only loose meshes (e.g. a root of instanced crowds): place them by their instances' bounds.
    for (const e of loose) {
      const inst = e.obj as THREE.InstancedMesh;
      if (!inst.isInstancedMesh || inst.count === 0) continue;
      inst.computeBoundingSphere();
      if (inst.boundingSphere && Number.isFinite(inst.boundingSphere.radius)) _box.union(_sp.copy(inst.boundingSphere).applyMatrix4(inst.matrixWorld).getBoundingBox(_sb));
    }
  }
  if (_box.isEmpty()) {
    // No bounds to place them by: never hide them.
    for (const e of loose) {
      if (e.hidden) e.obj.layers.mask = e.mask;
      entries.delete(e.obj);
    }
    return;
  }
  _box.getBoundingSphere(_sp);
  const site: Site = { root, center: _sp.center.clone().applyMatrix4(_inv.copy(root.matrixWorld).invert()), r: _sp.radius };
  for (const e of loose) e.site = site;
}

function swapBack(e: Entry): void {
  if (!e.original) return;
  (e.obj as THREE.Mesh).geometry = e.original;
  e.original = null;
}

let frame = RESCAN;
const lastCam = new THREE.Vector3(1e9, 0, 0);
let lastQuality: Quality | null = null;
const cam = new THREE.Vector3();
const c = new THREE.Vector3();

/** `?nofarlod` (debug, for before/after screenshots) turns the distance LOD off. */
const DISABLED = typeof location !== 'undefined' && new URLSearchParams(location.search).has('nofarlod');

/** Called by the world every frame (after the activities' updates). */
export function updateFarLod(scene: THREE.Scene, camera: THREE.Camera, quality: Quality): void {
  if (DISABLED) return;
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
      swapBack(e);
      entries.delete(o);
    }
  }
  // Moving things (rival buggies, the dragon) need a refresh too, but a few frames late is fine.
  if (!force && cam.distanceToSquared(lastCam) < 1 && frame % 15 !== 0) return;
  lastCam.copy(cam);
  const maxD = MAX_DIST[quality];
  if (quality !== lastQuality) {
    lastQuality = quality;
    for (const e of entries.values()) swapBack(e);
  }
  for (const e of entries.values()) {
    const o = e.obj;
    const r = e.sphere.radius * o.matrixWorld.getMaxScaleOnAxis();
    let cls = 0;
    while (cls < CLASS_R.length && r < CLASS_R[CLASS_R.length - 1 - cls]) cls++;
    let d: number;
    if (e.site) d = c.copy(e.site.center).applyMatrix4(e.site.root.matrixWorld).distanceTo(cam) - e.site.r;
    else d = c.copy(e.sphere.center).applyMatrix4(o.matrixWorld).distanceTo(cam) - r;
    const sd = STAND_IN_DIST[quality];
    if (e.standIn && sd < Infinity) {
      const mesh = o as THREE.Mesh;
      if (d > sd && r >= STAND_IN.minR && !e.original) {
        const low = standInFor(mesh.geometry, e.sphere.radius);
        if (low) {
          e.original = mesh.geometry;
          mesh.geometry = low;
        } else e.standIn = false;
      } else if (d < sd - 5) swapBack(e);
    }
    const far = d > maxD[cls];
    if (far === e.hidden) continue;
    if (far) {
      e.mask = o.layers.mask;
      o.layers.mask = 0;
    } else o.layers.mask = e.mask;
    e.hidden = far;
  }
}
