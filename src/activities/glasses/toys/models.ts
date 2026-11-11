/**
 * Both-eye models for Pip's lost toys:
 *  - Pip's basket and bowl as plain geometry for the BOOTH's single mesh (`basketGeometry`): every
 *    vertex samples the booth atlas's white swatch and carries its colour in the vertex colour, so
 *    the basket draws with the booth in one call (see `appendToBooth`). A cosy oval dog bed with a
 *    woven wall, a fat rim, a paw badge and a bone on the front, and three empty toy places on the
 *    cushion: dark hollows shaped like the toys that belong there (ball, bone, duck), each ringed
 *    in cream — "something is missing here" reads from the pad.
 *  - The toys (ball, bone, plush duck): ONE instanced mesh; each instance shows one toy kind.
 * Light-on-dark contrasts only, so every part reads in R-only and in G-only.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { swatchUv } from '../booth/cells';
import { BASKET } from './constants';

type Part = { geo: THREE.BufferGeometry; color: THREE.ColorRepresentation; kind?: number };

function paint(parts: Part[]): THREE.BufferGeometry {
  const geos = parts.map((p) => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const n = g.getAttribute('position').count;
    const c = new THREE.Color(p.color);
    const col = new Float32Array(n * 3);
    const kind = new Float32Array(n).fill(p.kind ?? 0);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aPart', new THREE.BufferAttribute(kind, 1));
    return g;
  });
  const out = mergeGeometries(geos, false);
  for (const p of parts) p.geo.dispose();
  for (const g of geos) g.dispose();
  out.computeBoundingSphere();
  return out;
}

// ───────────────────────────── the basket (booth geometry) ─────────────────────────────

const C = {
  wickerLight: 0xe0a85e,
  wickerDark: 0x5e3a1a,
  rim: 0xf6e7c8,
  cushion: 0xc23b4a,
  hollow: 0x1c1418,
  ring: 0xfbf0d8,
  badge: 0xfbf4e2,
  ink: 0x2a1a10,
  bone: 0xf6eedb,
  bowl: 0x2f6fd0,
  bowlRim: 0xffffff,
  bowlIn: 0x1b3156,
  kibble: 0x8a5524,
} as const;

/** Flat shape lying on the ground plane (y up), at height y. */
function flatShape(shape: THREE.Shape, x: number, y: number, z: number, scale = 1, segments = 10): THREE.BufferGeometry {
  const g = new THREE.ShapeGeometry(shape, segments);
  g.rotateX(-Math.PI / 2);
  g.scale(scale, 1, scale);
  g.translate(x, y, z);
  return g;
}

function circle(r: number, cx = 0, cy = 0): THREE.Shape {
  const s = new THREE.Shape();
  s.absarc(cx, cy, r, 0, Math.PI * 2, false);
  return s;
}

/** Bone outline (long axis along x) as overlapping pieces: a bar and four knobs. */
function boneShapes(len: number, knob: number, bar: number): THREE.Shape[] {
  const h = len / 2;
  const s = new THREE.Shape();
  s.moveTo(-h, -bar);
  s.lineTo(h, -bar);
  s.lineTo(h, bar);
  s.lineTo(-h, bar);
  s.closePath();
  const out = [s];
  for (const x of [-h, h]) for (const y of [-knob * 0.7, knob * 0.7]) out.push(circle(knob, x, y));
  return out;
}

/** Duck outline (facing +x): body oval, head disc, beak. */
function duckShapes(s: number): THREE.Shape[] {
  const body = new THREE.Shape();
  body.absellipse(0, 0, 0.21 * s, 0.14 * s, 0, Math.PI * 2, false, 0);
  const head = circle(0.11 * s, 0.15 * s, 0.13 * s);
  const beak = new THREE.Shape();
  beak.moveTo(0.23 * s, 0.16 * s);
  beak.lineTo(0.34 * s, 0.12 * s);
  beak.lineTo(0.23 * s, 0.08 * s);
  beak.closePath();
  return [body, head, beak];
}

