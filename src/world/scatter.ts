/**
 * Vegetation and rocks: a few hand-built species, scattered deterministically and drawn with one
 * InstancedMesh per (species, LOD). Instances live in a coarse grid; every time the camera moves or
 * turns a little, the visible cells are copied into the instance buffers: near cells get the full
 * mesh (and cast shadows), far cells a low-poly mesh, cells outside the (padded) view are skipped.
 * Grass and flowers are generated lazily per small cell around the camera and fade out with distance.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Quality } from '../types';
import { T } from './batch';
import { U, type Materials } from './materials';
import type { Colliders } from './props';
import { Rng, fbm, hash2, noise2, smoothstep } from './rng';
import { blobG, coneG, cylG, sphereG } from './shapes';
import { anchorClearance, sampleHeight, sampleMask, slopeAt, coastRadius } from './terrain';
import type { TerrainData } from './terrain';
import { SEED } from './layout';
import { asShadowProxy, shadowProxyMaterial } from '../core/shadow-proxy';

export type TreeKind = 'oak' | 'pine' | 'palm';
export interface ManualTree {
  x: number;
  z: number;
  y?: number;
  /** Trees get a trunk collider; big rocks (scale ≥ 1.2) a sphere; bushes none. */
  kind: TreeKind | 'bush' | 'rock';
  scale?: number;
}

/** Circles and rectangles where nothing may be scattered (buildings, paved areas…). */
export interface Keepout {
  x: number;
  z: number;
  r?: number;
  hx?: number;
  hz?: number;
  /** Also keep grass out (paved surfaces). */
  paved?: boolean;
  /** Short mown grass, no flowers (sports fields, launch circles). Grass only; trees stay out. */
  mown?: boolean;
}

interface Part {
  geo: THREE.BufferGeometry;
  color: number;
  m: THREE.Matrix4;
  /** Vertical range for the light-to-dark gradient (fake canopy self-shadowing). */
  shade?: [number, number];
}

