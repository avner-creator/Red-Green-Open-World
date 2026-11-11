/**
 * A small batch of camera-facing quads in ONE draw call, each with its own world-space centre and
 * a few float attributes, for a layer shader (grey + alpha only). Used by the odd-one-out shapes
 * and the line-up bubbles.
 *
 * Vertex inputs: `aCenter` (world position), `aCorner` (−1..1), `aScale`, plus the named floats.
 * The vertex shader below billboards each quad around its own centre in view space and passes
 * `vP` (local metres, unscaled: `aCorner * halfSize`) and the named floats as `v<Name>` varyings.
 */
import * as THREE from 'three';
import { layerMesh, layerShaderMaterial } from '../../../vision/toolkit/common';

export interface QuadBatch {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  setCenter(i: number, x: number, y: number, z: number): void;
  set(name: string, i: number, value: number): void;
  /** Upload the changes made since the last commit. */
  commit(): void;
  dispose(): void;
}

export interface QuadBatchOptions {
  name: string;
  count: number;
  /** Per-quad float attributes (e.g. ['Kind', 'Angle']): `a<Name>` in, `v<Name>` varying out. */
  floats: readonly string[];
  /** Fragment shader (declares the `v<Name>` varyings and `vP` itself). */
  fragmentShader: string;
  uniforms: Record<string, THREE.IUniform>;
  /**
   * Lay every quad flat in one world plane (in-plane `right`/`up` unit vectors) instead of facing
   * the camera. `vP` x/y then run along `right`/`up`.
   */
  plane?: { right: THREE.Vector3; up: THREE.Vector3 };
}

function vertexShader(floats: readonly string[], plane: boolean): string {
  const decl = floats.map((f) => `attribute float a${f};\nvarying float v${f};`).join('\n');
  const pass = floats.map((f) => `  v${f} = a${f};`).join('\n');
  return /* glsl */ `
attribute vec3 aCenter;
attribute vec2 aCorner;
attribute float aScale;
uniform float halfSize;
${plane ? 'uniform vec3 planeRight;\nuniform vec3 planeUp;' : ''}
varying vec2 vUv;
varying vec2 vP;
${decl}
void main() {
  vUv = aCorner * 0.5 + 0.5;
  vP = aCorner * halfSize;
${pass}
${
    plane
      ? `  vec2 o = aCorner * halfSize * aScale;
  vec4 mv = modelViewMatrix * vec4(aCenter + planeRight * o.x + planeUp * o.y, 1.0);`
      : `  vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);
  mv.xy += aCorner * halfSize * aScale;`
  }
  gl_Position = projectionMatrix * mv;
}
`;
}

export function createQuadBatch(o: QuadBatchOptions): QuadBatch {
  const n = o.count;
  const geo = new THREE.BufferGeometry();
  const corners = new Float32Array(n * 8);
  const index: number[] = [];
  for (let i = 0; i < n; i++) {
    corners.set([-1, -1, 1, -1, 1, 1, -1, 1], i * 8);
    index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  }
  // `position` is required by three (bounding volumes); the shader uses `aCenter`.
  const center = new THREE.BufferAttribute(new Float32Array(n * 12), 3);
  center.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 12), 3));
  geo.setAttribute('aCenter', center);
  geo.setAttribute('aCorner', new THREE.BufferAttribute(corners, 2));
  const attrs = new Map<string, THREE.BufferAttribute>();
  for (const f of ['Scale', ...o.floats]) {
    const a = new THREE.BufferAttribute(new Float32Array(n * 4).fill(f === 'Scale' ? 1 : 0), 1);
    a.setUsage(THREE.DynamicDrawUsage);
    attrs.set(f, a);
    geo.setAttribute(`a${f}`, a);
  }
  geo.setIndex(index);
  const uniforms = o.plane ? { ...o.uniforms, planeRight: { value: o.plane.right.clone() }, planeUp: { value: o.plane.up.clone() } } : o.uniforms;
  const material = layerShaderMaterial({
    name: o.name,
    uniforms,
    fragmentShader: o.fragmentShader,
    vertexShader: vertexShader(o.floats, !!o.plane),
    billboard: false,
  });
  const mesh = layerMesh(geo, material, o.name);
  mesh.frustumCulled = false; // centres live in the attribute, not in the geometry bounds
  const dirty = new Set<THREE.BufferAttribute>();
  return {
    mesh,
    material,
    setCenter(i, x, y, z) {
      for (let k = 0; k < 4; k++) center.setXYZ(i * 4 + k, x, y, z);
      dirty.add(center);
    },
    set(name, i, value) {
      const a = attrs.get(name);
      if (!a) throw new Error(`quadBatch: unknown attribute ${name}`);
      for (let k = 0; k < 4; k++) a.setX(i * 4 + k, value);
      dirty.add(a);
    },
    commit() {
      for (const a of dirty) a.needsUpdate = true;
      dirty.clear();
    },
    dispose() {
      geo.dispose();
      material.dispose();
    },
  };
}
