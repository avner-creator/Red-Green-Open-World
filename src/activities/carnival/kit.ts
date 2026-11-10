/**
 * Geometry kit: collects coloured parts (vertex colours) and merges them into ONE mesh, so a whole
 * carnival row is a handful of draw calls. Also the transform helper `T`.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const tmpColor = new THREE.Color();
const q = new THREE.Quaternion();
const e = new THREE.Euler();
const p = new THREE.Vector3();
const s = new THREE.Vector3();

/** Matrix from position, yaw/pitch/roll (YXZ) and scale. */
export function T(x: number, y: number, z: number, yaw = 0, sx = 1, sy = 1, sz = 1, pitch = 0, roll = 0): THREE.Matrix4 {
  e.set(pitch, yaw, roll, 'YXZ');
  q.setFromEuler(e);
  return new THREE.Matrix4().compose(p.set(x, y, z), q, s.set(sx, sy, sz));
}

export class Kit {
  private readonly parts: THREE.BufferGeometry[] = [];
  triangles = 0;

  /** Add a copy of `geo`, transformed by `m`, painted `color`; `emissive` 0..1 makes it self-lit. */
  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, m?: THREE.Matrix4, emissive = 0): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    if (m) g.applyMatrix4(m);
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    tmpColor.set(color);
    const c = new Float32Array(n * 3);
    const selfLit = new Float32Array(n).fill(emissive);
    for (let i = 0; i < n; i++) {
      c[i * 3] = tmpColor.r;
      c[i * 3 + 1] = tmpColor.g;
      c[i * 3 + 2] = tmpColor.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.setAttribute('aSelf', new THREE.BufferAttribute(selfLit, 1));
    this.parts.push(g);
    this.triangles += n / 3;
    return this;
  }

  get empty(): boolean {
    return this.parts.length === 0;
  }

  /** Merge everything into one geometry (and forget the parts). */
  build(): THREE.BufferGeometry {
    const merged = this.parts.length ? mergeGeometries(this.parts, false) : new THREE.BufferGeometry();
    for (const g of this.parts) g.dispose();
    this.parts.length = 0;
    merged.computeBoundingSphere();
    return merged;
  }
}

/**
 * Vertex-colour material. The `aSelf` attribute is "self-lit" (0..1): bulbs, neon tape and
 * sign faces stay bright at dusk without a second material.
 */
export function kitMaterial(opts: { roughness?: number; metalness?: number } = {}): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: opts.roughness ?? 0.62, metalness: opts.metalness ?? 0 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <color_pars_vertex>', '#include <color_pars_vertex>\nattribute float aSelf;\nvarying float vSelfLit;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvSelfLit = aSelf;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <color_pars_fragment>', '#include <color_pars_fragment>\nvarying float vSelfLit;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vSelfLit;');
  };
  mat.customProgramCacheKey = () => 'carnivalKit';
  return mat;
}

// ───────────── shared primitive geometries (unit sized, origin at the bottom centre) ─────────────

export const G = {
  box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  boxC: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 14).translate(0, 0.5, 0),
  cylLo: new THREE.CylinderGeometry(0.5, 0.5, 1, 8).translate(0, 0.5, 0),
  cone: new THREE.ConeGeometry(0.5, 1, 14).translate(0, 0.5, 0),
  sphere: new THREE.SphereGeometry(0.5, 14, 10),
  sphereMid: new THREE.SphereGeometry(0.5, 11, 8),
  sphereLo: new THREE.SphereGeometry(0.5, 8, 6),
  /** Tiny self-lit bulbs: 20 triangles. */
  bulb: new THREE.IcosahedronGeometry(0.5, 0),
  torus: new THREE.TorusGeometry(0.5, 0.08, 8, 24),
  plane: new THREE.PlaneGeometry(1, 1),
};