const _c = new THREE.Color();
const OCTA = new THREE.OctahedronGeometry(1, 0);
function assemble(parts: Part[]): THREE.BufferGeometry {
  const geos = parts.map((p) => {
    const g = (p.geo.index ? p.geo.toNonIndexed() : p.geo.clone()).applyMatrix4(p.m);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const col = new Float32Array(pos.count * 3);
    _c.set(p.color);
    for (let i = 0; i < pos.count; i++) {
      let f = 1;
      if (p.shade) {
        const t = THREE.MathUtils.clamp((pos.getY(i) - p.shade[0]) / (p.shade[1] - p.shade[0]), 0, 1);
        f = (0.55 + 0.6 * t) * (0.85 + 0.25 * Math.max(0, nor.getY(i)));
      }
      col[i * 3] = _c.r * f;
      col[i * 3 + 1] = _c.g * f;
      col[i * 3 + 2] = _c.b * f;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  });
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  if (!merged) throw new Error('assemble failed');
  merged.computeBoundingSphere();
  return merged;
}

const OAK_BLOBS: [number, number, number, number][] = [
  [0, 4.6, 0, 2.2], [1.35, 4.0, 0.5, 1.6], [-1.25, 4.1, -0.4, 1.7], [0.2, 4.1, -1.35, 1.5], [-0.3, 5.5, 0.9, 1.5],
];
function oakGeo(far: boolean): THREE.BufferGeometry {
  const parts: Part[] = [{ geo: cylG(far ? 5 : 9, 0.62), color: 0x6b4a33, m: T(0, -0.3, 0, 0, 0.32, 3.4, 0.32) }];
  if (!far) {
    parts.push(
      { geo: cylG(6, 0.4), color: 0x6b4a33, m: T(0.3, 2.2, 0, 0, 0.12, 1.4, 0.12, 0, -0.7) },
      { geo: cylG(6, 0.4), color: 0x6b4a33, m: T(-0.25, 2.4, 0.1, 0.6, 0.11, 1.3, 0.11, 0, 0.75) },
    );
  }
  // Far: three bigger detail-0 blobs carry the silhouette.
  const blobs = far ? [[0, 4.7, 0, 2.5], [1.2, 4.0, 0.3, 1.9], [-1.1, 4.1, -0.5, 1.9]] : OAK_BLOBS;
  blobs.forEach(([x, y, z, r], i) =>
    parts.push({ geo: blobG(70 + i, far ? 0 : 1, 0.16), color: 0x4f7f2a, m: T(x, y, z, i, r, r * 0.86, r), shade: [2.6, 6.8] }),
  );
  return assemble(parts);
}

/** Oak shadow proxy: the near crown's five blobs (same silhouette) at the lowest detail. */
function oakShadowGeo(): THREE.BufferGeometry {
  const parts: Part[] = [{ geo: cylG(5, 0.62), color: 0, m: T(0, -0.3, 0, 0, 0.32, 3.4, 0.32) }];
  OAK_BLOBS.forEach(([x, y, z, r], i) => parts.push({ geo: blobG(70 + i, 0, 0.16), color: 0, m: T(x, y, z, i, r * 1.12, r * 0.97, r * 1.12) }));
  return assemble(parts);
}

function pineGeo(far: boolean): THREE.BufferGeometry {
  const parts: Part[] = [{ geo: cylG(far ? 4 : 7, 0.5), color: 0x5e4330, m: T(0, -0.3, 0, 0, 0.28, 3.0, 0.28) }];
  const tiers: [number, number, number][] = far ? [[1.6, 2.5, 3.6], [3.6, 1.9, 3.2], [5.5, 1.2, 2.6]] : [[1.6, 2.5, 3.2], [3.2, 2.0, 2.8], [4.6, 1.5, 2.5], [5.9, 1.0, 2.2]];
  tiers.forEach(([y, r, h], i) => parts.push({ geo: coneG(far ? 6 : 9), color: 0x2f5a30, m: T(0, y, 0, i * 0.7, r, h, r), shade: [1.4, 8.2] }));
  return assemble(parts);
}

function palmGeo(far: boolean): THREE.BufferGeometry {
  const parts: Part[] = [];
  let x = 0;
  let y = 0;
  const segs = far ? 3 : 6;
  for (let i = 0; i < segs; i++) {
    const k = (i * 6) / segs;
    const lean = 0.06 + k * 0.05;
    const len = 1.05 * (6 / segs);
    parts.push({ geo: cylG(far ? 4 : 7, 0.88), color: i % 2 ? 0x8a6c4a : 0x7a5d3e, m: T(x, y, 0, 0, 0.2 - k * 0.012, len * 1.05, 0.2 - k * 0.012, 0, -lean) });
    x += Math.sin(lean) * len;
    y += Math.cos(lean) * len;
  }
  const leaves = far ? 6 : 8;
  for (let i = 0; i < leaves; i++) {
    const a = (i / leaves) * Math.PI * 2;
    const steps = far ? 1 : 3;
    for (let s = 0; s < steps; s++) {
      const out = far ? 1.3 : 0.5 + s * 0.85;
      const droop = far ? -0.4 : -0.15 - s * s * 0.22;
      parts.push({ geo: OCTA, color: 0x5a8a2a, m: T(x + Math.cos(a) * out, y + droop, Math.sin(a) * out, -a, far ? 1.5 : 0.6, 0.07, 0.3), shade: [y - 1.6, y + 0.2] });
    }
  }
  parts.push({ geo: sphereG(0), color: 0x6b4a2a, m: T(x, y - 0.25, 0, 0, 0.32, 0.28, 0.32) });
  return assemble(parts);
}

function bushGeo(far: boolean): THREE.BufferGeometry {
  if (far) return assemble([{ geo: blobG(91, 0, 0.2), color: 0x47752a, m: T(0, 0.45, 0, 0, 1.05, 0.75, 1.0), shade: [-0.1, 1.2] }]);
  return assemble([
    { geo: blobG(91, 1, 0.2), color: 0x47752a, m: T(0, 0.45, 0, 0, 0.8, 0.65, 0.8), shade: [-0.1, 1.2] },
    { geo: blobG(92, 0, 0.15), color: 0x47752a, m: T(0.6, 0.35, 0.2, 1, 0.55, 0.5, 0.55), shade: [-0.1, 1.2] },
    { geo: blobG(93, 0, 0.15), color: 0x47752a, m: T(-0.5, 0.3, -0.25, 2, 0.6, 0.5, 0.55), shade: [-0.1, 1.2] },
  ]);
}

function rockGeo(seed: number, far: boolean): THREE.BufferGeometry {
  return assemble([{ geo: blobG(seed, far ? 0 : 1, 0.28, false), color: 0xa39b90, m: T(0, 0.3, 0, 0, 1, 0.7, 1.1), shade: [-0.5, 0.9] }]);
}

/**
 * A soft, full tuft: 11 wide blades in two segments that arch outwards. Vertex colour is a
 * multiplier (dark base → bright tip) on the instance colour, which matches the ground beneath.
 */
function grassGeo(seed = 7, blades = 11): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const pos: number[] = [];
  const col: number[] = [];
  const nrm: number[] = [];
  const shade = [0.62, 0.95, 1.32];
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const r = rng.range(0.02, 0.2);
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;
    const h = rng.range(0.22, 0.46) * (r < 0.1 ? 1.15 : 0.9);
    const w = rng.range(0.05, 0.085);
    // Blade faces roughly tangential so it is seen broadside from most angles.
    const fy = a + Math.PI / 2 + rng.range(-0.6, 0.6);
    const lx = Math.cos(fy) * w;
    const lz = Math.sin(fy) * w;
    const lean = rng.range(0.12, 0.3);
    const ox = Math.cos(a);
    const oz = Math.sin(a);
    const p0 = [bx - lx, 0, bz - lz];
    const p1 = [bx + lx, 0, bz + lz];
    const mx = bx + ox * lean * 0.35 * h;
    const mz = bz + oz * lean * 0.35 * h;
    const p2 = [mx - lx * 0.7, h * 0.55, mz - lz * 0.7];
    const p3 = [mx + lx * 0.7, h * 0.55, mz + lz * 0.7];
    const p4 = [bx + ox * lean * h, h, bz + oz * lean * h];
    const tri = (A: number[], B: number[], Cc: number[], ca: number, cb: number, cc: number): void => {
      pos.push(...A, ...B, ...Cc);
      col.push(ca, ca, ca, cb, cb, cb, cc, cc, cc);
      // Mostly-up normals with a little outward tilt: soft, ground-like lighting.
      for (let k = 0; k < 3; k++) nrm.push(ox * 0.25, 0.95, oz * 0.25);
    };
    tri(p0, p1, p2, shade[0], shade[0], shade[1]);
    tri(p1, p3, p2, shade[0], shade[1], shade[1]);
    tri(p2, p3, p4, shade[1], shade[1], shade[2]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.computeBoundingSphere();
  return g;
}

/**
 * Far grass card: a few single-triangle blades (dark base → bright tip). Six triangles per tuft;
 * at a distance it reads the same as the full tufts, whose colour (the ground's) it shares.
 */
function cardGeo(seed = 9, blades = 6): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const pos: number[] = [];
  const col: number[] = [];
  const nrm: number[] = [];
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const r = rng.range(0.03, 0.18);
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;
    const h = rng.range(0.26, 0.44);
    const w = rng.range(0.09, 0.13);
    const fy = a + Math.PI / 2 + rng.range(-0.5, 0.5);
    const lx = Math.cos(fy) * w;
    const lz = Math.sin(fy) * w;
    const lean = rng.range(0.15, 0.3) * h;
    pos.push(bx - lx, 0, bz - lz, bx + lx, 0, bz + lz, bx + Math.cos(a) * lean, h, bz + Math.sin(a) * lean);
    col.push(0.66, 0.66, 0.66, 0.66, 0.66, 0.66, 1.25, 1.25, 1.25);
    for (let k = 0; k < 3; k++) nrm.push(Math.cos(a) * 0.25, 0.95, Math.sin(a) * 0.25);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.computeBoundingSphere();
  return g;
}

