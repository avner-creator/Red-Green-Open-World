/**
 * Render-only camera occluders: things the camera must not sit inside or look through that have
 * no physics collider (tree crowns, bushes, merged props, signs, awnings).
 *
 * Sources, found by scanning the scene (nothing for `src/world` to register):
 * - Static shadow-proxy meshes (`SHADOW_PROXY_LAYER`): the world's batcher and the activity sites
 *   already keep a cheap, closed, position-only copy of every big non-flat part for the sun's
 *   shadow. Their triangles are baked once into a 4 m grid in world space. Proxies that move
 *   (cars, balloons, townsfolk) are dropped as soon as they move.
 * - Visible instanced meshes (trees, bushes, rocks, big props): one crown capsule per instance,
 *   refreshed a few times a second near the player from the live instance matrices.
 *
 * Only static world scenery counts (`sceneryKind`): instanced meshes under the `world` root (or opted
 * in with `userData.cameraOccluder = true`), never anything flagged `userData.cameraIgnore = true`
 * (on it or an ancestor), and never a vision-layer object (weak-/strong-eye objects live in their own
 * scenes; a `Vision.*` ancestor is refused as well): the camera must not reveal them to the other eye.
 * Attractions' moving actors (bubbles, suits, balloons) are therefore never obstacles.
 *
 * Queries are one-sided (a ray only hits a surface it enters), so a hero standing inside a crown
 * or a collider-less prop never snaps the camera into their head.
 */
import * as THREE from 'three';
import { SHADOW_PROXY_LAYER } from './shadow-proxy';
import { castCapsule, crownCapsule, rayTriangleFront, type Capsule } from './occluder-math';

const CELL = 4;
const cellKey = (ix: number, iz: number): number => (ix + 8192) * 16384 + (iz + 8192);
/** Capsules are gathered this far around the pivot (m). */
const GATHER_RADIUS = 28;
const GATHER_INTERVAL = 0.2;
const SCAN_INTERVAL = 0.5;
/** A non-`matrixAutoUpdate=false` proxy counts as static after this many unchanged scans. */
const STABLE_SCANS = 3;
/** Proxies bigger than this (bounding radius, m) are terrain-scale and skipped. */
const MAX_PROXY_RADIUS = 400;

interface ProxyEntry {
  stable: number;
  matrix: THREE.Matrix4;
  /** Index into `bakes` once baked. */
  bake: number;
  dynamic: boolean;
}

interface Bake {
  active: boolean;
}

/** `userData` flag: this object and everything under it never blocks the camera. */
export const CAMERA_IGNORE = 'cameraIgnore';
/**
 * `userData` flag: a big static structure outside the `world` root that should block the camera
 * (an instanced mesh, or a plain mesh whose own triangles are baked like a shadow proxy).
 */
export const CAMERA_OCCLUDER = 'cameraOccluder';

/**
 * Whether `o` may block the camera: 'ignore' (opted out, a vision-layer object, or a ridden
 * vehicle), 'world' (static world scenery or opted in) or 'other' (anything else, e.g. an
 * attraction's own pieces: only their static shadow proxies count, dropped once they move).
 */
export function sceneryKind(o: THREE.Object3D): 'ignore' | 'world' | 'other' {
  let kind: 'world' | 'other' = 'other';
  for (let p: THREE.Object3D | null = o; p; p = p.parent) {
    const ud = p.userData as Record<string, unknown> | undefined;
    if (ud?.[CAMERA_IGNORE] === true || p.name.startsWith('Vision.') || /^(buggy|horse)/.test(p.name)) return 'ignore';
    if (kind === 'other' && (ud?.[CAMERA_OCCLUDER] === true || (p.name === 'world' && p.parent !== null && (p.parent as THREE.Scene).isScene))) kind = 'world';
  }
  return kind;
}

