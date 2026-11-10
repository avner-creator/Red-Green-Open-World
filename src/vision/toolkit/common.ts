/**
 * Shared bits of the vision toolkit: layer shader materials (grey + alpha only, depth-tested,
 * no depth write, normal blending → premultiplied colour + coverage in the layer target) and the
 * camera-facing vertex code.
 */
import * as THREE from 'three';

/** How a toolkit quad is oriented. */
export type Facing = 'billboard' | 'ground' | 'wall';

/** Every toolkit controller has these. */
export interface LayerBlock {
  /** Register this with `ctx.vision.add(object, VisionLayer.WeakOnly | StrongOnly)`. */
  readonly object: THREE.Object3D;
  /** 0..1 multiplier on coverage. 0 = draws nothing (no pixel changes), 1 = normal. */
  setFade(fade: number): void;
  /** Advance animation (seconds). */
  update(dt: number): void;
  dispose(): void;
}

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Display-sRGB grey level → linear colour the layer shaders write (the compositor reads luminance). */
export function linearGrey(level: number): THREE.Color {
  const c = clamp01(level);
  return new THREE.Color(c, c, c).convertSRGBToLinear();
}

/**
 * Vertex code for a quad (or a batch of quads) in the local XY plane. With BILLBOARD defined the
 * XY offsets are applied in view space around the object's origin (faces the camera, keeps the
 * object's scale, ignores its rotation; no per-frame CPU work).
 */
export const quadVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
#ifdef BILLBOARD
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  vec2 sc = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
  mv.xy += position.xy * sc;
#else
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
#endif
  gl_Position = projectionMatrix * mv;
}
`;

export interface LayerShaderOptions {
  name: string;
  uniforms: Record<string, THREE.IUniform>;
  fragmentShader: string;
  billboard: boolean;
  vertexShader?: string;
  /** Extra defines. */
  defines?: Record<string, string | number | boolean>;
}

/**
 * Layer shader material. The fragment shader must write `gl_FragColor = vec4(color, a)` with the
 * common uniforms `color` (linear grey), `opacity` and `fade` already folded into `a`.
 */
export function layerShaderMaterial(o: LayerShaderOptions): THREE.ShaderMaterial {
  const defines: Record<string, string | number | boolean> = { ...(o.defines ?? {}) };
  if (o.billboard) defines.BILLBOARD = '';
  return new THREE.ShaderMaterial({
    name: o.name,
    uniforms: o.uniforms,
    defines,
    vertexShader: o.vertexShader ?? quadVertex,
    fragmentShader: o.fragmentShader,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
}

/** Common uniforms: grey level, opacity (tier), fade (0..1). */
export function baseUniforms(level: number, opacity: number): {
  color: THREE.IUniform<THREE.Color>;
  opacity: THREE.IUniform<number>;
  fade: THREE.IUniform<number>;
} {
  return { color: { value: linearGrey(level) }, opacity: { value: clamp01(opacity) }, fade: { value: 1 } };
}

/** GLSL declarations matching `baseUniforms`, plus an AA step helper. */
export const baseFragmentHead = /* glsl */ `
uniform vec3 color;
uniform float opacity;
uniform float fade;
varying vec2 vUv;
// 1 inside (sdf < 0), 0 outside, anti-aliased over one pixel.
float aaFill(float sdf) {
  float w = max(fwidth(sdf), 1e-5);
  return clamp(0.5 - sdf / w, 0.0, 1.0);
}
`;

/**
 * Sets the fade uniform and hides the material entirely at 0 (no draw at all), so fade 0 is
 * pixel-identical to the object not being there.
 */
export function applyFade(mat: THREE.ShaderMaterial, fade: number): void {
  const f = clamp01(fade);
  mat.uniforms.fade.value = f;
  mat.visible = f > 0;
}

/** Plane in the local XY plane (wall/billboard) or XZ plane (ground, facing up). */
export function planeGeometry(width: number, height: number, facing: Facing): THREE.PlaneGeometry {
  const g = new THREE.PlaneGeometry(width, height);
  if (facing === 'ground') g.rotateX(-Math.PI / 2);
  return g;
}

/** Billboards are drawn after other layer objects of the same depth order (cosmetic only). */
export function layerMesh(geo: THREE.BufferGeometry, mat: THREE.Material, name: string): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  return mesh;
}
