/**
 * A bold, solid weak-eye ring for the weave parts (`bounce` timing ring, `hero` foot ring): ONE
 * quad, one draw call. Unlike the thin toolkit rings it has
 *  - a thick solid band with a two-tone "double edge": a full-pop core between softer edges, so
 *    the compositor (brighten on dark, darken on bright) draws a strong band with a clear border on
 *    any background;
 *  - 8 short inward ticks on the target band (a "target", never mistaken for painted stripes);
 *  - an optional second closing band (the timing ring) and a progress arc (the hero's recharge).
 * Grey + coverage only (layer rule); depth-tested, no depth write, never casts shadows.
 */
import * as THREE from 'three';
import { applyFade, clamp01, layerMesh, layerShaderMaterial, planeGeometry } from '../../../../vision/toolkit/common';
import type { Facing, LayerBlock } from '../../../../vision/toolkit/common';

const fragment = /* glsl */ `
uniform float level;
uniform float edge;
uniform float opacity;
uniform float fade;
uniform float halfSize;
uniform float target;
uniform float targetWidth;
uniform float closing;
uniform float closingWidth;
uniform float near;
uniform float progress;
uniform float trackAlpha;
uniform float ticks;
uniform float tickLength;
uniform float rotation;
varying vec2 vUv;
const float TAU = 6.28318530718;
float aaW(float sdf, float w) { return clamp(0.5 - sdf / w, 0.0, 1.0); }
float clockAngle(vec2 p) { return fract(atan(p.x, p.y) / TAU); }
float arcSdf(float local, float fill, float len) {
  local = fract(local);
  if (local < fill) return -min(local, fill - local) * len;
  return min(local - fill, 1.0 - local) * len;
}
void main() {
  vec2 p = (vUv - 0.5) * 2.0 * halfSize;
  float d = length(p);
  float w = max(fwidth(d), 1e-5);
  float ang = clockAngle(p);
  float tw = targetWidth * (1.0 + 0.5 * near);
  float tA = aaW(abs(d - target) - tw * 0.5, w);
  float tC = aaW(abs(d - target) - tw * mix(0.2, 0.5, near), w);
  if (progress < 1.0) {
    float on = progress <= 0.0 ? 0.0 : aaW(arcSdf(ang, progress, TAU * target), w);
    tA *= mix(trackAlpha, 1.0, on);
    tC *= on;
  }
  float kA = 0.0;
  if (ticks > 0.5) {
    float a = fract(ang * ticks - rotation + 0.5) - 0.5;
    float across = abs(a) / ticks * TAU * d - targetWidth * 0.3;
    float rIn = target - tw * 0.5 - tickLength;
    float along = max(rIn - d, d - target);
    kA = aaW(max(across, along), w);
  }
  float cA = 0.0;
  float cC = 0.0;
  if (closing > 0.0) {
    cA = aaW(abs(d - closing) - closingWidth * 0.5, w);
    cC = aaW(abs(d - closing) - closingWidth * 0.2, w);
  }
  float a = max(max(tA, kA), cA) * opacity * fade;
  if (a <= 0.0) discard;
  float core = max(max(tC, kA), cC);
  float g = level * mix(edge, 1.0, core);
  gl_FragColor = vec4(vec3(pow(g, 2.2)), a);
}
`;

export interface BoldRingOptions {
  /** Largest radius the quad must hold (target or closing band), metres. */
  maxRadius: number;
  facing?: Facing;
}

export interface BoldRingState {
  /** Target band radius and width (m). */
  target: number;
  targetWidth: number;
  /** Closing band radius (m); 0 = none. */
  closing?: number;
  closingWidth?: number;
  /** 0..1: the target band in the hit window (thicker, all core). */
  near?: number;
  /** Progress arc of the target band, clockwise from 12 o'clock (1 = full). */
  progress?: number;
  /** Inward ticks on the target band (0 = none). */
  ticks?: number;
  /** Tick rotation in turns. */
  rotation?: number;
  /** Grey pop of the core (0..1) and of the edges relative to it. */
  level?: number;
  edge?: number;
  /** Coverage 0..1 (tier). */
  opacity?: number;
}

export interface BoldRingBlock extends LayerBlock {
  readonly mesh: THREE.Mesh;
  set(s: Partial<BoldRingState>): void;
}

export function createBoldRing(opts: BoldRingOptions): BoldRingBlock {
  const half = opts.maxRadius * 1.08 + 0.3;
  const u = {
    level: { value: 1 },
    edge: { value: 0 },
    opacity: { value: 1 },
    fade: { value: 1 },
    halfSize: { value: half },
    target: { value: 1 },
    targetWidth: { value: 0.3 },
    closing: { value: 0 },
    closingWidth: { value: 0.3 },
    near: { value: 0 },
    progress: { value: 1 },
    trackAlpha: { value: 0.5 },
    ticks: { value: 8 },
    tickLength: { value: 0.18 },
    rotation: { value: 0 },
  };
  const facing = opts.facing ?? 'ground';
  const mat = layerShaderMaterial({ name: 'WeaveBoldRing', uniforms: u, fragmentShader: fragment, billboard: facing === 'billboard' });
  const mesh = layerMesh(planeGeometry(half * 2, half * 2, facing), mat, 'WeaveBoldRing');
  return {
    object: mesh,
    mesh,
    set(s) {
      if (s.target !== undefined) u.target.value = s.target;
      if (s.targetWidth !== undefined) {
        u.targetWidth.value = s.targetWidth;
        u.tickLength.value = s.targetWidth * 0.7;
      }
      if (s.closing !== undefined) u.closing.value = s.closing;
      if (s.closingWidth !== undefined) u.closingWidth.value = s.closingWidth;
      if (s.near !== undefined) u.near.value = clamp01(s.near);
      if (s.progress !== undefined) u.progress.value = clamp01(s.progress);
      if (s.ticks !== undefined) u.ticks.value = Math.max(0, Math.round(s.ticks));
      if (s.rotation !== undefined) u.rotation.value = s.rotation;
      if (s.level !== undefined) u.level.value = clamp01(s.level);
      if (s.edge !== undefined) u.edge.value = clamp01(s.edge);
      if (s.opacity !== undefined) u.opacity.value = clamp01(s.opacity);
    },
    setFade: (f) => applyFade(mat, f),
    update() {},
    dispose() {
      mesh.geometry.dispose();
      mat.dispose();
    },
  };
}
