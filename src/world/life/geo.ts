/**
 * Tiny procedural critter meshes (one merged geometry per species, drawn instanced) and the shared
 * vertex-animated material. Each vertex carries a colour and `aPart` = (part, pivot):
 *   part 0 body · 1 wing (flaps about the body's long axis, hinge at x = ±pivot)
 *   2 / 3 legs in opposite phase (swing about x at hip height = pivot) · 4 head (nods at neck y = pivot)
 * Per instance `aAnim` = (phase, amplitude, frequency, wing fold 0..1). Facing +Z, feet at y = 0.
 *   6 untinted (keeps its vertex colour; everything else is multiplied by the instance colour)
 * Colours are picked to differ in brightness in R and in G (white wool, dark faces, yellow ducks).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { U } from '../materials';

type Parts = THREE.BufferGeometry[];

function add(parts: Parts, g: THREE.BufferGeometry, color: number, part: number, pivot: number, m?: THREE.Matrix4): void {
  const geo = g.index ? g.toNonIndexed() : g.clone();
  g.dispose();
  if (m) geo.applyMatrix4(m);
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const n = geo.attributes.position.count;
  const c = new THREE.Color(color);
  const col = new Float32Array(n * 3);
  const pa = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
    pa[i * 2] = part;
    pa[i * 2 + 1] = pivot;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aPart', new THREE.BufferAttribute(pa, 2));
  parts.push(geo);
}

function merge(parts: Parts, name: string): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!g) throw new Error(`life: ${name}`);
  g.computeBoundingSphere();
  return g;
}

const T = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0): THREE.Matrix4 =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

const ball = (d = 1): THREE.BufferGeometry => new THREE.IcosahedronGeometry(1, d);

/** Small bird / gull: ~0.5 m wingspan at scale 1. White body (instance colour tints it). */
export function birdGeo(): THREE.BufferGeometry {
  const p: Parts = [];
  add(p, ball(1), 0xffffff, 0, 0, T(0, 0, 0, 0.09, 0.08, 0.19));
  add(p, ball(0), 0xffffff, 0, 0, T(0, 0.05, 0.15, 0.065, 0.065, 0.07));
  add(p, new THREE.ConeGeometry(0.025, 0.08, 5).rotateX(Math.PI / 2), 0xf0a020, 0, 0, T(0, 0.04, 0.24));
  add(p, new THREE.BoxGeometry(0.12, 0.015, 0.12), 0xd8d8d8, 0, 0, T(0, 0.01, -0.22, 1, 1, 1, 0, Math.PI / 4));
  // Eyes: dark dots both sides.
  for (const s of [-1, 1]) add(p, ball(0), 0x141414, 0, 0, T(s * 0.05, 0.07, 0.19, 0.016, 0.016, 0.016));
  for (const s of [-1, 1]) {
    // Wing: swept panel from the shoulder (x = ±0.05) to the tip, darker tip.
    const w = new THREE.BoxGeometry(0.2, 0.012, 0.15);
    add(p, w, 0xf2f2f2, 1, 0.05, T(s * 0.15, 0.03, 0.0, 1, 1, 1, 0, s * 0.12, 0));
    add(p, new THREE.BoxGeometry(0.12, 0.012, 0.1), 0x3a3a3a, 1, 0.05, T(s * 0.31, 0.03, -0.03, 1, 1, 1, 0, s * 0.3, 0));
  }
  return merge(p, 'bird');
}

/** Butterfly: two round wings per side hinged on the body (instance colour = wing colour). */
export function butterflyGeo(): THREE.BufferGeometry {
  const p: Parts = [];
  add(p, new THREE.CylinderGeometry(0.008, 0.006, 0.07, 5).rotateX(Math.PI / 2), 0x202020, 0, 0);
  for (const s of [-1, 1]) {
    add(p, new THREE.CircleGeometry(0.045, 10).rotateX(-Math.PI / 2), 0xffffff, 1, 0, T(s * 0.045, 0, 0.015, 1, 1, 1.15));
    add(p, new THREE.CircleGeometry(0.032, 8).rotateX(-Math.PI / 2), 0xd8d8d8, 1, 0, T(s * 0.035, 0, -0.03));
    // Dark wing edge spots so the shape reads in either channel.
    add(p, new THREE.CircleGeometry(0.012, 6).rotateX(-Math.PI / 2), 0x222222, 1, 0, T(s * 0.068, 0.001, 0.03));
  }
  return merge(p, 'butterfly');
}

