/**
 * Vegetation and rocks: a few hand-built species, scattered deterministically and drawn with
 * InstancedMesh, split into map chunks so far chunks are culled. Density follows the quality preset.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Quality } from '../types';
import { T } from './batch';
import type { Materials } from './materials';
import type { Colliders } from './props';
import { Rng, fbm, smoothstep } from './rng';
import { blobG, coneG, cylG, sphereG } from './shapes';
import { anchorClearance, sampleHeight, sampleMask, slopeAt, coastRadius } from './terrain';
import type { TerrainData } from './terrain';
import { SEED } from './layout';

export type TreeKind = 'oak' | 'pine' | 'palm';
export interface ManualTree {
  x: number;
  z: number;
  y?: number;
  kind: TreeKind;
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

function oakGeo(): THREE.BufferGeometry {
  const parts: Part[] = [
    { geo: cylG(9, 0.62), color: 0x6b4a33, m: T(0, -0.3, 0, 0, 0.32, 3.4, 0.32) },
    { geo: cylG(6, 0.4), color: 0x6b4a33, m: T(0.3, 2.2, 0, 0, 0.12, 1.4, 0.12, 0, -0.7) },
    { geo: cylG(6, 0.4), color: 0x6b4a33, m: T(-0.25, 2.4, 0.1, 0.6, 0.11, 1.3, 0.11, 0, 0.75) },
  ];
  const blobs: [number, number, number, number][] = [
    [0, 4.6, 0, 2.2], [1.35, 4.0, 0.5, 1.6], [-1.25, 4.1, -0.4, 1.7], [0.2, 4.1, -1.35, 1.5], [-0.3, 5.5, 0.9, 1.5],
  ];
  blobs.forEach(([x, y, z, r], i) => parts.push({ geo: blobG(70 + i, 1, 0.16), color: 0x4f7f2a, m: T(x, y, z, i, r, r * 0.86, r), shade: [2.6, 6.8] }));
  return assemble(parts);
}

function pineGeo(): THREE.BufferGeometry {
  const parts: Part[] = [{ geo: cylG(7, 0.5), color: 0x5e4330, m: T(0, -0.3, 0, 0, 0.28, 3.0, 0.28) }];
  const tiers: [number, number, number][] = [[1.6, 2.5, 3.2], [3.2, 2.0, 2.8], [4.6, 1.5, 2.5], [5.9, 1.0, 2.2]];
  tiers.forEach(([y, r, h], i) => parts.push({ geo: coneG(9), color: 0x2f5a30, m: T(0, y, 0, i * 0.7, r, h, r), shade: [1.4, 8.2] }));
  return assemble(parts);
}

function palmGeo(): THREE.BufferGeometry {
  const parts: Part[] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < 6; i++) {
    const lean = 0.06 + i * 0.05;
    parts.push({ geo: cylG(7, 0.88), color: i % 2 ? 0x8a6c4a : 0x7a5d3e, m: T(x, y, 0, 0, 0.2 - i * 0.012, 1.1, 0.2 - i * 0.012, 0, -lean) });
    x += Math.sin(lean) * 1.05;
    y += Math.cos(lean) * 1.05;
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    for (let s = 0; s < 3; s++) {
      const out = 0.5 + s * 0.85;
      const droop = -0.15 - s * s * 0.22;
      parts.push({ geo: OCTA, color: 0x5a8a2a, m: T(x + Math.cos(a) * out, y + droop, Math.sin(a) * out, -a, 0.6, 0.07, 0.3), shade: [y - 1.6, y + 0.2] });
    }
  }
  parts.push({ geo: sphereG(0), color: 0x6b4a2a, m: T(x, y - 0.25, 0, 0, 0.32, 0.28, 0.32) });
  return assemble(parts);
}

function bushGeo(): THREE.BufferGeometry {
  return assemble([
    { geo: blobG(91, 1, 0.2), color: 0x47752a, m: T(0, 0.45, 0, 0, 0.8, 0.65, 0.8), shade: [-0.1, 1.2] },
    { geo: blobG(92, 0, 0.15), color: 0x47752a, m: T(0.6, 0.35, 0.2, 1, 0.55, 0.5, 0.55), shade: [-0.1, 1.2] },
    { geo: blobG(93, 0, 0.15), color: 0x47752a, m: T(-0.5, 0.3, -0.25, 2, 0.6, 0.5, 0.55), shade: [-0.1, 1.2] },
  ]);
}

function rockGeo(seed: number): THREE.BufferGeometry {
  return assemble([{ geo: blobG(seed, 1, 0.28, false), color: 0xa39b90, m: T(0, 0.3, 0, 0, 1, 0.7, 1.1), shade: [-0.5, 0.9] }]);
}

function grassGeo(): THREE.BufferGeometry {
  const rng = new Rng(7);
  const pos: number[] = [];
  const col: number[] = [];
  const base = new THREE.Color(0x2f4a14);
  const tip = new THREE.Color(0x9fb045);
  for (let i = 0; i < 9; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0, 0.22);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const h = rng.range(0.28, 0.55);
    const w = rng.range(0.035, 0.055);
    const ry = rng.range(0, Math.PI);
    const lx = Math.cos(ry) * w;
    const lz = Math.sin(ry) * w;
    const lean = rng.range(-0.12, 0.12);
    pos.push(x - lx, 0, z - lz, x + lx, 0, z + lz, x + lean, h, z + lean * 0.5);
    col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // Normals point up so tufts light like the ground they stand on.
  const n = new Float32Array(pos.length);
  for (let i = 1; i < n.length; i += 3) n[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  g.computeBoundingSphere();
  return g;
}

function flowerGeo(): THREE.BufferGeometry {
  const g = grassGeo();
  const heads: Part[] = [];
  const rng = new Rng(11);
  for (let i = 0; i < 3; i++) {
    const a = rng.range(0, Math.PI * 2);
    heads.push({ geo: OCTA, color: 0xffffff, m: T(Math.cos(a) * 0.15, rng.range(0.42, 0.6), Math.sin(a) * 0.15, a, 0.08, 0.05, 0.08) });
  }
  const h = assemble(heads);
  const nn = h.attributes.normal;
  for (let i = 0; i < nn.count; i++) nn.setXYZ(i, 0, 1, 0);
  const merged = mergeGeometries([g, h], false);
  if (!merged) throw new Error('flower');
  return merged;
}

interface Inst {
  x: number;
  y: number;
  z: number;
  yaw: number;
  s: number;
  sy: number;
  color: THREE.Color;
}

interface Species {
  name: string;
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  shadow: boolean;
  /** Fraction of instances drawn at each quality. */
  density: Record<Quality, number>;
  list: Inst[];
}