export interface CameraOccluders {
  /** Rescan / regather around `center` on internal timers. Call once per frame. */
  update(center: THREE.Vector3, dt: number): void;
  /** Force a rescan and regather now (after a teleport). */
  refresh(center: THREE.Vector3): void;
  /**
   * Distance along unit `dir` from `origin` until a sphere of `radius` touches an occluder, or
   * null within `maxDist`. Triangles are tested with five parallel rays (centre + 4 offsets).
   */
  cast(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, radius: number): number | null;
  /** True if `p` lies inside a crown capsule (or within `pad` of it). */
  inside(p: THREE.Vector3, pad?: number): boolean;
  stats(): { triangles: number; bakes: number; capsules: number };
}

export function createCameraOccluders(scene: THREE.Scene): CameraOccluders {
  // Baked proxy triangles (world space, 9 floats each) and the triangle → bake index.
  let tris = new Float32Array(9 * 4096);
  let triBake = new Int32Array(4096);
  let triCount = 0;
  let stamp = new Uint32Array(4096);
  let query = 1;
  const cells = new Map<number, number[]>();
  const bakes: Bake[] = [];
  const proxies = new WeakMap<THREE.Object3D, ProxyEntry>();
  const instanced: { mesh: THREE.InstancedMesh; local: Capsule }[] = [];
  const instancedSeen = new WeakSet<THREE.InstancedMesh>();
  let capsules: Capsule[] = [];
  let scanT = 0;
  let gatherT = 0;

  const v = new THREE.Vector3();
  const m4 = new THREE.Matrix4();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const sc = new THREE.Vector3();

  function grow(n: number): void {
    if (triCount + n <= triBake.length) return;
    let cap = triBake.length;
    while (cap < triCount + n) cap *= 2;
    const t2 = new Float32Array(cap * 9);
    t2.set(tris.subarray(0, triCount * 9));
    tris = t2;
    const b2 = new Int32Array(cap);
    b2.set(triBake.subarray(0, triCount));
    triBake = b2;
    stamp = new Uint32Array(cap);
    query = 1;
  }

  function bakeMesh(mesh: THREE.Mesh): number {
    const geo = mesh.geometry;
    const pos = geo.getAttribute('position') as THREE.BufferAttribute | undefined;
    const id = bakes.length;
    bakes.push({ active: true });
    if (!pos) return id;
    // The batcher's merged meshes are triangle soups whose index is a per-view subset: use all
    // vertices. Other meshes: their real index (whole, not the draw range).
    const soup = !geo.index || mesh.name.startsWith('static:');
    const idx = soup ? null : geo.index;
    const n = Math.floor((idx ? idx.count : pos.count) / 3);
    grow(n);
    mesh.updateWorldMatrix(true, false);
    const mw = mesh.matrixWorld;
    const flip = mw.determinant() < 0;
    for (let t = 0; t < n; t++) {
      const base = triCount * 9;
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (let k = 0; k < 3; k++) {
        const kk = flip ? 2 - k : k;
        const vi = idx ? idx.getX(t * 3 + kk) : t * 3 + kk;
        v.fromBufferAttribute(pos, vi).applyMatrix4(mw);
        tris[base + k * 3] = v.x;
        tris[base + k * 3 + 1] = v.y;
        tris[base + k * 3 + 2] = v.z;
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
        if (v.z < minZ) minZ = v.z;
        if (v.z > maxZ) maxZ = v.z;
      }
      if (!Number.isFinite(minX) || maxX - minX > 200 || maxZ - minZ > 200) continue;
      triBake[triCount] = id;
      const x0 = Math.floor(minX / CELL);
      const x1 = Math.floor(maxX / CELL);
      const z0 = Math.floor(minZ / CELL);
      const z1 = Math.floor(maxZ / CELL);
      for (let ix = x0; ix <= x1; ix++) {
        for (let iz = z0; iz <= z1; iz++) {
          const key = cellKey(ix, iz);
          let c = cells.get(key);
          if (!c) cells.set(key, (c = []));
          c.push(triCount);
        }
      }
      triCount++;
    }
    return id;
  }

  /** Ridden things (buggies, horses) are never scenery, parked or not. */
  function onVehicle(o: THREE.Object3D): boolean {
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (/^(buggy|horse)/.test(p.name)) return true;
    return false;
  }

  function onProxy(mesh: THREE.Mesh): void {
    let e = proxies.get(mesh);
    if (!e && (onVehicle(mesh) || sceneryKind(mesh) === 'ignore')) {
      proxies.set(mesh, { stable: 0, matrix: new THREE.Matrix4(), bake: -1, dynamic: true });
      return;
    }
    if (!e) {
      const geo = mesh.geometry;
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      const r = (geo.boundingSphere?.radius ?? 0) * mesh.matrixWorld.getMaxScaleOnAxis();
      if (r < 0.5 || r > MAX_PROXY_RADIUS) {
        proxies.set(mesh, { stable: 0, matrix: new THREE.Matrix4(), bake: -1, dynamic: true });
        return;
      }
      e = { stable: mesh.matrixAutoUpdate ? 0 : STABLE_SCANS, matrix: mesh.matrixWorld.clone(), bake: -1, dynamic: false };
      proxies.set(mesh, e);
    } else if (e.dynamic) return;
    else if (!e.matrix.equals(mesh.matrixWorld) && e.bake < 0 && e.stable < STABLE_SCANS) {
      // Moved before it was ever baked (first seen before its first matrix update, or placed a
      // moment later): start counting again. Things that keep moving never settle.
      e.matrix.copy(mesh.matrixWorld);
      e.stable = 0;
      return;
    } else if (!e.matrix.equals(mesh.matrixWorld)) {
      // It moved: a vehicle or a ride, not scenery.
      e.dynamic = true;
      if (e.bake >= 0) bakes[e.bake].active = false;
      return;
    } else e.stable++;
    if (e.bake < 0 && e.stable >= STABLE_SCANS) e.bake = bakeMesh(mesh);
  }

  function onInstanced(mesh: THREE.InstancedMesh): void {
    if (instancedSeen.has(mesh)) return;
    instancedSeen.add(mesh);
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!pos || pos.itemSize !== 3 || (pos as unknown as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) return;
    const local = crownCapsule(pos.array);
    if (local) instanced.push({ mesh, local });
  }

  function scan(): void {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || (o as THREE.SkinnedMesh).isSkinnedMesh) return;
      const proxyOnly = o.layers.mask === 1 << SHADOW_PROXY_LAYER;
      if ((o as THREE.InstancedMesh).isInstancedMesh) {
        // Instance matrices are rewritten every frame by scatter LOD too, so motion cannot be told
        // apart from culling: only world scenery (or opted-in structures) counts.
        if (!proxyOnly && o.layers.isEnabled(0) && !instancedSeen.has(o as THREE.InstancedMesh)) {
          if (sceneryKind(o) === 'world') onInstanced(o as THREE.InstancedMesh);
          else instancedSeen.add(o as THREE.InstancedMesh);
        }
        return;
      }
      // Shadow proxies, and render meshes of big static structures that opted in (baked like a
      // proxy: their own triangles, dropped as soon as they move).
      if (proxyOnly || (mesh.userData as Record<string, unknown>)[CAMERA_OCCLUDER] === true) onProxy(mesh);
    });
  }

  function visibleChain(o: THREE.Object3D): boolean {
    let p: THREE.Object3D = o;
    for (; p.parent; p = p.parent) if (!p.visible) return false;
    // Removed from the scene: no longer an obstacle.
    return p === scene;
  }

  function gather(center: THREE.Vector3): void {
    const out: Capsule[] = [];
    const r2 = GATHER_RADIUS * GATHER_RADIUS;
    for (const { mesh, local } of instanced) {
      if (mesh.count === 0 || !visibleChain(mesh)) continue;
      mesh.updateWorldMatrix(true, false);
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m4);
        m4.premultiply(mesh.matrixWorld);
        a.set(local.ax, local.ay, local.az).applyMatrix4(m4);
        const dx = a.x - center.x;
        const dz = a.z - center.z;
        if (dx * dx + dz * dz > r2) continue;
        b.set(local.bx, local.by, local.bz).applyMatrix4(m4);
        // Instances are scaled uniformly-ish in x/z; take the horizontal scale for the radius.
        sc.setFromMatrixColumn(m4, 0);
        const sx = sc.length();
        sc.setFromMatrixColumn(m4, 2);
        const s = Math.max(sx, sc.length());
        if (!(s > 1e-4)) continue;
        out.push({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, r: local.r * s });
      }
    }
    capsules = out;
  }

  const o2 = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3();
  const offs = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const;

  function castTris(origin: THREE.Vector3, dir: THREE.Vector3, maxDist: number, radius: number): number | null {
    if (triCount === 0) return null;
    const ex = origin.x + dir.x * maxDist;
    const ez = origin.z + dir.z * maxDist;
    const x0 = Math.floor((Math.min(origin.x, ex) - radius) / CELL);
    const x1 = Math.floor((Math.max(origin.x, ex) + radius) / CELL);
    const z0 = Math.floor((Math.min(origin.z, ez) - radius) / CELL);
    const z1 = Math.floor((Math.max(origin.z, ez) + radius) / CELL);
    side.set(-dir.z, 0, dir.x);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    up.crossVectors(side, dir).normalize();
    let best: number | null = null;
    const rays = radius > 0 ? offs.length : 1;
    for (let r = 0; r < rays; r++) {
      const [sx, sy] = offs[r];
      o2.copy(origin).addScaledVector(side, sx * radius).addScaledVector(up, sy * radius);
      if (++query >= 0xffffffff) {
        stamp.fill(0);
        query = 1;
      }
      for (let ix = x0; ix <= x1; ix++) {
        for (let iz = z0; iz <= z1; iz++) {
          const c = cells.get(cellKey(ix, iz));
          if (!c) continue;
          for (let k = 0; k < c.length; k++) {
            const t = c[k];
            if (stamp[t] === query) continue;
            stamp[t] = query;
            if (!bakes[triBake[t]].active) continue;
            const hit = rayTriangleFront(tris, t * 9, o2, dir, best ?? maxDist);
            if (hit !== null && (best === null || hit < best)) best = hit;
          }
        }
      }
    }
    return best;
  }

  const api: CameraOccluders = {
    update(center, dt) {
      scanT -= dt;
      gatherT -= dt;
      if (scanT <= 0) {
        scanT = SCAN_INTERVAL;
        scan();
      }
      if (gatherT <= 0) {
        gatherT = GATHER_INTERVAL;
        gather(center);
      }
    },
    refresh(center) {
      scan();
      gather(center);
      scanT = SCAN_INTERVAL;
      gatherT = GATHER_INTERVAL;
    },
    cast(origin, dir, maxDist, radius) {
      let best = castTris(origin, dir, maxDist, radius);
      for (const c of capsules) {
        const t = castCapsule(c, origin, dir, best ?? maxDist, radius);
        if (t !== null && (best === null || t < best)) best = t;
      }
      return best;
    },
    inside(p, pad = 0) {
      for (const c of capsules) {
        const abx = c.bx - c.ax;
        const aby = c.by - c.ay;
        const abz = c.bz - c.az;
        const ab2 = abx * abx + aby * aby + abz * abz;
        let t = ab2 > 1e-9 ? ((p.x - c.ax) * abx + (p.y - c.ay) * aby + (p.z - c.az) * abz) / ab2 : 0;
        t = Math.max(0, Math.min(1, t));
        const dx = p.x - c.ax - abx * t;
        const dy = p.y - c.ay - aby * t;
        const dz = p.z - c.az - abz * t;
        if (dx * dx + dy * dy + dz * dz < (c.r + pad) * (c.r + pad)) return true;
      }
      return false;
    },
    stats: () => ({ triangles: triCount, bakes: bakes.length, capsules: capsules.length }),
  };
  return api;
}