/** Sheep: fluffy white body, dark face and legs, ~1 m tall. */
export function sheepGeo(): THREE.BufferGeometry {
  const p: Parts = [];
  const wool = 0xf4f1ea;
  add(p, ball(1), wool, 0, 0, T(0, 0.68, 0, 0.42, 0.34, 0.55));
  for (const [x, y, z, r] of [[0.2, 0.86, 0.22, 0.2], [-0.2, 0.86, 0.18, 0.2], [0.18, 0.84, -0.25, 0.21], [-0.2, 0.85, -0.22, 0.2], [0, 0.95, 0, 0.24], [0, 0.78, 0.4, 0.2], [0, 0.8, -0.45, 0.2]] as const) {
    add(p, ball(1), wool, 0, 0, T(x, y, z, r, r * 0.9, r));
  }
  const face = 0x2b2622;
  add(p, ball(1), face, 4, 0.85, T(0, 0.9, 0.62, 0.15, 0.17, 0.2, 0.3));
  add(p, ball(1), wool, 4, 0.85, T(0, 1.04, 0.56, 0.14, 0.08, 0.12));
  for (const s of [-1, 1]) {
    add(p, ball(0), face, 4, 0.85, T(s * 0.17, 0.98, 0.56, 0.1, 0.035, 0.05, 0, 0, s * -0.4));
    add(p, ball(0), 0xffffff, 4, 0.85, T(s * 0.08, 0.96, 0.75, 0.035, 0.035, 0.03));
    add(p, ball(0), 0x101010, 4, 0.85, T(s * 0.085, 0.96, 0.775, 0.018, 0.018, 0.015));
  }
  for (const [x, z, part] of [[0.2, 0.3, 2], [-0.2, -0.3, 2], [-0.2, 0.3, 3], [0.2, -0.3, 3]] as const) {
    add(p, new THREE.CylinderGeometry(0.055, 0.045, 0.5, 6), face, part, 0.5, T(x, 0.25, z));
  }
  return merge(p, 'sheep');
}

/** Chicken: round white body, red comb, yellow beak and legs, ~0.6 m tall. */
export function chickenGeo(): THREE.BufferGeometry {
  const p: Parts = [];
  const body = 0xfaf7f0;
  add(p, ball(1), body, 0, 0, T(0, 0.36, 0, 0.2, 0.19, 0.25));
  add(p, new THREE.ConeGeometry(0.12, 0.22, 6), body, 0, 0, T(0, 0.48, -0.22, 1, 1, 0.6, -0.7));
  add(p, ball(1), body, 4, 0.45, T(0, 0.56, 0.17, 0.11, 0.12, 0.11));
  add(p, new THREE.BoxGeometry(0.035, 0.08, 0.13), 0xc8282a, 4, 0.45, T(0, 0.69, 0.16));
  add(p, ball(0), 0xc8282a, 4, 0.45, T(0, 0.48, 0.25, 0.03, 0.05, 0.03));
  add(p, new THREE.ConeGeometry(0.035, 0.09, 5).rotateX(Math.PI / 2), 0xf0b020, 4, 0.45, T(0, 0.55, 0.3));
  for (const s of [-1, 1]) {
    add(p, ball(0), 0x111111, 4, 0.45, T(s * 0.07, 0.6, 0.24, 0.02, 0.02, 0.02));
    add(p, ball(1), 0xebe6dc, 1, 0.12, T(s * 0.2, 0.38, -0.02, 0.06, 0.12, 0.17));
  }
  for (const [x, part] of [[0.08, 2], [-0.08, 3]] as const) {
    add(p, new THREE.CylinderGeometry(0.018, 0.018, 0.2, 5), 0xf0b020, part, 0.2, T(x, 0.1, 0));
    add(p, new THREE.BoxGeometry(0.08, 0.02, 0.1), 0xf0b020, part, 0.2, T(x, 0.01, 0.03));
  }
  return merge(p, 'chicken');
}

/** Duck: floats with the waterline at y = 0. Instance colour tints the body (white mum, yellow ducklings). */
export function duckGeo(): THREE.BufferGeometry {
  const p: Parts = [];
  add(p, ball(1), 0xffffff, 0, 0, T(0, 0.04, 0, 0.17, 0.12, 0.25));
  add(p, new THREE.ConeGeometry(0.08, 0.16, 6), 0xffffff, 0, 0, T(0, 0.1, -0.24, 1, 1, 0.6, -1.1));
  add(p, ball(1), 0xffffff, 4, 0.14, T(0, 0.24, 0.16, 0.1, 0.1, 0.1));
  add(p, new THREE.BoxGeometry(0.08, 0.025, 0.1), 0xf08a20, 4, 0.14, T(0, 0.22, 0.29));
  for (const s of [-1, 1]) {
    add(p, ball(0), 0x111111, 4, 0.14, T(s * 0.065, 0.27, 0.22, 0.018, 0.018, 0.018));
    add(p, ball(1), 0xe8e8e8, 1, 0.1, T(s * 0.13, 0.08, -0.03, 0.05, 0.07, 0.16));
  }
  return merge(p, 'duck');
}