/** The outline of toy kind `k` (0 ball, 1 bone, 2 duck) at `scale`. */
function toyOutline(k: number, scale: number): THREE.Shape[] {
  if (k === 0) return [circle(0.3 * scale)];
  if (k === 1) return boneShapes(0.5 * scale, 0.11 * scale, 0.075 * scale);
  return duckShapes(1.45 * scale);
}

/**
 * Pip's basket and the bowl (basket-local: origin at the basket's foot centre, +Z towards the pad),
 * with `position`, `normal`, `uv` (the booth atlas's white swatch) and `color`.
 */
export function basketGeometry(bowlAt: { x: number; y: number; z: number }): THREE.BufferGeometry {
  const B = BASKET;
  const parts: Part[] = [];
  const oval = (g: THREE.BufferGeometry): THREE.BufferGeometry => g.scale(1, 1, B.rz / B.rx);
  // Woven wall: staves around the oval, light / dark, taller at the back, low at the front opening.
  const staves = 22;
  for (let i = 0; i < staves; i++) {
    const a = (i / staves) * Math.PI * 2;
    const h = B.front + (B.back - B.front) * (0.5 - 0.5 * Math.cos(a)); // a = 0 → front (+Z)
    const x = Math.sin(a) * (B.rx - 0.05);
    const z = Math.cos(a) * (B.rz - 0.05);
    // Staves reach 0.25 m below the foot (a slope never shows a gap under the basket).
    const g = new THREE.BoxGeometry(0.27, h + 0.25, 0.12).translate(0, (h - 0.25) / 2, 0);
    g.rotateY(a);
    g.translate(x, 0, z);
    parts.push({ geo: g, color: i % 2 === 0 ? C.wickerLight : C.wickerDark });
  }
  // A light weave band across the staves halfway up (one chunky ring).
  parts.push({ geo: oval(new THREE.TorusGeometry(B.rx - 0.02, 0.045, 4, 22).rotateX(Math.PI / 2).translate(0, 0.2, 0)), color: C.rim });
  // Floor and the cushion (a soft red pillow) inside.
  parts.push({ geo: oval(new THREE.CylinderGeometry(B.rx - 0.12, B.rx - 0.06, B.cushion + 0.05, 18, 1).translate(0, (B.cushion - 0.05) / 2, 0)), color: C.cushion });
  // Fat cream rim: a torus along the top of the staves (tilted: high at the back, low at the front).
  {
    const tilt = Math.atan2(B.back - B.front, 2 * B.rz);
    const g = oval(new THREE.TorusGeometry(B.rx, 0.085, 5, 24).rotateX(Math.PI / 2));
    g.rotateX(tilt);
    g.translate(0, (B.back + B.front) / 2, 0);
    parts.push({ geo: g, color: C.rim });
  }
  // Three empty toy places on the cushion: a cream ring, a dark hollow shaped like its toy.
  const top = B.cushion + 0.005;
  for (let k = 0; k < 3; k++) {
    const [sx, , sz] = B.slots[k];
    parts.push({ geo: flatShape(circle(0.26), sx, top, sz, 1, 12), color: C.ring });
    for (const sh of toyOutline(k, 0.62)) parts.push({ geo: flatShape(sh, sx, top + 0.006, sz, 1, 7), color: C.hollow });
  }
  // Front: a big paw badge on a cream disc, and a bone across under it (Pip's).
  {
    const fz = B.rz + 0.07;
    const by = B.front * 0.52;
    parts.push({ geo: new THREE.CylinderGeometry(0.2, 0.2, 0.05, 16).rotateX(Math.PI / 2).translate(0, by + 0.03, fz), color: C.badge });
    parts.push({ geo: new THREE.SphereGeometry(0.075, 8, 5).scale(1.15, 0.9, 0.4).translate(0, by - 0.01, fz + 0.03), color: C.ink });
    for (const [x, y] of [[-0.1, 0.07], [-0.035, 0.12], [0.035, 0.12], [0.1, 0.07]] as const) {
      parts.push({ geo: new THREE.CylinderGeometry(0.035, 0.035, 0.03, 8).rotateX(Math.PI / 2).scale(1, 1, 1).translate(x, by + y, fz + 0.03), color: C.ink });
    }
    for (const sh of boneShapes(0.5, 0.075, 0.045)) {
      const bone = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false, curveSegments: 3 });
      bone.translate(0, 0.085, fz - 0.03);
      parts.push({ geo: bone, color: C.bone });
    }
  }
  // Dog bowl beside the basket: blue with a white rim, dark inside, kibble.
  {
    const { x: bx, y: by, z: bz } = bowlAt;
    parts.push({ geo: new THREE.CylinderGeometry(0.3, 0.23, 0.26, 14, 1, true).translate(bx, by + 0.03, bz), color: C.bowl });
    parts.push({ geo: new THREE.TorusGeometry(0.3, 0.035, 4, 14).rotateX(Math.PI / 2).translate(bx, by + 0.16, bz), color: C.bowlRim });
    parts.push({ geo: new THREE.CylinderGeometry(0.25, 0.23, 0.07, 12).translate(bx, by + 0.08, bz), color: C.bowlIn });
    for (let i = 0; i < 4; i++) {
      const a = i * 2.39;
      const r = 0.04 + (i % 3) * 0.055;
      parts.push({ geo: new THREE.IcosahedronGeometry(0.04, 0).translate(bx + Math.cos(a) * r, by + 0.13, bz + Math.sin(a) * r), color: C.kibble });
    }
  }
  const g = paint(parts);
  g.deleteAttribute('aPart');
  // Every vertex samples the white swatch: the vertex colour IS the colour.
  const [u0, v0, du, dv] = swatchUv('white');
  const n = g.getAttribute('position').count;
  const uv = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    uv[i * 2] = u0 + du / 2;
    uv[i * 2 + 1] = v0 + dv / 2;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** A vertex range appended to the booth's geometry. */
