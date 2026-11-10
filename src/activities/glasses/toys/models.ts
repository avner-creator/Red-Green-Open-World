/**
 * Both-eye models for Pip's lost toys: the toy basket + dog bowl (one merged mesh) and the toys
 * (ball, bone, plush duck: ONE instanced mesh; each instance shows one toy kind).
 * Chunky shapes, light-on-dark contrasts so every part reads in R-only and in G-only.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

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

/** Where the found toys rest, in the basket's frame (toy centres). */
export const BASKET_SLOTS: readonly (readonly [number, number, number])[] = [
  [-0.2, 0.68, 0.06],
  [0.22, 0.7, -0.02],
  [0.0, 0.78, -0.22],
];

/** Toy basket (origin at its foot centre) with the dog bowl beside it, one mesh. */
export function buildBasket(): THREE.Mesh {
  const parts: Part[] = [];
  const H = 0.55;
  // Woven wall: stacked bands, light / dark (brightness contrast, not hue).
  const bands = 5;
  for (let i = 0; i < bands; i++) {
    const y0 = (i / bands) * H;
    const r0 = 0.46 + (i / bands) * 0.12;
    const r1 = 0.46 + ((i + 1) / bands) * 0.12;
    parts.push({ geo: new THREE.CylinderGeometry(r1, r0, H / bands, 20, 1, true).translate(0, y0 + H / bands / 2, 0), color: i % 2 === 0 ? 0xc48a4a : 0x7c4f26 });
  }
  parts.push({ geo: new THREE.CylinderGeometry(0.46, 0.46, 0.05, 20).translate(0, 0.025, 0), color: 0x5e3b1c });
  // Cushion inside (soft red-and-cream) and a chunky light rim.
  parts.push({ geo: new THREE.CylinderGeometry(0.5, 0.44, 0.22, 20).translate(0, 0.33, 0), color: 0xb5443d });
  parts.push({ geo: new THREE.TorusGeometry(0.3, 0.05, 6, 18).rotateX(Math.PI / 2).translate(0, 0.44, 0), color: 0xf2e6cf });
  parts.push({ geo: new THREE.TorusGeometry(0.59, 0.055, 8, 24).rotateX(Math.PI / 2).translate(0, H, 0), color: 0xe9c48a });
  // Handle arc.
  parts.push({ geo: new THREE.TorusGeometry(0.5, 0.04, 6, 20, Math.PI).translate(0, H, 0), color: 0x7c4f26 });
  // A light paw badge on the front (+Z faces the approach).
  parts.push({ geo: new THREE.CylinderGeometry(0.13, 0.13, 0.03, 16).rotateX(Math.PI / 2).translate(0, 0.27, 0.54), color: 0xf7efe0 });
  for (const [x, y] of [[-0.06, 0.32], [0.0, 0.34], [0.06, 0.32]] as const) parts.push({ geo: new THREE.SphereGeometry(0.025, 8, 6).translate(x, y, 0.56), color: 0x3a2412 });
  parts.push({ geo: new THREE.SphereGeometry(0.045, 8, 6).scale(1, 0.8, 0.5).translate(0, 0.25, 0.56), color: 0x3a2412 });
  // Dog bowl to the right: bright rim, dark kibble.
  const bx = 0.95;
  const bz = 0.25;
  parts.push({ geo: new THREE.CylinderGeometry(0.27, 0.2, 0.14, 20, 1, true).translate(bx, 0.07, bz), color: 0x3d84d9 });
  parts.push({ geo: new THREE.TorusGeometry(0.27, 0.03, 6, 20).rotateX(Math.PI / 2).translate(bx, 0.14, bz), color: 0xffffff });
  parts.push({ geo: new THREE.CylinderGeometry(0.22, 0.2, 0.06, 18).translate(bx, 0.07, bz), color: 0x25476f });
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39;
    const r = 0.04 + (i % 3) * 0.05;
    parts.push({ geo: new THREE.IcosahedronGeometry(0.035, 0).translate(bx + Math.cos(a) * r, 0.11, bz + Math.sin(a) * r), color: 0x8a5524 });
  }
  const mesh = new THREE.Mesh(paint(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }));
  mesh.name = 'toys-basket';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Toy kinds (instance attribute `aKind`). */
export const TOY_KINDS = ['ball', 'bone', 'duck'] as const;

function toyParts(scale: number): Part[] {
  const p: Part[] = [];
  const s = (g: THREE.BufferGeometry): THREE.BufferGeometry => g.scale(scale, scale, scale);
  // 0: ball — bright red-orange with two white stripes.
  p.push({ geo: s(new THREE.SphereGeometry(0.2, 18, 12)), color: 0xff5a3c, kind: 0 });
  p.push({ geo: s(new THREE.TorusGeometry(0.2, 0.035, 6, 24)), color: 0xffffff, kind: 0 });
  p.push({ geo: s(new THREE.TorusGeometry(0.2, 0.035, 6, 24).rotateY(Math.PI / 2)), color: 0xffffff, kind: 0 });
  // 1: bone — cream with darker knobs' shading from the light.
  p.push({ geo: s(new THREE.CylinderGeometry(0.065, 0.065, 0.36, 10).rotateZ(Math.PI / 2)), color: 0xf6eedb, kind: 1 });
  for (const x of [-0.18, 0.18]) for (const z of [-0.065, 0.065]) p.push({ geo: s(new THREE.SphereGeometry(0.09, 12, 8).translate(x, 0, z)), color: 0xf6eedb, kind: 1 });
  p.push({ geo: s(new THREE.TorusGeometry(0.068, 0.018, 5, 12).rotateY(Math.PI / 2)), color: 0x8c3b2a, kind: 1 });
  // 2: plush duck — yellow body and head, orange beak, dark eyes, light belly.
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
