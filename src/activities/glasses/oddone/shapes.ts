/**
 * The three weak-eye shapes of a round: one quad batch (ONE draw call) with a signed-distance
 * shader per quad (square, circle, triangle, diamond, arrow, ring with a gap). After an answer a
 * burst ring plays on the odd one, on the same layer.
 */
import * as THREE from 'three';
import { applyFade, baseFragmentHead, baseUniforms, linearGrey } from '../../../vision/toolkit/common';
import { KIND_CODE } from './logic';
import type { Detail, ShapeSpec } from './logic';
import { createQuadBatch } from './quadBatch';

const fragment = /* glsl */ `
${baseFragmentHead}
uniform float size;
uniform float gap;
uniform float stroke;
varying vec2 vP;
varying float vKind;
varying float vDir;
varying float vWin;
float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
// Equilateral triangle pointing up (+y), circumradius-ish r.
float sdTri(vec2 p, float r) {
  const float k = 1.7320508;
  p.x = abs(p.x) - r;
  p.y = p.y + r / k;
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}
// Rotate p so that direction angle a maps onto +x.
vec2 toDir(vec2 p, float a) {
  float c = cos(a);
  float s = sin(a);
  return vec2(c * p.x + s * p.y, -s * p.x + c * p.y);
}
void main() {
  float S = size * (1.0 + 0.16 * sin(clamp(vWin * 2.0, 0.0, 1.0) * 3.14159));
  vec2 p = vP;
  float k = floor(vKind + 0.5);
  float ang = vDir * 1.5707963;
  float d;
  if (k < 0.5) d = sdBox(p, vec2(0.4 * S)) - 0.02 * S;
  else if (k < 1.5) d = length(p) - 0.46 * S;
  else if (k < 2.5) d = sdTri(p + vec2(0.0, 0.07 * S), 0.5 * S);
  else if (k < 3.5) d = (abs(p.x) + abs(p.y) - 0.54 * S) * 0.7071;
  else if (k < 4.5) {
    vec2 q = toDir(p, ang);
    d = min(sdBox(q - vec2(-0.2 * S, 0.0), vec2(0.22 * S, 0.1 * S)), sdTri(vec2(q.y, q.x - 0.06 * S), 0.3 * S));
  } else {
    vec2 q = toDir(p, ang);
    float R = 0.5 * S - stroke * 0.5;
    d = abs(length(q) - R) - stroke * 0.5;
    if (q.x > 0.0) d = max(d, gap * 0.5 - abs(q.y));
  }
  float a = aaFill(d);
  if (vWin > 0.0) {
    float br = 0.62 * S + vWin * 0.85 * S;
    float bd = abs(length(p) - br) - 0.06 * S * (1.0 - vWin);
    a = max(a, aaFill(bd) * (1.0 - vWin));
  }
  a *= opacity * fade;
  if (a <= 0.0) discard;
  gl_FragColor = vec4(color, a);
}
`;

export interface ShapeBatch {
  readonly mesh: THREE.Mesh;
  setCenter(i: number, p: THREE.Vector3): void;
  setShapes(shapes: readonly ShapeSpec[], detail: Detail, scale: number): void;
  /** Burst ring amount 0..1 on one shape (0 = none). */
  setWin(i: number, t: number): void;
  setLook(level: number, opacity: number): void;
  setFade(f: number): void;
  commit(): void;
  dispose(): void;
}

export function createShapeBatch(plane?: { right: THREE.Vector3; up: THREE.Vector3 }): ShapeBatch {
  const u = {
    ...baseUniforms(1, 1),
    halfSize: { value: 1 },
    size: { value: 1 },
    gap: { value: 0.3 },
    stroke: { value: 0.17 },
  };
  const b = createQuadBatch({ name: 'OddOneShapes', count: 3, floats: ['Kind', 'Dir', 'Win'], fragmentShader: fragment, uniforms: u, plane });
  return {
    mesh: b.mesh,
    setCenter: (i, p) => b.setCenter(i, p.x, p.y, p.z),
    setShapes(shapes, detail, scale) {
      u.size.value = detail.size * scale;
      u.gap.value = detail.gap * scale;
      u.stroke.value = detail.stroke * scale;
      u.halfSize.value = detail.size * scale * 1.55;
      shapes.forEach((s, i) => {
        b.set('Kind', i, KIND_CODE[s.kind]);
        b.set('Dir', i, s.dir);
      });
    },
    setWin: (i, t) => b.set('Win', i, t),
    setLook(level, opacity) {
      u.color.value.copy(linearGrey(level));
      u.opacity.value = Math.max(0, Math.min(1, opacity));
    },
    setFade: (f) => applyFade(b.material, f),
    commit: () => b.commit(),
    dispose: () => b.dispose(),
  };
}
