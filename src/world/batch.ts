/**
 * Collects many small coloured parts and merges them into one mesh per (material, map chunk).
 * Keeps draw calls low while still letting the camera frustum cull far chunks.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MatKey, Materials } from './materials';

export interface AddOpts {
  /** Darken vertices close to this world y (fake contact AO). */
  aoY?: number;
  /** Height over which the AO fades out (default 1.2 m). */
  aoH?: number;
  /** AO strength 0..1 (default 0.45). */
  ao?: number;
}

const CHUNK = 100;
const NO_SHADOW: ReadonlySet<MatKey> = new Set<MatKey>(['glow', 'window', 'paving', 'road']);
const NO_RECEIVE: ReadonlySet<MatKey> = new Set<MatKey>(['glow']);

const tmpColor = new THREE.Color();
const tmpBox = new THREE.Box3();
const tmpV = new THREE.Vector3();

export class Batcher {
  private buckets = new Map<string, { key: MatKey; geos: THREE.BufferGeometry[] }>();
  triangles = 0;

  add(key: MatKey, geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, matrix?: THREE.Matrix4, opts?: AddOpts): void {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'color' && name !== 'aWave') g.deleteAttribute(name);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    const pos = g.attributes.position;
    const n = pos.count;
    if (!g.attributes.color) {
      tmpColor.set(color);
      const c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        c[i * 3] = tmpColor.r;
        c[i * 3 + 1] = tmpColor.g;
        c[i * 3 + 2] = tmpColor.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    if (opts?.aoY !== undefined) {
      const col = g.attributes.color;
      const hh = opts.aoH ?? 1.2;
      const k = opts.ao ?? 0.45;
      for (let i = 0; i < n; i++) {
        const t = THREE.MathUtils.clamp((pos.getY(i) - opts.aoY) / hh, 0, 1);
        const f = 1 - k * (1 - t * t * (3 - 2 * t));
        col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f);
      }
    }
    if (key === 'cloth' && !g.attributes.aWave) g.setAttribute('aWave', new THREE.BufferAttribute(new Float32Array(n), 1));
    if (key !== 'cloth' && g.attributes.aWave) g.deleteAttribute('aWave');
    tmpBox.setFromBufferAttribute(pos as THREE.BufferAttribute).getCenter(tmpV);
    const id = `${key}:${Math.floor(tmpV.x / CHUNK)},${Math.floor(tmpV.z / CHUNK)}`;
    let b = this.buckets.get(id);
    if (!b) this.buckets.set(id, (b = { key, geos: [] }));
    b.geos.push(g);
    this.triangles += n / 3;
  }

  /** Merge everything into meshes and add them to `parent`. */
  build(parent: THREE.Object3D, mats: Materials): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [id, b] of this.buckets) {
      const merged = mergeGeometries(b.geos, false);
      for (const g of b.geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mats.get(b.key));
      mesh.name = id;
      mesh.castShadow = !NO_SHADOW.has(b.key);
      mesh.receiveShadow = !NO_RECEIVE.has(b.key);
      mesh.matrixAutoUpdate = false;
      parent.add(mesh);
      out.push(mesh);
    }
    this.buckets.clear();
    return out;
  }
}

// ───────────── transform helpers ─────────────

const q = new THREE.Quaternion();
const e = new THREE.Euler();
const p = new THREE.Vector3();
const s = new THREE.Vector3();

/** Matrix from position, yaw (and optional pitch/roll) and scale. */
export function T(x: number, y: number, z: number, yaw = 0, sx = 1, sy = 1, sz = 1, pitch = 0, roll = 0): THREE.Matrix4 {
  e.set(pitch, yaw, roll, 'YXZ');
  q.setFromEuler(e);
  return new THREE.Matrix4().compose(p.set(x, y, z), q, s.set(sx, sy, sz));
}

/** parent × local */
export function M(parent: THREE.Matrix4, local: THREE.Matrix4): THREE.Matrix4 {
  return parent.clone().multiply(local);
}
