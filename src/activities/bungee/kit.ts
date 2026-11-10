/**
 * Tiny procedural-prop kit shared by the bungee bridge and the Silly Zone: collect coloured
 * primitives (vertex colours) and merge them into one mesh per material, so a whole prop is one or
 * two draw calls.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Finish = 'matte' | 'gloss' | 'metal';

const FINISH: Record<Finish, { roughness: number; metalness: number }> = {
  matte: { roughness: 0.85, metalness: 0 },
  gloss: { roughness: 0.32, metalness: 0 },
  metal: { roughness: 0.45, metalness: 0.6 },
};

export class Kit {
  private readonly parts = new Map<Finish, THREE.BufferGeometry[]>();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();

  /** Add `geo` (consumed: it is transformed and disposed at build) with a flat colour. */
  add(finish: Finish, geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, matrix?: THREE.Matrix4): this {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    if (matrix) g.applyMatrix4(matrix);
    const c = new THREE.Color(color);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
    let list = this.parts.get(finish);
    if (!list) this.parts.set(finish, (list = []));
    list.push(g);
    return this;
  }

  /** Matrix from position, Euler rotation (XYZ) and scale. */
  t(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
    this.e.set(rx, ry, rz);
    this.q.setFromEuler(this.e);
    return this.m.compose(this.p.set(x, y, z), this.q, this.s.set(sx, sy, sz)).clone();
  }

  box(finish: Finish, color: THREE.ColorRepresentation, x: number, y: number, z: number, w: number, h: number, d: number, rx = 0, ry = 0, rz = 0): this {
    return this.add(finish, new THREE.BoxGeometry(w, h, d), color, this.t(x, y, z, rx, ry, rz));
  }

  cyl(finish: Finish, color: THREE.ColorRepresentation, x: number, y: number, z: number, r: number, h: number, segs = 16, rx = 0, ry = 0, rz = 0): this {
    return this.add(finish, new THREE.CylinderGeometry(r, r, h, segs), color, this.t(x, y, z, rx, ry, rz));
  }

  /** Cylinder between two points. */
  rod(finish: Finish, color: THREE.ColorRepresentation, a: THREE.Vector3, b: THREE.Vector3, r: number, segs = 10): this {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    const g = new THREE.CylinderGeometry(r, r, len, segs);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    const m = new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    return this.add(finish, g, color, m);
  }

  /** Merge into a group of meshes (one per finish). */
  build(name: string, shadows = true): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    for (const [finish, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      for (const g of list) g.dispose();
      if (!merged) continue;
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, ...FINISH[finish] });
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.parts.clear();
    return group;
  }
}

/** Dispose every geometry and material under `root`. */
export function disposeTree(root: THREE.Object3D): void {
  root.removeFromParent();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      for (const v of Object.values(mat)) if (v instanceof THREE.Texture) v.dispose();
      mat.dispose();
    }
  });
}
