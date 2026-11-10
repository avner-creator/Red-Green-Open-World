/**
 * Line-up visuals: the strong-eye bubbles (one quad batch, one draw call, with their pop effect
 * drawn in the same shader on the same layer) and the both-eye aim pad (one merged mesh).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applyFade, baseFragmentHead, baseUniforms } from '../../../vision/toolkit/common';
import { createQuadBatch } from '../oddone/quadBatch';
import { LINEUP } from './constants';

const bubbleFragment = /* glsl */ `
${baseFragmentHead}
varying vec2 vP;
varying float vRadius;
varying float vPop;
varying float vAlpha;
const float TAU = 6.28318530718;
void main() {
  float R = vRadius * (1.0 + 0.65 * vPop);
  float d = length(vP);
  float th = 0.13 * vRadius * (1.0 - 0.5 * vPop);
  float s = abs(d - R) - th * 0.5;
  if (vPop > 0.0) {
    // The ring breaks into 8 dashes that shrink away.
    float local = fract(atan(vP.y, vP.x) / TAU * 8.0);
    s = max(s, (abs(local - 0.5) - 0.5 * (1.0 - vPop)) * (TAU * R / 8.0));
  }
  float a = aaFill(s);
  if (vPop <= 0.0) {
    a = max(a, 0.2 * aaFill(d - R));
    float h = length(vP - vec2(-0.38, 0.4) * vRadius) - 0.16 * vRadius;
    a = max(a, 0.95 * aaFill(h));
    float h2 = length(vP - vec2(-0.12, 0.6) * vRadius) - 0.07 * vRadius;
    a = max(a, 0.8 * aaFill(h2));
  }
  a *= vAlpha * (1.0 - vPop) * opacity * fade;
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
  // One quad size for every bubble: big enough for the largest popped ring (1.65 R + stroke).
  const u = { ...baseUniforms(1, 1), halfSize: { value: LINEUP.bubble.radius * 1.9 } };
  const b = createQuadBatch({ name: 'LineUpBubbles', count, floats: ['Radius', 'Pop', 'Alpha'], fragmentShader: bubbleFragment, uniforms: u });
  return {
    mesh: b.mesh,
    set(i, p, radius, pop, alpha) {
      b.setCenter(i, p.x, p.y, p.z);
      b.set('Radius', i, radius);
      b.set('Pop', i, pop);
      b.set('Alpha', i, alpha);
    },
    setFade: (f) => applyFade(b.material, f),
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