/**
 * Close-up tuft (near LOD): 12 slim blades, each a 3-segment curve that tapers to a point and arches
 * outwards, with a dark root → bright, slightly warm tip gradient. Reads soft and full at the
 * player's feet; the cheaper `grassGeo` takes over a few metres away.
 */
function tuftGeo(seed = 21, blades = 16): THREE.BufferGeometry {
  const rng = new Rng(seed);
  const pos: number[] = [];
  const col: number[] = [];
  const nrm: number[] = [];
  // Colour multipliers along the blade (root → tip); the tip leans warm (less blue).
  const shade = (t: number): [number, number, number] => {
    const v = 0.55 + 0.8 * t ** 0.8;
    return [v * (1 + 0.06 * t), v * (1 + 0.03 * t), v * (1 - 0.18 * t)];
  };
  const SEG = 3;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + rng.range(-0.35, 0.35);
    const r = rng.range(0.0, 0.17);
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;
    const h = rng.range(0.24, 0.5) * (r < 0.08 ? 1.15 : 0.9);
    const w = rng.range(0.028, 0.045);
    const fy = a + Math.PI / 2 + rng.range(-0.7, 0.7);
    const lx = Math.cos(fy);
    const lz = Math.sin(fy);
    const ox = Math.cos(a);
    const oz = Math.sin(a);
    const bend = rng.range(0.25, 0.6) * h;
    const ring: number[][] = [];
    for (let s = 0; s <= SEG; s++) {
      const t = s / SEG;
      const cx = bx + ox * bend * t * t;
      const cz = bz + oz * bend * t * t;
      const cy = h * (t - 0.18 * t * t * (bend / h));
      const ww = w * (1 - t * 0.85);
      ring.push([cx - lx * ww, cy, cz - lz * ww, cx + lx * ww, cy, cz + lz * ww, t]);
    }
    const put = (p: number[], o: number): void => {
      pos.push(p[o], p[o + 1], p[o + 2]);
      col.push(...shade(p[6]));
      nrm.push(ox * 0.3, 0.94, oz * 0.3);
    };
    for (let s = 0; s < SEG; s++) {
      const A = ring[s];
      const B = ring[s + 1];
      if (s < SEG - 1) {
        for (const [p, o] of [[A, 0], [A, 3], [B, 0], [A, 3], [B, 3], [B, 0]] as const) put(p, o);
      } else {
        // Pointed tip.
        const tip = [(B[0] + B[3]) / 2, B[1], (B[2] + B[5]) / 2, 0, 0, 0, 1];
        for (const [p, o] of [[A, 0], [A, 3], [tip, 0]] as const) put(p, o);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.computeBoundingSphere();
  return g;
}

/** A small clump of leaves with 5 flower heads. Head colour comes from the instance colour. */
function flowerGeo(): THREE.BufferGeometry {
  const leaves = grassGeo(13, 6);
  // Leaves: tint to green-ish multipliers (instance colour is the flower colour).
  const lc = leaves.attributes.color;
  for (let i = 0; i < lc.count; i++) lc.setXYZ(i, 0.36 * lc.getX(i), 0.6 * lc.getY(i), 0.2 * lc.getZ(i));
  const heads: Part[] = [];
  const rng = new Rng(11);
  for (let i = 0; i < 5; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0.04, 0.2);
    const y = rng.range(0.3, 0.5);
    heads.push({ geo: OCTA, color: 0xffffff, m: T(Math.cos(a) * r, y, Math.sin(a) * r, a, 0.075, 0.045, 0.075) });
    heads.push({ geo: OCTA, color: 0xfff2a0, m: T(Math.cos(a) * r, y + 0.02, Math.sin(a) * r, a, 0.03, 0.03, 0.03) });
  }
  const h = assemble(heads);
  const nn = h.attributes.normal;
  for (let i = 0; i < nn.count; i++) nn.setXYZ(i, 0, 1, 0);
  const merged = mergeGeometries([leaves, h], false);
  if (!merged) throw new Error('flower');
  merged.computeBoundingSphere();
  return merged;
}

// ───────────────────────────── instance storage ─────────────────────────────

interface Cell {
  x: number;
  y: number;
  z: number;
  /** Bounding radius (cell half-diagonal + object size). */
  r: number;
  n: number;
  mat: Float32Array;
  col: Float32Array;
}

interface Lod {
  mesh: THREE.InstancedMesh;
  cap: number;
}

interface SpeciesDef {
  name: string;
  near: THREE.BufferGeometry;
  far?: THREE.BufferGeometry;
  mat: THREE.Material;
  shadow: boolean;
  /** Fraction of instances drawn at each quality. */
  density: Record<Quality, number>;
  /** Beyond this distance the far mesh is used (if any). */
  lod: Record<Quality, number>;
  /** Not drawn beyond this distance. */
  max: Record<Quality, number>;
  /** Object radius (for culling spheres). */
  size: number;
}

interface Species extends SpeciesDef {
  cells: Map<number, Cell>;
  nearLod: Lod;
  farLod?: Lod;
  /** Shadow-only stand-in (far mesh) sharing the near instances: near trees cast cheap shadows. */
  proxy?: THREE.InstancedMesh;
  /** Grass only: a middle LOD (lighter tuft) between the near tufts and the far cards. */
  midLod?: Lod;
  pending: Map<number, { m: number[]; c: number[]; y0: number; y1: number }>;
}

const CELL = 32;
const GCELL = 12;
const cellKey = (ix: number, iz: number): number => (ix + 512) * 1024 + (iz + 512);

export interface Scatter {
  group: THREE.Group;
  setQuality(q: Quality): void;
  /** Re-pick visible instances for this camera (cheap; only when the camera moved or turned). */
  update(camera: THREE.Camera): void;
  stats(): { instances: number };
  /** Every placed tree/bush/rock (not grass) as world x, z and species name (tests). */
  placements(): { name: string; x: number; z: number; s: number }[];
}

/**
 * Grass per quality: draw radius, base density, the radius of the full curved tufts (`near`) and of
 * the lighter 7-blade tufts (`mid`); beyond that, 6-triangle cards. Density thins out with distance
 * to `thin` × base at the far edge (the ground underneath has the grass colour, so it isn't missed).
 */
const GRASS: Record<Quality, { far: number; density: number; near: number; mid: number; thin: number }> = {
  low: { far: 24, density: 0.4, near: 0, mid: 0, thin: 0.35 },
  medium: { far: 36, density: 0.7, near: 7, mid: 15, thin: 0.4 },
  high: { far: 58, density: 1, near: 9, mid: 22, thin: 0.4 },
};

const FLOWER_COLS = [0xffffff, 0xfff0a0, 0xffc6dc, 0xd9c8ff, 0xffb070, 0xffffff];

export function buildScatter(
  t: TerrainData,
  mats: Materials,
  col: Colliders,
  manual: readonly ManualTree[],
  keepouts: readonly Keepout[],
  groundColor: (x: number, z: number, out: THREE.Color) => THREE.Color,
): Scatter {
  const rng = new Rng(SEED + 77);
  const h = (x: number, z: number): number => sampleHeight(t, x, z);
  const keepHit = (x: number, z: number, margin: number, pred: (k: Keepout) => boolean): Keepout | null => {
    for (const k of keepouts) {
      if (!pred(k)) continue;
      if (k.r !== undefined) {
        if (Math.hypot(x - k.x, z - k.z) < k.r + margin) return k;
      } else if (Math.abs(x - k.x) < (k.hx ?? 0) + margin && Math.abs(z - k.z) < (k.hz ?? 0) + margin) return k;
    }
    return null;
  };
  const inKeepout = (x: number, z: number, margin: number): boolean => keepHit(x, z, margin, (k) => !k.mown) !== null;
  const roadNear = (x: number, z: number, m: number): boolean =>
    sampleMask(t, t.roadMask, x, z) > 0.02 ||
    sampleMask(t, t.roadMask, x + m, z) > 0.02 || sampleMask(t, t.roadMask, x - m, z) > 0.02 ||
    sampleMask(t, t.roadMask, x, z + m) > 0.02 || sampleMask(t, t.roadMask, x, z - m) > 0.02;

  const group = new THREE.Group();
  group.name = 'scatter';
  const all = { low: 1, medium: 1, high: 1 };
  const inf = { low: 1e9, medium: 1e9, high: 1e9 };
  const treeLod = { low: 32, medium: 62, high: 100 };
  // Bushes and rocks on Low draw only their light mesh (one draw each instead of a near/far pair).
  const defs: SpeciesDef[] = [
    { name: 'oak', near: oakGeo(false), far: oakGeo(true), mat: mats.foliage, shadow: true, density: { low: 0.75, medium: 1, high: 1 }, lod: treeLod, max: inf, size: 4 },
    { name: 'pine', near: pineGeo(false), far: pineGeo(true), mat: mats.foliage, shadow: true, density: { low: 0.75, medium: 1, high: 1 }, lod: treeLod, max: inf, size: 4 },
    { name: 'palm', near: palmGeo(false), far: palmGeo(true), mat: mats.foliage, shadow: true, density: all, lod: treeLod, max: inf, size: 4 },
    { name: 'bush', near: bushGeo(false), far: bushGeo(true), mat: mats.foliage, shadow: true, density: { low: 0.5, medium: 0.85, high: 1 }, lod: { low: -Infinity, medium: 50, high: 70 }, max: { low: 110, medium: 170, high: 230 }, size: 1.5 },
    { name: 'rockA', near: rockGeo(301, false), far: rockGeo(301, true), mat: mats.rock, shadow: true, density: all, lod: { low: -Infinity, medium: 55, high: 80 }, max: inf, size: 3 },
    { name: 'rockB', near: rockGeo(302, false), far: rockGeo(302, true), mat: mats.rock, shadow: true, density: all, lod: { low: -Infinity, medium: 55, high: 80 }, max: inf, size: 3 },
    { name: 'grass', near: tuftGeo(21, 12), far: cardGeo(), mat: mats.grass, shadow: false, density: { ...all }, lod: { low: 4, medium: 6, high: 10 }, max: { low: GRASS.low.far, medium: GRASS.medium.far, high: GRASS.high.far }, size: 0.6 },
    { name: 'flower', near: flowerGeo(), mat: mats.grass, shadow: false, density: { ...all }, lod: inf, max: { low: GRASS.low.far, medium: GRASS.medium.far, high: GRASS.high.far }, size: 0.6 },
  ];
  const species: Record<string, Species> = {};
  for (const d of defs) species[d.name] = { ...d, cells: new Map(), pending: new Map(), nearLod: { mesh: null as unknown as THREE.InstancedMesh, cap: 0 } };

  const m4 = new THREE.Matrix4();
  const push = (sp: Species, cs: number, x: number, y: number, z: number, yaw: number, s: number, sy: number, c: THREE.Color): void => {
    const key = cellKey(Math.floor(x / cs), Math.floor(z / cs));
    let p = sp.pending.get(key);
    if (!p) sp.pending.set(key, (p = { m: [], c: [], y0: Infinity, y1: -Infinity }));
    m4.copy(T(x, y, z, yaw, s, sy, s));
    for (let i = 0; i < 16; i++) p.m.push(m4.elements[i]);
    p.c.push(c.r, c.g, c.b);
    p.y0 = Math.min(p.y0, y);
    p.y1 = Math.max(p.y1, y);
  };
  const flush = (sp: Species, cs: number): void => {
    for (const [key, p] of sp.pending) {
      const ix = Math.floor(key / 1024) - 512;
      const iz = (key % 1024) - 512;
      const n = p.c.length / 3;
      const cell: Cell = {
        x: (ix + 0.5) * cs, z: (iz + 0.5) * cs, y: (p.y0 + p.y1) / 2,
        r: Math.hypot(cs / 2, cs / 2, (p.y1 - p.y0) / 2) + sp.size * 2,
        n, mat: new Float32Array(p.m), col: new Float32Array(p.c),
      };
      sp.cells.set(key, cell);
    }
    sp.pending.clear();
  };

  const tint = (base: number, v: number): THREE.Color => new THREE.Color(base).offsetHSL(rng.range(-v, v) * 0.15, rng.range(-v, v) * 0.2, rng.range(-v, v) * 0.12);

  const addTree = (kind: TreeKind, x: number, z: number, s: number, y?: number): void => {
    const yy = y ?? h(x, z);
    const tintBase = kind === 'oak' ? (rng.chance(0.25) ? 0xfff0b0 : 0xffffff) : 0xffffff;
    push(species[kind], CELL, x, yy - 0.05, z, rng.range(0, Math.PI * 2), s, s * rng.range(0.9, 1.15), tint(tintBase, 1));
    col.cyl(x, yy, z, 2.2 * s, (kind === 'palm' ? 0.22 : 0.3) * s);
  };
  for (const m of manual) {
    const s = m.scale ?? 1;
    if (m.kind === 'bush') {
      push(species.bush, CELL, m.x, (m.y ?? h(m.x, m.z)) - 0.1, m.z, rng.range(0, 6.28), s, s * rng.range(0.8, 1.1), tint(0xffffff, 1));
    } else if (m.kind === 'rock') {
      const y = m.y ?? h(m.x, m.z);
      push(rng.chance(0.5) ? species.rockA : species.rockB, CELL, m.x, y - 0.2 * s, m.z, rng.range(0, 6.28), s, s * rng.range(0.8, 1.1), tint(0xffffff, 0.6));
      if (s >= 1.2) col.sphere(m.x, y + 0.1 * s, m.z, 0.75 * s);
    } else addTree(m.kind, m.x, m.z, s, m.y);
  }

  // Trees.
  const forest = (x: number, z: number): number => smoothstep(-0.05, 0.35, fbm(x / 70, z / 70, 3, SEED + 31));
  let placed = 0;
  for (let i = 0; i < 9000 && placed < 420; i++) {
    const x = rng.range(-185, 185);
    const z = rng.range(-185, 185);
    const y = h(x, z);
    const coast = coastRadius(x, z) - Math.hypot(x, z);
    if (y < 0.8 || coast < 2) continue;
    const sl = slopeAt(t, x, z);
    if (sl > 0.9) continue;
    if (sampleMask(t, t.padMask, x, z) > 0.05 || anchorClearance(x, z) < 4 || roadNear(x, z, 4) || inKeepout(x, z, 3)) continue;
    const beach = y < 3.2;
    const ridge = z < -62;
    const dens = beach ? 0.25 : ridge ? 0.85 : 0.12 + 0.75 * forest(x, z);
    if (!rng.chance(dens)) continue;
    const kind: TreeKind = beach ? 'palm' : ridge || y > 24 ? (rng.chance(0.8) ? 'pine' : 'oak') : rng.chance(0.62) ? 'oak' : 'pine';
    addTree(kind, x, z, rng.range(0.8, 1.25));
    placed++;
  }
  // Bushes and rocks.
  let rocks = 0;
  let placedBushes = 0;
  for (let i = 0; i < 6000; i++) {
    const x = rng.range(-185, 185);
    const z = rng.range(-185, 185);
    const y = h(x, z);
    if (y < 0.4) continue;
    const sl = slopeAt(t, x, z);
    if (anchorClearance(x, z) < 2 || inKeepout(x, z, 1.5) || roadNear(x, z, 2)) continue;
    const pad = sampleMask(t, t.padMask, x, z) > 0.05;
    if (sl > 0.55 || rng.chance(0.3)) {
      if (pad && sl < 0.55) continue;
      const core = Math.hypot(x - 30, z + 5) < 95;
      const big = rng.chance(sl > 0.55 ? 0.5 : core ? 0 : 0.15);
      const s = big ? rng.range(1.4, 2.8) : rng.range(0.35, 0.9);
      if (rocks >= 322) continue;
      rocks++;
      push(rng.chance(0.5) ? species.rockA : species.rockB, CELL, x, y - (0.15 + 0.4 * Math.min(1, sl)) * s, z, rng.range(0, 6.28), s, s * rng.range(0.7, 1.2), tint(0xffffff, 0.6));
      if (big) col.sphere(x, y + 0.1 * s, z, 0.75 * s);
    } else if (!pad && y > 1.5 && placedBushes < 380 && rng.chance(0.35 + 0.5 * forest(x, z))) {
      placedBushes++;
      push(species.bush, CELL, x, y - 0.1, z, rng.range(0, 6.28), rng.range(0.7, 1.4), rng.range(0.6, 1.2), tint(0xffffff, 1));
    }
  }
  for (const sp of Object.values(species)) flush(sp, CELL);

  // Grass + flowers: generated per small cell on first use (deterministic per cell).
  const generated = new Set<number>();
  const gc = new THREE.Color();
  const genGrassCell = (ix: number, iz: number): void => {
    const key = cellKey(ix, iz);
    if (generated.has(key)) return;
    generated.add(key);
    const r = new Rng(Math.floor(hash2(ix, iz, SEED + 5) * 4294967296));
    const tries = Math.round((GCELL * GCELL) / 0.62);
    for (let i = 0; i < tries; i++) {
      const x = (ix + r.next()) * GCELL;
      const z = (iz + r.next()) * GCELL;
      const y = h(x, z);
      if (y < 1.7) continue;
      if (slopeAt(t, x, z) > 0.62 || sampleMask(t, t.roadMask, x, z) > 0.08) continue;
      if (keepHit(x, z, 0.3, (k) => k.paved === true)) continue;
      const mown = keepHit(x, z, 0, (k) => k.mown === true) !== null;
      // Meadow patches: denser and taller; thinner, shorter grass in between.
      const meadow = 0.5 + 0.5 * fbm(x / 22, z / 22, 2, SEED + 41);
      const beach = smoothstep(1.7, 3.2, y);
      if (!r.chance((0.45 + 0.55 * meadow) * (0.35 + 0.65 * beach))) continue;
      const patch = noise2(x / 9, z / 9, SEED + 43);
      const isFlower = !mown && r.chance(patch > 0.45 ? 0.22 : 0.012);
      const yaw = r.range(0, Math.PI * 2);
      if (isFlower) {
        const pal = FLOWER_COLS[Math.floor(hash2(Math.floor(x / 9), Math.floor(z / 9), SEED + 44) * FLOWER_COLS.length)];
        gc.set(r.chance(0.8) ? pal : 0xffffff);
        const s = r.range(0.8, 1.25);
        push(species.flower, GCELL, x, y - 0.03, z, yaw, s, s * r.range(0.8, 1.2), gc);
      } else {
        groundColor(x, z, gc);
        // Taller grass is a little lighter/yellower at the tips; mown grass is short and even.
        const v = r.range(-0.06, 0.06);
        gc.offsetHSL(v * 0.25, 0.04, v + 0.02 * meadow);
        const s = mown ? r.range(0.9, 1.2) : r.range(0.85, 1.35) * (0.8 + 0.45 * meadow);
        const sy = mown ? r.range(0.3, 0.42) : r.range(0.75, 1.25) * (0.7 + 0.6 * meadow);
        push(species.grass, GCELL, x, y - 0.03, z, yaw, s, sy, gc);
      }
    }
    flush(species.grass, GCELL);
    flush(species.flower, GCELL);
  };

  // Instanced meshes (one per species and LOD) with enough capacity for the visible set.
  const mkLod = (sp: Species, geo: THREE.BufferGeometry, cap: number, shadow: boolean, tag: string): Lod => {
    const mesh = new THREE.InstancedMesh(geo, sp.mat, cap);
    mesh.name = `${sp.name}:${tag}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    // We cull ourselves (cells vs a padded view frustum), so the bounding sphere is never needed.
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    return { mesh, cap };
  };
  for (const sp of Object.values(species)) {
    let total = 0;
    for (const c of sp.cells.values()) total += c.n;
    const grass = sp.name === 'grass';
    const cap = grass ? 16000 : sp.name === 'flower' ? 3000 : Math.max(1, total);
    // Nothing in the colour pass casts: trees, bushes and rocks cast through a proxy (below).
    sp.nearLod = mkLod(sp, sp.near, grass ? 3000 : cap, false, 'near');
    if (grass) sp.midLod = mkLod(sp, grassGeo(7, 7), 8000, false, 'mid');
    if (sp.far) sp.farLod = mkLod(sp, sp.far, cap, false, 'far');
    if (sp.shadow) {
      const proxy = new THREE.InstancedMesh(sp.name === 'oak' ? oakShadowGeo() : sp.far ?? sp.near, shadowProxyMaterial(), cap);
      proxy.instanceMatrix = sp.nearLod.mesh.instanceMatrix;
      proxy.count = 0;
      proxy.frustumCulled = false;
      proxy.matrixAutoUpdate = false;
      asShadowProxy(proxy);
      proxy.name = `${sp.name}:shadow`;
      group.add(proxy);
      sp.proxy = proxy;
    }
  }

  // ───────────── visibility ─────────────
  let quality: Quality = 'medium';
  const frustum = new THREE.Frustum();
  const pv = new THREE.Matrix4();
  const sphere = new THREE.Sphere();
  const lastPos = new THREE.Vector3(1e9, 0, 0);
  const lastDir = new THREE.Vector3();
  const camPos = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  let dirty = true;

  const fill = (sp: Species, cells: Iterable<Cell>, pad: number): void => {
    const near = sp.nearLod;
    const far = sp.farLod;
    let nn = 0;
    let nf = 0;
    const dens = sp.density[quality];
    const lodD = sp.lod[quality];
    const maxD = sp.max[quality];
    for (const c of cells) {
      const d = Math.hypot(c.x - camPos.x, c.z - camPos.z, (c.y - camPos.y) * 0.5) - c.r * 0.5;
      if (d > maxD) continue;
      sphere.center.set(c.x, c.y, c.z);
      sphere.radius = c.r + pad + Math.max(0, d) * 0.08;
      if (!frustum.intersectsSphere(sphere)) continue;
      const useFar = far !== undefined && d > lodD;
      const L = useFar ? far : near;
      const n = Math.min(Math.ceil(c.n * dens), L.cap - (useFar ? nf : nn));
      if (n <= 0) continue;
      const o = useFar ? nf : nn;
      (L.mesh.instanceMatrix.array as Float32Array).set(c.mat.subarray(0, n * 16), o * 16);
      (L.mesh.instanceColor?.array as Float32Array).set(c.col.subarray(0, n * 3), o * 3);
      if (useFar) nf += n;
      else nn += n;
    }
    const commit = (L: Lod, n: number): void => {
      L.mesh.count = n;
      L.mesh.visible = n > 0;
      L.mesh.instanceMatrix.clearUpdateRanges();
      L.mesh.instanceMatrix.addUpdateRange(0, n * 16);
      L.mesh.instanceMatrix.needsUpdate = true;
      const ic = L.mesh.instanceColor;
      if (ic) {
        ic.clearUpdateRanges();
        ic.addUpdateRange(0, n * 3);
        ic.needsUpdate = true;
      }
    };
    commit(near, nn);
    if (far) commit(far, nf);
    if (sp.proxy) {
      sp.proxy.count = nn;
      sp.proxy.visible = nn > 0;
    }
  };

  /**
   * Grass and flowers: per instance, so LOD radii and the thinning with distance are exact (no
   * cell-sized steps). Cells are still culled against the view first.
   */
  const slots: Lod[] = [];
  const counts = [0, 0, 0];
  const commitN = (L: Lod, n: number): void => {
    L.mesh.count = n;
    L.mesh.visible = n > 0;
    L.mesh.instanceMatrix.clearUpdateRanges();
    L.mesh.instanceMatrix.addUpdateRange(0, n * 16);
    L.mesh.instanceMatrix.needsUpdate = true;
    const ic = L.mesh.instanceColor;
    if (ic) {
      ic.clearUpdateRanges();
      ic.addUpdateRange(0, n * 3);
      ic.needsUpdate = true;
    }
  };
  const fillGrass = (sp: Species, cells: Iterable<Cell>): void => {
    const g = GRASS[quality];
    const dens = sp.density[quality];
    // Without a mid/far mesh (flowers) everything goes to the near mesh.
    slots[0] = sp.nearLod;
    slots[1] = sp.midLod ?? sp.nearLod;
    slots[2] = sp.farLod ?? slots[1];
    const s1 = sp.midLod ? 1 : 0;
    const s2 = sp.farLod ? 2 : s1;
    counts[0] = counts[1] = counts[2] = 0;
    const R = g.far;
    for (const c of cells) {
      if (Math.hypot(c.x - camPos.x, c.z - camPos.z) - c.r > R) continue;
      sphere.center.set(c.x, c.y, c.z);
      sphere.radius = c.r + 1;
      if (!frustum.intersectsSphere(sphere)) continue;
      const n = Math.ceil(c.n * dens);
      const m = c.mat;
      for (let i = 0; i < n; i++) {
        const dx = m[i * 16 + 12] - camPos.x;
        const dz = m[i * 16 + 14] - camPos.z;
        const dy = (m[i * 16 + 13] - camPos.y) * 0.5;
        const d = Math.sqrt(dx * dx + dz * dz + dy * dy);
        if (d > R) continue;
        // Thin out with distance: instance order is random, so dropping the tail is a random subset.
        const keep = 1 - (1 - g.thin) * smoothstep(R * 0.25, R, d);
        if (i + 0.5 > n * keep) continue;
        const k = d <= g.near ? 0 : d <= g.mid ? s1 : s2;
        const L = slots[k];
        const o = counts[k];
        if (o >= L.cap) continue;
        (L.mesh.instanceMatrix.array as Float32Array).set(m.subarray(i * 16, i * 16 + 16), o * 16);
        (L.mesh.instanceColor?.array as Float32Array).set(c.col.subarray(i * 3, i * 3 + 3), o * 3);
        counts[k] = o + 1;
      }
    }
    commitN(sp.nearLod, counts[0]);
    if (sp.midLod) commitN(sp.midLod, counts[1]);
    if (sp.farLod) commitN(sp.farLod, counts[2]);
  };

  const grassCells: Cell[] = [];
  const flowerCells: Cell[] = [];
  const refresh = (): void => {
    for (const sp of Object.values(species)) {
      if (sp.name === 'grass' || sp.name === 'flower') continue;
      fill(sp, sp.cells.values(), sp.shadow ? 22 : 4);
    }
    // Grass cells around the camera, nearest first so the capacity goes to what matters.
    const R = GRASS[quality].far;
    const cx = Math.floor(camPos.x / GCELL);
    const cz = Math.floor(camPos.z / GCELL);
    const rc = Math.ceil(R / GCELL) + 1;
    const order: [number, number, number][] = [];
    for (let iz = cz - rc; iz <= cz + rc; iz++) {
      for (let ix = cx - rc; ix <= cx + rc; ix++) {
        const dx = (ix + 0.5) * GCELL - camPos.x;
        const dz = (iz + 0.5) * GCELL - camPos.z;
        const d = Math.hypot(dx, dz);
        if (d < R + GCELL) order.push([d, ix, iz]);
      }
    }
    order.sort((a, b) => a[0] - b[0]);
    grassCells.length = 0;
    flowerCells.length = 0;
    for (const [, ix, iz] of order) {
      genGrassCell(ix, iz);
      const g = species.grass.cells.get(cellKey(ix, iz));
      if (g) grassCells.push(g);
      const f = species.flower.cells.get(cellKey(ix, iz));
      if (f) flowerCells.push(f);
    }
    species.grass.density[quality] = GRASS[quality].density;
    species.flower.density[quality] = Math.min(1, GRASS[quality].density + 0.2);
    fillGrass(species.grass, grassCells);
    fillGrass(species.flower, flowerCells);
  };

  return {
    group,
    setQuality(q) {
      quality = q;
      U.grassFar.value = GRASS[q].far;
      dirty = true;
    },
    update(camera) {
      camera.updateMatrixWorld();
      camera.getWorldPosition(camPos);
      camera.getWorldDirection(camDir);
      if (!dirty && camPos.distanceToSquared(lastPos) < 1.5 * 1.5 && camDir.dot(lastDir) > 0.9986) return;
      dirty = false;
      lastPos.copy(camPos);
      lastDir.copy(camDir);
      pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(pv);
      refresh();
    },
    placements: () => {
      const out: { name: string; x: number; z: number; s: number }[] = [];
      for (const sp of Object.values(species)) {
        if (sp.name === 'grass' || sp.name === 'flower') continue;
        for (const c of sp.cells.values()) {
          for (let i = 0; i < c.n; i++) {
            const e = c.mat.subarray(i * 16, i * 16 + 16);
            out.push({ name: sp.name, x: e[12], z: e[14], s: Math.hypot(e[0], e[1], e[2]) });
          }
        }
      }
      return out;
    },
    stats: () => ({ instances: Object.values(species).reduce((a, s) => a + s.nearLod.mesh.count + (s.midLod?.mesh.count ?? 0) + (s.farLod?.mesh.count ?? 0), 0) }),
  };
}
