/**
 * Per-vertex finishes: bake colour, roughness, metalness and glow into vertex attributes, so many
 * small parts with different looks merge into one mesh drawn with one material (one draw call).
 *
 * `finish(geometry, { color, rough, metal })` → non-indexed geometry with `position`, `normal`
 * (+ `uv` when asked), `color` (linear), `rm` (roughness, metalness) and `emit` (rgb glow, w = 1 for
 * glow that follows the material's `glowLevel` uniform). Merge any number of them with
 * `mergeFinished` and draw them with `finishMaterial()`.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface Finish {
  /** sRGB hex, like a material colour. */
  color: number;
  rough: number;
  metal: number;
  /** Emissive colour (sRGB hex) × `glow` intensity. */
  emissive?: number;
  glow?: number;
  /** This glow is scaled by the material's `glowLevel` uniform (lamps that switch on/off). */
  switched?: boolean;
}

/** Keep only position/normal (and uv when `uv`), non-indexed, so geometries merge. */
export function plainGeometry(g: THREE.BufferGeometry, uv = false): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(n.attributes)) {
    if (name !== 'position' && name !== 'normal' && !(uv && name === 'uv')) n.deleteAttribute(name);
  }
  if (!n.attributes.normal) n.computeVertexNormals();
  if (uv && !n.attributes.uv) n.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n.attributes.position.count * 2), 2));
  if (n !== g) g.dispose();
  return n;
}

const col = new THREE.Color();
const emi = new THREE.Color();

/** Bake a finish into vertex attributes (disposes `g` when it had to be converted). */
export function finish(g: THREE.BufferGeometry, f: Finish, uv = false): THREE.BufferGeometry {
  const n = plainGeometry(g, uv);
  const count = n.attributes.position.count;
  const color = new Float32Array(count * 3);
  const rm = new Float32Array(count * 2);
  const emit = new Float32Array(count * 4);
  col.setHex(f.color);
  emi.setHex(f.emissive ?? 0).multiplyScalar(f.glow ?? 0);
  const w = f.switched ? 1 : 0;
  for (let i = 0; i < count; i++) {
    color[i * 3] = col.r;
    color[i * 3 + 1] = col.g;
    color[i * 3 + 2] = col.b;
    rm[i * 2] = f.rough;
    rm[i * 2 + 1] = f.metal;
    emit[i * 4] = emi.r;
    emit[i * 4 + 1] = emi.g;
    emit[i * 4 + 2] = emi.b;
    emit[i * 4 + 3] = w;
  }
  n.setAttribute('color', new THREE.BufferAttribute(color, 3));
  n.setAttribute('rm', new THREE.BufferAttribute(rm, 2));
  n.setAttribute('emit', new THREE.BufferAttribute(emit, 4));
  return n;
}

/** Merge finished (or plain) geometries; disposes the inputs. */
export function mergeFinished(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const m = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!m) throw new Error('vertex-finish: merge failed (mismatched attributes)');
  return m;
}

/** Apply a transform and return the geometry (for placing parts before merging). */
export function placed(g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1): THREE.BufferGeometry {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));
  return g.applyMatrix4(m);
}

/** Geometry of a unit-radius, unit-height Y cylinder stretched from a to b with radius r. */
export function rodBetween(a: THREE.Vector3, b: THREE.Vector3, r: number, radial = 8, open = false): THREE.BufferGeometry {
  const d = new THREE.Vector3().subVectors(b, a);
  const g = new THREE.CylinderGeometry(r, r, d.length(), radial, 1, open);
  const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().addScaledVector(d, 0.5), quat, new THREE.Vector3(1, 1, 1)));
  return g;
}

/** Patch a lit material so it reads colour/roughness/metalness/glow from the finish attributes. */
export function useFinishAttributes<M extends THREE.MeshStandardMaterial>(m: M, key: string, glowLevel = { value: 1 }, extra?: (shader: THREE.WebGLProgramParametersWithUniforms) => void): M {
  m.vertexColors = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.glowLevel = glowLevel;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 rm;\nattribute vec4 emit;\nvarying vec2 vRM;\nvarying vec4 vEmit;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = rm;\nvEmit = emit;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float glowLevel;\nvarying vec2 vRM;\nvarying vec4 vEmit;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vRM.x;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vRM.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = vEmit.rgb * mix(1.0, glowLevel, vEmit.a);');
    extra?.(shader);
  };
  m.customProgramCacheKey = () => key;
  return m;
}

/** A MeshStandardMaterial driven by the finish attributes. `glowLevel` scales switched glow. */
export function finishMaterial(key: string, glowLevel = { value: 1 }, params: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return useFinishAttributes(new THREE.MeshStandardMaterial({ roughness: 1, metalness: 1, ...params }), key, glowLevel);
}