export interface BoothRange {
  start: number;
  count: number;
  /** Rest positions (booth-mesh-local) of the range, for re-posing it. */
  rest: Float32Array;
}

/**
 * Append `extra` (position, normal, uv, color) to the booth's single geometry so it draws in the
 * booth's one call. Call right after `env.booth(...)`, before the first render (the GPU buffers
 * are created at the first render, so they are made at the grown size). The kit's slots keep their
 * vertex ranges (we only add vertices after them).
 */
export function appendToBooth(geo: THREE.BufferGeometry, extra: THREE.BufferGeometry): BoothRange {
  const start = geo.getAttribute('position').count;
  const count = extra.getAttribute('position').count;
  for (const name of ['position', 'normal', 'uv', 'color']) {
    const a = geo.getAttribute(name) as THREE.BufferAttribute;
    const b = extra.getAttribute(name) as THREE.BufferAttribute;
    if (!a || !b || a.itemSize !== b.itemSize) throw new Error(`toys: cannot append attribute ${name}`);
    const arr = new Float32Array(a.array.length + b.array.length);
    arr.set(a.array as Float32Array);
    arr.set(b.array as Float32Array, a.array.length);
    const grown = new THREE.BufferAttribute(arr, a.itemSize);
    grown.setUsage(a.usage);
    // `copy` swaps in the bigger array and count while keeping the attribute object the kit holds.
    a.copy(grown);
  }
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  if (geo.boundingSphere) geo.boundingSphere.radius += 1.0; // the kit's bobbing billboards
  const rest = Float32Array.from((geo.getAttribute('position').array as Float32Array).subarray(start * 3, (start + count) * 3));
  return { start, count, rest };
}