const CHUNK = 134;

export interface Scatter {
  group: THREE.Group;
  setQuality(q: Quality): void;
  stats(): { instances: number };
}

export function buildScatter(t: TerrainData, mats: Materials, col: Colliders, manual: readonly ManualTree[], keepouts: readonly Keepout[]): Scatter {
  const rng = new Rng(SEED + 77);
  const h = (x: number, z: number): number => sampleHeight(t, x, z);
  const inKeepout = (x: number, z: number, margin: number, pavedOnly: boolean): boolean => {
    for (const k of keepouts) {
      if (pavedOnly && !k.paved) continue;
      if (k.r !== undefined) {
        if (Math.hypot(x - k.x, z - k.z) < k.r + margin) return true;
      } else if (Math.abs(x - k.x) < (k.hx ?? 0) + margin && Math.abs(z - k.z) < (k.hz ?? 0) + margin) return true;
    }
    return false;
  };
  const roadNear = (x: number, z: number, m: number): boolean =>
    sampleMask(t, t.roadMask, x, z) > 0.02 ||
    sampleMask(t, t.roadMask, x + m, z) > 0.02 || sampleMask(t, t.roadMask, x - m, z) > 0.02 ||
    sampleMask(t, t.roadMask, x, z + m) > 0.02 || sampleMask(t, t.roadMask, x, z - m) > 0.02;

  const species: Record<string, Species> = {
    oak: { name: 'oak', geo: oakGeo(), mat: mats.foliage, shadow: true, density: { low: 0.7, medium: 1, high: 1 }, list: [] },
    pine: { name: 'pine', geo: pineGeo(), mat: mats.foliage, shadow: true, density: { low: 0.7, medium: 1, high: 1 }, list: [] },
    palm: { name: 'palm', geo: palmGeo(), mat: mats.foliage, shadow: true, density: { low: 1, medium: 1, high: 1 }, list: [] },
    bush: { name: 'bush', geo: bushGeo(), mat: mats.foliage, shadow: false, density: { low: 0.5, medium: 0.85, high: 1 }, list: [] },
    rockA: { name: 'rockA', geo: rockGeo(301), mat: mats.rock, shadow: true, density: { low: 1, medium: 1, high: 1 }, list: [] },
    rockB: { name: 'rockB', geo: rockGeo(302), mat: mats.rock, shadow: true, density: { low: 1, medium: 1, high: 1 }, list: [] },
    grass: { name: 'grass', geo: grassGeo(), mat: mats.grass, shadow: false, density: { low: 0.2, medium: 0.55, high: 1 }, list: [] },
    flower: { name: 'flower', geo: flowerGeo(), mat: mats.grass, shadow: false, density: { low: 0.25, medium: 0.6, high: 1 }, list: [] },
  };
  const tint = (base: number, v: number): THREE.Color => new THREE.Color(base).offsetHSL(rng.range(-v, v) * 0.15, rng.range(-v, v) * 0.2, rng.range(-v, v) * 0.12);

  const addTree = (kind: TreeKind, x: number, z: number, s: number, y?: number): void => {
    const yy = y ?? h(x, z);
    const tintBase = kind === 'oak' ? (rng.chance(0.25) ? 0xfff0b0 : 0xffffff) : 0xffffff;
    const c = tint(tintBase, 1);
    species[kind].list.push({ x, y: yy - 0.05, z, yaw: rng.range(0, Math.PI * 2), s, sy: s * rng.range(0.9, 1.15), color: c });
    col.cyl(x, yy, z, 2.2 * s, (kind === 'palm' ? 0.22 : 0.3) * s);
  };
  for (const m of manual) addTree(m.kind, m.x, m.z, m.scale ?? 1, m.y);

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
    if (sampleMask(t, t.padMask, x, z) > 0.05 || anchorClearance(x, z) < 4 || roadNear(x, z, 4) || inKeepout(x, z, 3, false)) continue;
    const beach = y < 3.2;
    const ridge = z < -62;
    const dens = beach ? 0.25 : ridge ? 0.85 : 0.12 + 0.75 * forest(x, z);
    if (!rng.chance(dens)) continue;
    const kind: TreeKind = beach ? 'palm' : ridge || y > 24 ? (rng.chance(0.8) ? 'pine' : 'oak') : rng.chance(0.62) ? 'oak' : 'pine';
    addTree(kind, x, z, rng.range(0.8, 1.25));
    placed++;
  }
  // Bushes and rocks.
  for (let i = 0; i < 6000; i++) {
    const x = rng.range(-185, 185);
    const z = rng.range(-185, 185);
    const y = h(x, z);
    if (y < 0.4) continue;
    const sl = slopeAt(t, x, z);
    if (anchorClearance(x, z) < 2 || inKeepout(x, z, 1.5, false) || roadNear(x, z, 2)) continue;
    const pad = sampleMask(t, t.padMask, x, z) > 0.05;
    if (sl > 0.55 || rng.chance(0.3)) {
      if (pad && sl < 0.55) continue;
      const core = Math.hypot(x - 30, z + 5) < 95;
      const big = rng.chance(sl > 0.55 ? 0.5 : core ? 0 : 0.15);
      const s = big ? rng.range(1.4, 2.8) : rng.range(0.35, 0.9);
      const list = rng.chance(0.5) ? species.rockA.list : species.rockB.list;
      if (list.length > 160) continue;
      list.push({ x, y: y - (0.15 + 0.4 * Math.min(1, sl)) * s, z, yaw: rng.range(0, 6.28), s, sy: s * rng.range(0.7, 1.2), color: tint(0xffffff, 0.6) });
      if (big) col.sphere(x, y + 0.1 * s, z, 0.75 * s);
    } else if (!pad && y > 1.5 && species.bush.list.length < 380 && rng.chance(0.35 + 0.5 * forest(x, z))) {
      species.bush.list.push({ x, y: y - 0.1, z, yaw: rng.range(0, 6.28), s: rng.range(0.7, 1.4), sy: rng.range(0.6, 1.2), color: tint(0xffffff, 1) });
    }
  }
  // Grass and flowers: dense around the play areas, thinner further out.
  for (let i = 0; i < 60000; i++) {
    const near = i % 3 !== 0;
    const x = near ? 30 + rng.range(-120, 120) : rng.range(-185, 185);
    const z = near ? -5 + rng.range(-105, 115) : rng.range(-185, 185);
    const y = h(x, z);
    if (y < 1.9) continue;
    if (slopeAt(t, x, z) > 0.5 || sampleMask(t, t.roadMask, x, z) > 0.1 || inKeepout(x, z, 0.4, true)) continue;
    const isFlower = rng.chance(0.12);
    const list = isFlower ? species.flower.list : species.grass.list;
    if (list.length > (isFlower ? 2200 : 16000)) continue;
    list.push({ x, y: y - 0.04, z, yaw: rng.range(0, 6.28), s: rng.range(0.8, 1.5), sy: rng.range(0.7, 1.3), color: isFlower ? new THREE.Color(rng.pick([0xffffff, 0xfff3a0, 0xffd0e0, 0xffffff])) : tint(0xffffff, 1) });
  }

  // Build chunked instanced meshes.
  const group = new THREE.Group();
  group.name = 'scatter';
  const meshes: { mesh: THREE.InstancedMesh; sp: Species; total: number }[] = [];
  const m4 = new THREE.Matrix4();
  for (const sp of Object.values(species)) {
    const chunks = new Map<string, Inst[]>();
    for (const it of sp.list) {
      const key = `${Math.floor(it.x / CHUNK)},${Math.floor(it.z / CHUNK)}`;
      let c = chunks.get(key);
      if (!c) chunks.set(key, (c = []));
      c.push(it);
    }
    for (const [key, list] of chunks) {
      const mesh = new THREE.InstancedMesh(sp.geo, sp.mat, list.length);
      mesh.name = `${sp.name}:${key}`;
      list.forEach((it, i) => {
        m4.copy(T(it.x, it.y, it.z, it.yaw, it.s, it.sy, it.s));
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, it.color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = sp.shadow;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      meshes.push({ mesh, sp, total: list.length });
    }
  }
  return {
    group,
    setQuality(q) {
      for (const m of meshes) m.mesh.count = Math.max(0, Math.round(m.total * m.sp.density[q]));
    },
    stats: () => ({ instances: meshes.reduce((a, m) => a + m.mesh.count, 0) }),
  };
}
