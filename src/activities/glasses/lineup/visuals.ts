/**
 * Line-up visuals: the strong-eye soap bubbles (one quad batch, one draw call, their sparkle pop
 * drawn in the same shader on the same layer), the weak-eye magic ring (one quad) and the
 * both-eye aim pad (one merged mesh).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applyFade, baseFragmentHead, baseUniforms, linearGrey } from '../../../vision/toolkit/common';
import { createQuadBatch } from '../oddone/quadBatch';
import { LINEUP } from './constants';

/** Four-point sparkle (signed distance, approximate) of size `r` at the origin. */
const sparkleLib = /* glsl */ `
float diamondSdf(vec2 q, vec2 h) {
  q = abs(q);
  return (q.x / h.x + q.y / h.y - 1.0) * min(h.x, h.y) * 0.7;
}
float sparkleSdf(vec2 q, float r) {
  return min(diamondSdf(q, vec2(r, r * 0.22)), diamondSdf(q, vec2(r * 0.22, r)));
}
const float TAU = 6.28318530718;
`;

/** Soap bubble in units of its radius (vP spans ±halfSize); the pop is a burst of sparkles. */
const bubbleFragment = /* glsl */ `
${baseFragmentHead}
${sparkleLib}
varying vec2 vP;
varying float vPop;
varying float vAlpha;
void main() {
  vec2 p = vP;
  float d = length(p);
  float a;
  if (vPop <= 0.0) {
    // Thin rim, a faint film, a highlight arc and a glint.
    a = aaFill(abs(d - 1.0) - 0.045);
    a = max(a, 0.1 * aaFill(d - 1.0));
    float ang = atan(p.y, p.x);
    float arc = abs(d - 0.74) - 0.06;
    float inArc = step(1.95, ang) * step(ang, 2.75);
    a = max(a, 0.9 * aaFill(arc) * inArc);
    a = max(a, 0.9 * aaFill(length(p - vec2(0.5, 0.5)) - 0.09));
    a *= vAlpha;
  } else {
    // Pop: eight sparkles fly out and shrink, plus a quick soft flash.
    a = 0.0;
    float r = 1.0 + 0.9 * vPop;
    float size = 0.32 * (1.0 - vPop);
    for (int k = 0; k < 8; k++) {
      float t = float(k) / 8.0 * TAU + 0.2;
      vec2 c = vec2(cos(t), sin(t)) * r;
      a = max(a, aaFill(sparkleSdf(p - c, size)));
    }
    a = max(a, 0.35 * (1.0 - vPop) * aaFill(d - 0.6 * (1.0 - vPop)));
  }
  a *= opacity * fade;
  if (a <= 0.0) discard;
  gl_FragColor = vec4(color, a);
}
`;

export interface BubbleBatch {
  readonly mesh: THREE.Mesh;
  set(i: number, p: THREE.Vector3, radius: number, pop: number, alpha: number): void;
  setFade(f: number): void;
  commit(): void;
  dispose(): void;
}

export function createBubbles(count: number): BubbleBatch {
  // Units of the bubble radius: the quad (±2.3 R) holds the popped sparkles (1.9 R + their size).
  const u = { ...baseUniforms(1, 1), halfSize: { value: 2.3 } };
  const b = createQuadBatch({ name: 'LineUpBubbles', count, floats: ['Pop', 'Alpha'], fragmentShader: bubbleFragment, uniforms: u });
  return {
    mesh: b.mesh,
    set(i, p, radius, pop, alpha) {
      b.setCenter(i, p.x, p.y, p.z);
      b.set('Scale', i, radius);
      b.set('Pop', i, pop);
      b.set('Alpha', i, alpha);
    },
    setFade: (f) => applyFade(b.material, f),
    commit: () => b.commit(),
    dispose: () => b.dispose(),
  };
}

/**
 * The weak-eye magic ring: a sparkly hoop (no ticks, no centre dot) in units of its radius. While
 * it recharges after a miss only an arc of it shows (the rest a faint track); a pop sends out a
 * burst ring. One quad, one draw call.
 */