/** Fish: silvery body with a tail, ~0.45 m. */
export function fishGeo(): THREE.BufferGeometry {
  const p: Parts = [];
  add(p, ball(1), 0xffffff, 0, 0, T(0, 0, 0, 0.07, 0.1, 0.22));
  add(p, new THREE.ConeGeometry(0.1, 0.14, 4).rotateX(-Math.PI / 2), 0xd0d0d0, 0, 0, T(0, 0, -0.26, 0.3, 1, 1));
  for (const s of [-1, 1]) add(p, ball(0), 0x101010, 0, 0, T(s * 0.05, 0.03, 0.14, 0.02, 0.02, 0.02));
  return merge(p, 'fish');
}

/** A carnival straw boater for the townsfolk (instance colour = hat band). Origin at the hat's base. */
export function hatGeo(): THREE.BufferGeometry {
  const p: Parts = [];
  const straw = 0xf3dc9a;
  add(p, new THREE.CylinderGeometry(0.3, 0.3, 0.025, 20), straw, 6, 0, T(0, 0.012, 0));
  add(p, new THREE.CylinderGeometry(0.17, 0.18, 0.16, 18), straw, 6, 0, T(0, 0.1, 0));
  add(p, new THREE.CylinderGeometry(0.182, 0.182, 0.055, 18, 1, true), 0xffffff, 0, 0, T(0, 0.06, 0));
  return merge(p, 'hat');
}

/**
 * The one lit, vertex-coloured material every critter shares (one shader program). Animates the
 * parts in the vertex shader from `aPart` and the per-instance `aAnim`.
 */
export function critterMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = U.time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute vec2 aPart;\nattribute vec4 aAnim;')
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        {
          float ph = uTime * aAnim.z + aAnim.x;
          float part = aPart.x;
          if (part > 0.5 && part < 1.5) {
            float s = transformed.x < 0.0 ? -1.0 : 1.0;
            float hx = s * aPart.y;
            float dx = (transformed.x - hx) * (1.0 - 0.8 * aAnim.w);
            float ang = aAnim.y * sin(ph) * (1.0 - aAnim.w);
            transformed.x = hx + dx * cos(ang);
            transformed.y += dx * s * sin(ang);
          } else if (part > 1.5 && part < 3.5) {
            float ang = aAnim.y * sin(ph) * (part < 2.5 ? 1.0 : -1.0);
            float dy = transformed.y - aPart.y;
            float dz = transformed.z;
            transformed.y = aPart.y + dy * cos(ang) - dz * sin(ang);
            transformed.z = dy * sin(ang) + dz * cos(ang);
          } else if (part > 3.5 && part < 4.5) {
            float ang = 0.18 * aAnim.y * sin(ph * 0.5) + 0.12 * aAnim.w;
            float dy = transformed.y - aPart.y;
            float dz = transformed.z;
            transformed.y = aPart.y + dy * cos(ang) - dz * sin(ang);
            transformed.z = dy * sin(ang) + dz * cos(ang);
          }
        }`,
      )
      .replace(
        '#include <color_vertex>',
        // Part 6 keeps its vertex colour (no instance tint): the straw of the townsfolk's hats.
        '#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\nif (aPart.x > 5.5) vColor.rgb = color.rgb;\n#endif',
      );
  };
  mat.customProgramCacheKey = () => 'rg-life-critter';
  return mat;
}

/** Unlit soft round blob (contact shadows) or ring (splashes). Per-instance `aFade` scales alpha. */
export function softMaterial(kind: 'blob' | 'ring'): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute float aFade;
      varying vec2 vUv; varying float vFade;
      void main() {
        vUv = uv * 2.0 - 1.0; vFade = aFade;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader:
      kind === 'blob'
        ? /* glsl */ `
      varying vec2 vUv; varying float vFade;
      void main() {
        float r = dot(vUv, vUv);
        float a = (1.0 - smoothstep(0.15, 1.0, r)) * 0.42 * vFade;
        if (a < 0.003) discard;
        gl_FragColor = vec4(0.06, 0.05, 0.04, a);
      }`
        : /* glsl */ `
      varying vec2 vUv; varying float vFade;
      void main() {
        float r = length(vUv);
        float a = smoothstep(0.62, 0.8, r) * (1.0 - smoothstep(0.86, 1.0, r)) * vFade * 0.85;
        if (a < 0.003) discard;
        gl_FragColor = vec4(0.95, 0.98, 1.0, a);
      }`,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
}
