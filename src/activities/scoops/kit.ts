/**
 * Tiny geometry kit for Scoops: transformed, vertex-coloured primitives merged into one geometry
 * (one draw call per material). Colours are sRGB hex (converted to linear by THREE.Color).
 */
import * as THREE from 'three';
import { merge, paint } from '../chests/bake';
import type { VertexPainter } from '../chests/bake';

const e = new THREE.Euler();
const q = new THREE.Quaternion();
const p = new THREE.Vector3();
const s = new THREE.Vector3();

/** Transform: position, yaw, scale, then pitch (x) and roll (z). Order: R = yaw · pitch · roll. */
export function T(x = 0, y = 0, z = 0, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0, rz = 0): THREE.Matrix4 {
  e.set(rx, ry, rz, 'YXZ');
  q.setFromEuler(e);
  return new THREE.Matrix4().compose(p.set(x, y, z), q, s.set(sx, sy, sz));
}

export const box = (): THREE.BufferGeometry => new THREE.BoxGeometry(1, 1, 1);
/** Unit cylinder, base at y = 0, top at y = 1, radius 1. */
export const cyl = (seg = 16, top = 1, bottom = 1, open = false): THREE.BufferGeometry =>
  new THREE.CylinderGeometry(top, bottom, 1, seg, 1, open).translate(0, 0.5, 0);
export const sphere = (w = 12, h = 8): THREE.BufferGeometry => new THREE.SphereGeometry(1, w, h);
export const hemi = (w = 14, h = 6): THREE.BufferGeometry => new THREE.SphereGeometry(1, w, h, 0, Math.PI * 2, 0, Math.PI / 2);
/** Unit cone, tip at y = 1, base radius 1 at y = 0. */
export const cone = (seg = 14): THREE.BufferGeometry => new THREE.ConeGeometry(1, 1, seg).translate(0, 0.5, 0);
export const torus = (r: number, tube: number, arc = Math.PI * 2, seg = 24): THREE.BufferGeometry => new THREE.TorusGeometry(r, tube, 6, seg, arc);
export const disc = (seg = 24): THREE.BufferGeometry => new THREE.CircleGeometry(1, seg).rotateX(-Math.PI / 2);
export const blob = (): THREE.BufferGeometry => new THREE.IcosahedronGeometry(1, 0);

export class Kit {
  readonly parts: THREE.BufferGeometry[] = [];

  add(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation | VertexPainter, m: THREE.Matrix4): this {
    const g = paint(geo, color);
    g.applyMatrix4(m);
    this.parts.push(g);
    return this;
  }

  /** Box by centre and full size. */
  box(x: number, y: number, z: number, w: number, h: number, d: number, color: THREE.ColorRepresentation | VertexPainter, ry = 0): this {
    return this.add(box(), color, T(x, y, z, ry, w, h, d));
  }

  build(): THREE.BufferGeometry {
    const g = merge(this.parts);
    for (const part of this.parts) part.dispose();
    this.parts.length = 0;
    g.computeBoundingSphere();
    return g;
  }

  mesh(material: THREE.Material): THREE.Mesh {
    return new THREE.Mesh(this.build(), material);
  }
}

/** Shared matte vertex-colour material (looks like the world's painted props). */
export function paintMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 });
}

/** Glossy vertex-colour material (ice cream, sauces, candy, glass jars). */
export function glossMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0 });
}
