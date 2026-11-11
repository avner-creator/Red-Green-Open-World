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
  /** Textured suits: near-black texels → mitten (hands, aRegion 1) / accent (body); never the head (aRegion 2). */
  suit?: { mitten: string; accent: string; sat?: number; head?: string };
}

const RIM_COLOR = new THREE.Color(1.0, 0.93, 0.8);

/**
 * Showcase lighting for the title and hero select (no extra lights, so no shader recompiles): one
 * uniform shared by every hero material lifts the warm fill (a soft key from the front) and the rim.
 * Screens call `holdShowcase()` every frame while shown; `tickShowcase` (the hero's update) eases it.
 */
const SHOWCASE = { value: 0 };
let showcaseHeld = 0;
export function holdShowcase(): void {
  showcaseHeld = 0.25;
}
export function tickShowcase(dt: number): void {
  showcaseHeld = Math.max(0, showcaseHeld - dt);
  const target = showcaseHeld > 0 ? 1 : 0;
  SHOWCASE.value += (target - SHOWCASE.value) * (dt <= 0 ? 1 : 1 - Math.exp(-dt * 4));
}
export function showcaseLevel(): number {
  return SHOWCASE.value;
}

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
    uShow: SHOWCASE,
    uSuit: { value: opt.suit ? 1 : 0 },
    uMitten: { value: new THREE.Color(opt.suit?.mitten ?? '#ffffff') },
    uAccent: { value: new THREE.Color(opt.suit?.accent ?? '#ffffff') },
    uSat: { value: opt.suit?.sat ?? 1 },
    uHeadOn: { value: opt.suit?.head ? 1 : 0 },
    uHeadTint: { value: new THREE.Color(opt.suit?.head ?? '#ffffff') },
  };
  std.userData.warmUniforms = uniforms;
  std.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRegion;\nvarying float vRegion;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRegion = aRegion;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uWarmFill;\nuniform float uRim;\nuniform float uShow;\nuniform vec3 uRimColor;\nuniform float uSuit;\nuniform vec3 uMitten;\nuniform vec3 uAccent;\nuniform float uSat;\nuniform float uHeadOn;\nuniform vec3 uHeadTint;\nvarying float vRegion;',
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        if (uSuit > 0.5 && (vRegion < 1.5 || uHeadOn > 0.5)) {
          // Linear luminance of the texel: near-black gloves, collars and stripes become soft colour.
          float lum = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          bool hand = vRegion > 0.5 && vRegion < 1.5;
          bool onHead = vRegion > 1.5;
          float dark = 1.0 - smoothstep(hand ? 0.2 : 0.06, hand ? 0.4 : 0.22, lum);
          vec3 tint = (hand ? uMitten : onHead ? uHeadTint : uAccent) * (0.85 + 1.2 * lum);
          vec3 g = vec3(lum);
          vec3 candy = max(vec3(0.0), g + (diffuseColor.rgb - g) * (hand || onHead ? 1.0 : uSat));
          diffuseColor.rgb = mix(candy, tint, dark);
        }`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
          vec3 vdir = normalize(vViewPosition);
          float ndv = clamp(dot(normal, vdir), 0.0, 1.0);
          float rimF = pow(1.0 - ndv, 3.0);
          // Soft fill: shadowed sides keep a warm glow of their own colour.
          // Showcase (title, hero select): a warm front key on the faces the camera sees and a brighter rim.
          float keyF = uShow * (0.12 + 0.18 * ndv);
          outgoingLight += diffuseColor.rgb * (uWarmFill + keyF) * vec3(1.0, 0.96, 0.9);
          outgoingLight += uRimColor * rimF * uRim * (1.0 + 0.8 * uShow) * (0.35 + 0.65 * max(diffuseColor.r, diffuseColor.g));
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
