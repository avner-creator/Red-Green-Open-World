/**
 * Builds one vertex-coloured mesh out of many small primitives (one draw call per material), the
 * way the bumper-game sets are made. Colours are picked for brightness contrast so everything reads
 * in the red channel and the green channel alone.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export class MergeKit {
  private readonly parts: THREE.BufferGeometry[] = [];
  private readonly color = new THREE.Color();

  /** Add a geometry (cloned, transformed by `m`, painted `color`). The input is not disposed. */
  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, m: THREE.Matrix4): void {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone()) as THREE.BufferGeometry;
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    g.applyMatrix4(m);
    this.color.set(color).convertSRGBToLinear();
    const n = g.attributes.position.count;
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      cols[i * 3] = this.color.r;
      cols[i * 3 + 1] = this.color.g;
      cols[i * 3 + 2] = this.color.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    this.parts.push(g);
  }

  get count(): number {
    return this.parts.length;
  }

  /** Merge everything added so far into one geometry (and clear the kit). */
  build(): THREE.BufferGeometry {
    const merged = this.parts.length ? mergeGeometries(this.parts, false) : new THREE.BufferGeometry();
    for (const p of this.parts) p.dispose();
    this.parts.length = 0;
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    return merged;
  }
}

/** Matrix helper: translate, yaw, pitch (x), roll (z), scale. */
export function TRS(x: number, y: number, z: number, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
  return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
}

/** A matrix that maps a unit cylinder (Y axis, height 1, centred) onto the segment a → b. */
export function between(ax: number, ay: number, az: number, bx: number, by: number, bz: number, radius: number): THREE.Matrix4 {
  const a = new THREE.Vector3(ax, ay, az);
  const b = new THREE.Vector3(bx, by, bz);
  const dir = b.clone().sub(a);
  const len = dir.length() || 1e-6;
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.divideScalar(len));
  return new THREE.Matrix4().compose(a.add(b).multiplyScalar(0.5), q, new THREE.Vector3(radius, len, radius));
}

/** Shared unit primitives (do not dispose). */
export const UNIT = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 14, 1, false),
  cylLow: new THREE.CylinderGeometry(1, 1, 1, 8, 1, false),
  sphere: new THREE.SphereGeometry(1, 16, 10),
  sphereLow: new THREE.SphereGeometry(1, 10, 6),
  cone: new THREE.ConeGeometry(1, 1, 12),
};

/** The material every merged set uses. */
export function setMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0 });
}

/** Draws a pictogram on a canvas and returns it as a texture (for booth signs). */
export function pictoTexture(draw: (g: CanvasRenderingContext2D, s: number) => void, size = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
