/** Rapier world + static-geometry helpers + raycasts. Fixed 60 Hz stepping. */
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { FIXED_DT, PLAYER } from '../config';
import type { GameContext, PhysicsApi } from '../types';

/**
 * Collision-group bit for the player's own capsule (and later vehicle chassis/horse). Colliders in
 * this group are skipped by `PhysicsApi.raycast` so camera and gameplay rays never hit the avatar.
 */
export const GROUP_AVATAR = 0x0002;
/** Vehicle chassis: solid for the walking player and props, but skipped by `PhysicsApi.raycast`. */
export const GROUP_VEHICLE = 0x0004;
/**
 * Invisible movement helpers (no mesh of their own: slide fills, wedges round a post). Solid for
 * everything, and ordinary rays (camera, gameplay probes) still hit them, but a sightline query
 * (`raycast(..., { visibleOnly: true })`: "can the player see that?") skips them.
 */
export const GROUP_HELPER = 0x0008;
const ALL = 0xffff;
/** membership << 16 | filter */
export const groups = (membership: number, filter: number): number => ((membership & ALL) << 16) | (filter & ALL);
/** Query groups for rays that ignore the avatar and vehicle bodies (camera, gameplay probes). */
export const RAY_GROUPS = groups(ALL, ALL & ~GROUP_AVATAR & ~GROUP_VEHICLE);
/** Sightline rays: like `RAY_GROUPS`, and also skip invisible helpers (`GROUP_HELPER`). */
export const SIGHT_RAY_GROUPS = groups(ALL, ALL & ~GROUP_AVATAR & ~GROUP_VEHICLE & ~GROUP_HELPER);

/**
 * Fixed-step hooks. `physics.step(dt)` runs whole 1/60 s steps; anything simulated in those
 * steps (the buggy) must do its own integration in `beforeStep`, record its pose in `afterStep`,
 * and draw at `alpha` (0..1, how far the render frame is between the last two steps) so it moves
 * smoothly at any display rate instead of 0 or 2 steps per frame.
 */
export interface FixedStepHooks {
  /** Run before every fixed world step (dt = FIXED_DT). Returns an unsubscribe function. */
  onBeforeStep(fn: (dt: number) => void): () => void;
  /** Run after every fixed world step. Returns an unsubscribe function. */
  onAfterStep(fn: () => void): () => void;
  /** Leftover accumulator time after the last `step`, as a fraction of FIXED_DT (0..1). */
  readonly alpha: number;
}

const hooksOf = new WeakMap<PhysicsApi, FixedStepHooks>();

/** The fixed-step hooks of a physics world made by `createPhysics`/`createPhysicsSync`. */
export function fixedStepHooks(physics: PhysicsApi): FixedStepHooks {
  const h = hooksOf.get(physics);
  if (!h) throw new Error('fixedStepHooks: unknown physics world');
  return h;
}

/** Longest stretch of game time one `step` call may simulate (more is dropped: slow motion). */
export const MAX_STEPS_PER_FRAME = 5;

/** Rapier wants column-major (x outer, z inner); the API takes row-major [z][x]. */
export function rowMajorToRapier(nx: number, nz: number, heights: Float32Array): Float32Array {
  const h = new Float32Array((nx + 1) * (nz + 1));
  for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++) h[x * (nz + 1) + z] = heights[z * (nx + 1) + x];
  return h;
}

export async function createPhysics(_ctx: Pick<GameContext, 'events'>): Promise<PhysicsApi> {
  await RAPIER.init();
  return createPhysicsSync();
}

/** Synchronous constructor (after `RAPIER.init()`); used by unit tests. */
export function createPhysicsSync(): PhysicsApi {
  const world = new RAPIER.World({ x: 0, y: -PLAYER.gravity, z: 0 });
  world.timestep = FIXED_DT;
  const fixed = (desc: RAPIER.ColliderDesc, p: THREE.Vector3, q?: THREE.Quaternion): RAPIER.Collider => {
    desc.setTranslation(p.x, p.y, p.z);
    if (q) desc.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w });
    return world.createCollider(desc);
  };
  const dirN = new THREE.Vector3();
  let acc = 0;
  const before: ((dt: number) => void)[] = [];
  const after: (() => void)[] = [];
  const sub = <T>(list: T[], fn: T): (() => void) => {
    list.push(fn);
    return () => {
      const i = list.indexOf(fn);
      if (i >= 0) list.splice(i, 1);
    };
  };
  const hooks: FixedStepHooks = {
    onBeforeStep: (fn) => sub(before, fn),
    onAfterStep: (fn) => sub(after, fn),
    get alpha() {
      return Math.min(1, Math.max(0, acc / FIXED_DT));
    },
  };
  const api: PhysicsApi = {
    rapier: RAPIER,
    world,
    addStaticBox: (c, h, q) => fixed(RAPIER.ColliderDesc.cuboid(h.x, h.y, h.z), c, q),
    addStaticCylinder: (c, hh, r) => fixed(RAPIER.ColliderDesc.cylinder(hh, r), c),
    addStaticSphere: (c, r) => fixed(RAPIER.ColliderDesc.ball(r), c),
    addStaticMesh(mesh) {
      mesh.updateWorldMatrix(true, false);
      const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      const pos = new Float32Array(g.attributes.position.array);
      const idx = g.index ? new Uint32Array(g.index.array) : Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
      g.dispose();
      return world.createCollider(RAPIER.ColliderDesc.trimesh(pos, idx));
    },
    addHeightfield(nx, nz, heights, size) {
      const h = rowMajorToRapier(nx, nz, heights);
      return world.createCollider(RAPIER.ColliderDesc.heightfield(nz, nx, h, { x: size.x, y: 1, z: size.z }));
    },
    removeCollider: (c) => world.removeCollider(c, true),
    raycast(origin, dir, maxDist, opts) {
      const len = dir.length();
      if (len < 1e-9 || !(maxDist > 0)) return null;
      dirN.copy(dir).divideScalar(len);
      const ray = new RAPIER.Ray({ x: origin.x, y: origin.y, z: origin.z }, { x: dirN.x, y: dirN.y, z: dirN.z });
      const hit = world.castRayAndGetNormal(ray, maxDist, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, opts?.visibleOnly ? SIGHT_RAY_GROUPS : RAY_GROUPS);
      if (!hit) return null;
      const p = ray.pointAt(hit.timeOfImpact);
      return {
        point: new THREE.Vector3(p.x, p.y, p.z),
        normal: new THREE.Vector3(hit.normal.x, hit.normal.y, hit.normal.z),
        distance: hit.timeOfImpact,
      };
    },
    step(dt) {
      acc = Math.min(acc + Math.max(0, dt), MAX_STEPS_PER_FRAME * FIXED_DT);
      while (acc >= FIXED_DT - 1e-6) {
        for (let i = 0; i < before.length; i++) before[i](FIXED_DT);
        world.step();
        for (let i = 0; i < after.length; i++) after[i]();
        acc -= FIXED_DT;
      }
      if (acc < 0) acc = 0;
    },
  };
  hooksOf.set(api, hooks);
  return api;
}
