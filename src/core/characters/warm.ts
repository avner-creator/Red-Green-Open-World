/**
 * Warm, soft character shading on top of the standard PBR material:
 * - a gentle warm fill (a little of the base colour added back), so shadowed sides glow softly
 *   instead of going grey, like light scattering under skin or fur;
 * - a cream rim light on silhouettes, so heroes pop off the background by BRIGHTNESS (reads in
 *   both the R-only and G-only channel);
 * - optional smooth normals for faceted low-poly sources (rounder, cuter forms).
 * One shader variant for all heroes (a fixed program cache key).
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface WarmOptions {
  /** Base-colour fraction added back as soft fill (0..0.3). */
  fill?: number;
  /** Rim strength (0..1). */
  rim?: number;
}

const RIM_COLOR = new THREE.Color(1.0, 0.93, 0.8);

/** Patch one material in place (idempotent). */
export function warmMaterial(m: THREE.Material, opt: WarmOptions = {}): void {
  const std = m as THREE.MeshStandardMaterial;
  if (!std.isMeshStandardMaterial || std.userData.warm) return;
  std.userData.warm = true;
  std.metalness = Math.min(std.metalness, 0.05);
  std.roughness = Math.max(0.45, Math.min(std.roughness, 0.78));
  const uniforms = {
    uWarmFill: { value: opt.fill ?? 0.14 },
    uRim: { value: opt.rim ?? 0.38 },
    uRimColor: { value: RIM_COLOR },
  };
  std.userData.warmUniforms = uniforms;
  std.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWarmFill;\nuniform float uRim;\nuniform vec3 uRimColor;')
      .replace(
        '#include <opaque_fragment>',
        `{
          vec3 vdir = normalize(vViewPosition);
          float ndv = clamp(dot(normal, vdir), 0.0, 1.0);
          float rimF = pow(1.0 - ndv, 3.0);
          // Soft fill: shadowed sides keep a warm glow of their own colour.
          outgoingLight += diffuseColor.rgb * uWarmFill;
          outgoingLight += uRimColor * rimF * uRim * (0.35 + 0.65 * max(diffuseColor.r, diffuseColor.g));
        }
        #include <opaque_fragment>`,
      );
  };
  std.customProgramCacheKey = () => 'rg-warm-hero';
  std.needsUpdate = true;
}

/** Warm every material under `root`. */
export function warmCharacter(root: THREE.Object3D, opt?: WarmOptions): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) warmMaterial(m, opt);
  });
}

/**
 * Replace faceted (split) normals with smooth ones: weld vertices that share a position (and skin
 * data), then recompute normals. UVs are dropped for untextured meshes only.
 */
export function smoothNormals(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mat = mesh.material as THREE.MeshStandardMaterial;
    if (Array.isArray(mesh.material) || mat.map) return;
    let g = mesh.geometry;
    g.deleteAttribute('normal');
    if (g.attributes.uv) g.deleteAttribute('uv');
    for (const k of Object.keys(g.attributes)) {
      const a = g.attributes[k] as THREE.BufferAttribute;
      // mergeVertices needs plain (non-interleaved) attributes.
      if ((a as unknown as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) {
        g.setAttribute(k, (a as unknown as THREE.InterleavedBufferAttribute).clone());
      }
    }
    g = mergeVertices(g, 1e-4);
    g.computeVertexNormals();
    mesh.geometry = g;
  });
}