/** Re-pose a booth range: rest positions × `m` (booth-mesh-local). */
export function poseRange(geo: THREE.BufferGeometry, r: BoothRange, m: THREE.Matrix4 | null): void {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const a = pos.array as Float32Array;
  if (!m) a.set(r.rest, r.start * 3);
  else {
    const e = m.elements;
    for (let i = 0; i < r.count; i++) {
      const x = r.rest[i * 3];
      const y = r.rest[i * 3 + 1];
      const z = r.rest[i * 3 + 2];
      const k = (r.start + i) * 3;
      a[k] = e[0] * x + e[4] * y + e[8] * z + e[12];
      a[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      a[k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
  }
  pos.addUpdateRange(r.start * 3, r.count * 3);
  pos.needsUpdate = true;
}

// ───────────────────────────── the toys ─────────────────────────────

/** Toy kinds (instance attribute `aKind`). */
export const TOY_KINDS = ['ball', 'bone', 'duck'] as const;

function toyParts(scale: number): Part[] {
  const p: Part[] = [];
  const s = (g: THREE.BufferGeometry): THREE.BufferGeometry => g.scale(scale, scale, scale);
  // 0: ball — bright red-orange with two white stripes.
  p.push({ geo: s(new THREE.SphereGeometry(0.2, 18, 12)), color: 0xff5a3c, kind: 0 });
  p.push({ geo: s(new THREE.TorusGeometry(0.2, 0.035, 6, 24)), color: 0xffffff, kind: 0 });
  p.push({ geo: s(new THREE.TorusGeometry(0.2, 0.035, 6, 24).rotateY(Math.PI / 2)), color: 0xffffff, kind: 0 });
  // 1: bone — cream with a dark red band.
  p.push({ geo: s(new THREE.CylinderGeometry(0.065, 0.065, 0.36, 10).rotateZ(Math.PI / 2)), color: 0xf6eedb, kind: 1 });
  for (const x of [-0.18, 0.18]) for (const z of [-0.065, 0.065]) p.push({ geo: s(new THREE.SphereGeometry(0.09, 12, 8).translate(x, 0, z)), color: 0xf6eedb, kind: 1 });
  p.push({ geo: s(new THREE.TorusGeometry(0.068, 0.018, 5, 12).rotateY(Math.PI / 2)), color: 0x8c3b2a, kind: 1 });
  // 2: plush duck — yellow body and head, orange beak, dark eyes.
  p.push({ geo: s(new THREE.SphereGeometry(0.17, 16, 12).scale(1.25, 0.85, 1)), color: 0xffd23a, kind: 2 });
  p.push({ geo: s(new THREE.SphereGeometry(0.115, 14, 10).translate(0.13, 0.16, 0)), color: 0xffd23a, kind: 2 });
  p.push({ geo: s(new THREE.SphereGeometry(0.06, 10, 8).scale(1.4, 0.5, 1).translate(0.25, 0.14, 0)), color: 0xff7a14, kind: 2 });
  for (const z of [-0.06, 0.06]) p.push({ geo: s(new THREE.SphereGeometry(0.022, 8, 6).translate(0.21, 0.2, z)), color: 0x1a1a1a, kind: 2 });
  for (const z of [-0.15, 0.15]) p.push({ geo: s(new THREE.SphereGeometry(0.09, 10, 8).scale(1.2, 0.55, 0.4).translate(-0.02, 0.03, z)), color: 0xe8a91a, kind: 2 });
  p.push({ geo: s(new THREE.ConeGeometry(0.06, 0.12, 8).rotateZ(Math.PI / 2.6).translate(-0.22, 0.07, 0)), color: 0xe8a91a, kind: 2 });
  return p;
}

export interface ToyMesh {
  readonly mesh: THREE.InstancedMesh;
  set(i: number, matrix: THREE.Matrix4, kind: number): void;
  commit(count: number): void;
  dispose(): void;
}

/** All toys in one instanced mesh: vertices of the other kinds collapse to a point. */
export function buildToys(capacity: number, scale = 1.55): ToyMesh {
  const geo = paint(toyParts(scale));
  const kinds = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
  kinds.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aKind', kinds);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPart;\nattribute float aKind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nif (abs(aPart - aKind) > 0.5) transformed = vec3(0.0);');
  };
  mat.customProgramCacheKey = () => 'glasses-toykit';
  const mesh = new THREE.InstancedMesh(geo, mat, capacity);
  mesh.name = 'toys-toys';
  // No shadow: the depth pass would not collapse the other kinds.
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.userData.cameraIgnore = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  return {
    mesh,
    set(i, matrix, kind) {
      mesh.setMatrixAt(i, matrix);
      kinds.setX(i, kind);
    },
    commit(count) {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      kinds.needsUpdate = true;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      mesh.dispose();
    },
  };
}