const hoopFragment = /* glsl */ `
${baseFragmentHead}
${sparkleLib}
uniform float spin;
varying vec2 vP;
varying float vCharge;
varying float vBurst;
void main() {
  vec2 p = vP;
  float d = length(p);
  float hoop = aaFill(abs(d - 1.0) - 0.09);
  float ang = fract(atan(p.x, p.y) / TAU);
  float on = vCharge >= 1.0 ? 1.0 : step(ang, vCharge);
  float a = hoop * mix(0.22, 1.0, on);
  if (vCharge >= 1.0) {
    // Small twinkles riding along the outside of the hoop (never four ticks at the compass points).
    for (int k = 0; k < 7; k++) {
      float t = (float(k) / 7.0 + spin) * TAU;
      vec2 c = vec2(sin(t), cos(t)) * 1.2;
      float tw = 0.13 + 0.07 * sin(t * 3.0 + spin * 40.0);
      a = max(a, aaFill(sparkleSdf(p - c, tw)));
    }
  }
  if (vBurst > 0.0) {
    float br = 1.0 + 0.8 * vBurst;
    a = max(a, (1.0 - vBurst) * aaFill(abs(d - br) - 0.06 * (1.0 - vBurst)));
  }
  a *= opacity * fade;
  if (a <= 0.0) discard;
  gl_FragColor = vec4(color, a);
}
`;

export interface Hoop {
  readonly mesh: THREE.Mesh;
  place(p: THREE.Vector3, radius: number): void;
  setCharge(c: number): void;
  setBurst(b: number): void;
  setLook(level: number, opacity: number): void;
  setFade(f: number): void;
  update(dt: number): void;
  commit(): void;
  dispose(): void;
}

export function createHoop(): Hoop {
  const u = { ...baseUniforms(1, 1), halfSize: { value: 1.95 }, spin: { value: 0 } };
  const b = createQuadBatch({ name: 'LineUpHoop', count: 1, floats: ['Charge', 'Burst'], fragmentShader: hoopFragment, uniforms: u });
  b.set('Charge', 0, 1);
  return {
    mesh: b.mesh,
    place(p, radius) {
      b.setCenter(0, p.x, p.y, p.z);
      b.set('Scale', 0, radius);
    },
    setCharge: (c) => b.set('Charge', 0, Math.max(0, Math.min(1, c))),
    setBurst: (v) => b.set('Burst', 0, Math.max(0, Math.min(1, v))),
    setLook(level, opacity) {
      u.color.value.copy(linearGrey(level));
      u.opacity.value = Math.max(0, Math.min(1, opacity));
    },
    setFade: (f) => applyFade(b.material, f),
    update(dt) {
      u.spin.value = (u.spin.value + dt * 0.12) % 1;
    },
    commit: () => b.commit(),
    dispose: () => b.dispose(),
  };
}

function painted(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  const c = new THREE.Color(hex);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * The aim pad: a bright cream ring with a dark inner disc and two bright footprints pointing at
 * the bubbles (local −Z). Lies flat (XZ), origin at its centre.
 */
export function padGeometry(): THREE.BufferGeometry {
  const { radius, inner } = LINEUP.pad;
  const flat = (g: THREE.BufferGeometry, y: number): THREE.BufferGeometry => {
    g.rotateX(-Math.PI / 2);
    g.translate(0, y, 0);
    g.deleteAttribute('uv');
    return g;
  };
  const parts = [
    painted(flat(new THREE.RingGeometry(inner, radius, 48), 0.004), 0xf6efd9),
    painted(flat(new THREE.CircleGeometry(inner, 48), 0), 0x23253d),
    painted(flat(new THREE.RingGeometry(inner * 0.86, inner * 0.92, 48), 0.006), 0x6c6aa8),
  ];
  for (const side of [-1, 1]) {
    const sole = flat(new THREE.CircleGeometry(0.13, 20), 0.008);
    sole.scale(1, 1, 1.9);
    sole.translate(side * 0.17, 0, 0.05);
    parts.push(painted(sole, 0xfff1a8));
    const toe = flat(new THREE.CircleGeometry(0.1, 16), 0.008);
    toe.translate(side * 0.17, 0, -0.27);
    parts.push(painted(toe, 0xfff1a8));
  }
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('lineup: pad merge failed');
  return merged;
}

export function createPad(): { mesh: THREE.Mesh; setGlow(k: number): void; dispose(): void } {
  const geo = padGeometry();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.7,
    metalness: 0,
    emissive: 0xffffff,
    emissiveIntensity: 0.08,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'LineUpPad';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return {
    mesh,
    setGlow(k) {
      mat.emissiveIntensity = 0.08 + 0.22 * Math.max(0, Math.min(1, k));
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
