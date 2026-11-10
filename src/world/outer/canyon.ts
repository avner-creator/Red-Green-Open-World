/**
 * Canyon Bridge: the steel-arch bridge with a proper bungee jump platform (railings with mesh
 * panels, struts, flags; its west end stays open for the bungee springboard), flags at both ends,
 * layered rock strata painted on the canyon walls, a waterfall cascading down the north wall from a
 * spring on the ridge, and a river that winds along the canyon floor past the bungee landing shore
 * into the bay. Water surfaces are returned as plain geometry for the animated water material.
 */
import * as THREE from 'three';
import { T } from '../batch';
import { C, box, type Kit } from '../props';
import { boxG, cylG, pennantG, rbox, sphereG, torusG } from '../shapes';
import { ANCHORS, BRIDGE, CANYON, DECK_Y } from '../layout';
import type { Keepout, ManualTree } from '../scatter';
import { beam, markerFlag, pebbles, reeds, ribbon, tallPennant } from './common';

export interface CanyonResult {
  trees: ManualTree[];
  keepouts: Keepout[];
  /** Water geometry (world space) with a per-vertex `aFoam` 0..1. */
  waterfall: THREE.BufferGeometry;
  river: THREE.BufferGeometry;
  /** River centreline (x, z, half width) for tests. */
  riverLine: { x: number; z: number; hw: number }[];
}

/** Platform extents (shared with the bungee activity, which finds the west end by raycast). */
const PLATFORM = { out: 3.8, width: 3.4 } as const;

function bridge(k: Kit): void {
  const b = k.b;
  const { x, z0, z1, width } = BRIDGE;
  const len = z0 - z1;
  const zc = (z0 + z1) / 2;
  const hw = width / 2;
  const top = DECK_Y;
  // Deck slab and planks.
  box(b, 'paint', T(0, 0, 0), x, top - 0.65, zc, width, 0.6, len, 0x5e4634);
  const n = Math.round(len / 0.55);
  const tones = [0x9b7350, 0x8d6847, 0xa67c56, 0x936d4b];
  for (let i = 0; i < n; i++) box(b, 'paint', T(0, 0, 0), x, top - 0.07, z0 - (i + 0.5) * (len / n), width - 0.3, 0.07, len / n - 0.05, tones[i % 4]);
  // Kerb boards and a centre stripe of darker planks.
  for (const s of [-1, 1]) box(b, 'paint', T(0, 0, 0), x + s * (hw - 0.32), top - 0.05, zc, 0.3, 0.14, len, 0x6a4630);
  k.col.box(T(x, top - 0.35, zc), 0, 0, 0, hw, 0.35, len / 2);
  // Steel side girders with bolted plates every 4 m.
  for (const s of [-1, 1]) {
    box(b, 'metal', T(0, 0, 0), x + s * (hw + 0.15), top - 1.5, zc, 0.35, 1.3, len, 0x6e2f28);
    for (let zz = z1 + 2; zz < z0; zz += 4) box(b, 'metal', T(0, 0, 0), x + s * (hw + 0.34), top - 1.4, zz, 0.05, 1.1, 0.5, 0x5a2620);
  }
  // Railings with a gap at the bungee platform (west side).
  const gz = ANCHORS.bungee.z;
  const gap = 1.7;
  for (const s of [-1, 1]) {
    const rx = x + s * (hw - 0.12);
    const runs: [number, number][] = s < 0 ? [[z0, gz + gap], [gz - gap, z1]] : [[z0, z1]];
    for (const [ra, rb] of runs) {
      const rl = ra - rb;
      const posts = Math.max(1, Math.round(rl / 2));
      for (let i = 0; i <= posts; i++) box(b, 'metal', T(0, 0, 0), rx, top, ra - (i * rl) / posts, 0.12, 1.15, 0.12, 0x2c3036);
      box(b, 'paint', T(0, 0, 0), rx, top + 1.08, (ra + rb) / 2, 0.16, 0.12, rl, 0x9b7350);
      box(b, 'metal', T(0, 0, 0), rx, top + 0.55, (ra + rb) / 2, 0.06, 0.06, rl, 0x2c3036);
      box(b, 'metal', T(0, 0, 0), rx, top + 0.25, (ra + rb) / 2, 0.06, 0.06, rl, 0x2c3036);
      k.col.box(T(rx, top, (ra + rb) / 2), 0, 0.6, 0, 0.12, 0.6, rl / 2);
    }
  }
  // Arches underneath (two ribs), with hangers and cross braces.
  const za = -93.5;
  const zb = -118.5;
  const yBase = 19;
  const yTop = top - 1.3;
  const arch = (t: number): [number, number] => [za + (zb - za) * t, yBase + (yTop - yBase) * (1 - (2 * t - 1) ** 2)];
  const segs = 18;
  for (const s of [-1, 1]) {
    const ax = x + s * (hw - 0.6);
    for (let i = 0; i < segs; i++) {
      const [za0, ya0] = arch(i / segs);
      const [za1, ya1] = arch((i + 1) / segs);
      const l = Math.hypot(za1 - za0, ya1 - ya0);
      const pitch = Math.atan2(ya1 - ya0, -(za1 - za0));
      b.add('metal', boxG(), 0x6e2f28, T(ax, (ya0 + ya1) / 2 - 0.35, (za0 + za1) / 2, 0, 0.5, 0.7, l + 0.08, pitch));
    }
    for (let i = 1; i < 8; i++) {
      const [hz, hy] = arch(i / 8);
      box(b, 'metal', T(0, 0, 0), ax, hy, hz, 0.18, top - 1.3 - hy, 0.18, 0x2c3036);
    }
    // Skewback footings where the ribs meet the canyon walls.
    for (const fz of [za, zb]) b.add('matte', rbox(1.6, 2.4, 2.2, 0.1), 0xb5ab9a, T(ax, yBase - 2.2, fz));
  }
  // X-bracing between the ribs.
  for (let i = 1; i < 6; i++) {
    const [hz, hy] = arch(i / 6);
    box(b, 'metal', T(0, 0, 0), x, hy - 0.2, hz, width - 1.2, 0.25, 0.25, 0x2c3036);
    for (const r of [0.55, -0.55]) b.add('metal', boxG(), 0x2c3036, T(x, hy - 0.2, hz, 0, 0.1, 0.1, (width - 1.2) * 1.15, 0, Math.PI / 2 + r));
  }
  // Stone abutments at both ends with lamp piers and tall pennants.
  for (const ez of [z0 - 1.5, z1 + 1.5]) {
    const ey = k.h(x, ez);
    box(b, 'matte', T(0, 0, 0), x, Math.min(ey, top) - 6, ez, width + 1.6, top - Math.min(ey, top) + 5.4, 3, 0xb5ab9a);
    for (const s of [-1, 1]) {
      box(b, 'matte', T(0, 0, 0), x + s * (hw + 0.5), top - 0.6, ez, 1.0, 1.9, 1.0, 0xc9bfac);
      b.add('glow', boxG(), C.bulb, T(x + s * (hw + 0.5), top + 1.3, ez, 0, 0.4, 0.45, 0.4));
      box(b, 'metal', T(0, 0, 0), x + s * (hw + 0.5), top + 1.75, ez, 0.55, 0.12, 0.55, 0x2c3036);
      k.col.box(T(x + s * (hw + 0.5), top + 0.35, ez), 0, 0, 0, 0.5, 1.0, 0.5);
      // Flag mast on the outer face of each pier.
      const fx = x + s * (hw + 1.15);
      b.add('metal', cylG(8), 0xe8e6e0, T(fx, top - 0.6, ez, 0, 0.06, 5.6, 0.06));
      b.add('gloss', sphereG(1), 0xf0c050, T(fx, top + 5.05, ez, 0, 0.1, 0.1, 0.1));
      b.add('cloth', pennantG(), s < 0 ? 0x7cc243 : 0xf2c14e, T(fx, top + 4.8, ez, s < 0 ? -Math.PI / 2 : Math.PI / 2, 0.95, 1.35, 1));
    }
  }

  // ── Bungee jump platform: juts out west from the railing gap. The west end stays open. ──
  const px0 = x - hw;
  const px1 = x - hw - PLATFORM.out;
  const pcx = (px0 + px1) / 2;
  box(b, 'paint', T(0, 0, 0), pcx, top - 0.65, gz, PLATFORM.out, 0.6, PLATFORM.width, 0x5e4634);
  for (let i = 0; i < 6; i++) box(b, 'paint', T(0, 0, 0), pcx, top - 0.07, gz - 1.5 + i * 0.6, 3.7, 0.07, 0.52, tones[i % 4]);
  // Hazard stripe at the edge and a jump-spot target painted near it.
  for (let i = 0; i < 7; i++) box(b, 'paint', T(0, 0, 0), px1 + 0.15, top - 0.04, gz - 1.5 + i * 0.5, 0.3, 0.06, 0.5, i % 2 ? 0x1c1c1c : 0xf2c14e);
  b.add('paint', torusG(0.06, 24, Math.PI * 2, 0.5), 0xf4efe6, T(px1 + 1.3, top + 0.01, gz));
  k.col.box(T(pcx, top - 0.35, gz), 0, 0, 0, PLATFORM.out / 2, 0.35, PLATFORM.width / 2);
  // Under-structure: diagonal struts from the platform's outer end back down to the girder.
  for (const s of [-1, 1]) {
    const sz = gz + s * 1.3;
    beam(b, 'metal', [px1 + 0.4, top - 0.95, sz], [px0 + 0.1, top - 2.9, sz], 0.18, 0x6e2f28);
    beam(b, 'metal', [px1 + 0.4, top - 0.95, sz], [px0 + 0.1, top - 0.95, sz], 0.16, 0x6e2f28);
  }
  for (const s of [-1, 1]) {
    const rz = gz + s * 1.6;
    // Railings with white mesh panels on the two long sides only.
    box(b, 'metal', T(0, 0, 0), pcx, top + 1.0, rz, PLATFORM.out, 0.1, 0.1, 0x2c3036);
    box(b, 'metal', T(0, 0, 0), pcx, top + 0.1, rz, PLATFORM.out, 0.08, 0.08, 0x2c3036);
    for (const qx of [px0, (px0 + px1) / 2, px1 + 0.3]) box(b, 'metal', T(0, 0, 0), qx, top, rz, 0.12, 1.1, 0.12, 0x2c3036);
    box(b, 'paint', T(0, 0, 0), pcx - 0.15, top + 0.18, rz, PLATFORM.out - 0.5, 0.78, 0.03, 0xe8e4da);
    for (let i = 0; i < 6; i++) box(b, 'paint', T(0, 0, 0), px1 + 0.5 + i * 0.55, top + 0.18, rz + s * 0.02, 0.05, 0.78, 0.03, 0x9aa0a8);
    k.col.box(T(pcx, top, rz), 0, 0.55, 0, PLATFORM.out / 2, 0.55, 0.08);
    // Gantry posts (yellow), a flag on each, outside the jump line.
    box(b, 'metal', T(0, 0, 0), px1 + 0.6, top, rz, 0.22, 3.4, 0.22, 0xf2c14e);
    for (let i = 0; i < 4; i++) box(b, 'paint', T(0, 0, 0), px1 + 0.6, top + 0.35 + i * 0.8, rz, 0.24, 0.3, 0.24, 0x1c1c1c);
    b.add('metal', cylG(6), 0xe8e6e0, T(px1 + 0.6, top + 3.4, rz + s * 0.05, 0, 0.04, 1.5, 0.04));
    b.add('cloth', pennantG(), s < 0 ? 0xc8433a : 0x7cc243, T(px1 + 0.6, top + 4.8, rz + s * 0.05, s < 0 ? Math.PI : 0, 0.7, 0.9, 1));
  }
  box(b, 'metal', T(0, 0, 0), px1 + 0.6, top + 3.3, gz, 0.3, 0.3, 3.6, 0xf2c14e);
  b.add('gloss', torusG(0.08, 16), 0xd9b34a, T(px1 + 0.6, top + 3.05, gz, 0, 0.22, 1, 0.22, Math.PI / 2));
}

/** Find the z on a canyon wall (side −1 north, towards −Z / +1 south of the axis) where the ground reaches y. */
function wallZ(k: Kit, x: number, y: number, side: number): number | null {
  let za = CANYON.z + side * 5;
  let zb = CANYON.z + side * 20;
  if (k.h(x, za) > y || k.h(x, zb) < y) return null;
  for (let i = 0; i < 24; i++) {
    const zm = (za + zb) / 2;
    if (k.h(x, zm) < y) za = zm;
    else zb = zm;
  }
  return (za + zb) / 2;
}

/** A painted band on a canyon wall between heights y0..y1, pushed `off` metres out from the rock. */
function wallBand(k: Kit, xs: readonly number[], y0: number, y1: number, side: number, off: number, color: (x: number, y: number) => number, rows: number): THREE.BufferGeometry | null {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  const grid: (number | null)[][] = [];
  for (let i = 0; i < xs.length; i++) {
    grid.push([]);
    for (let j = 0; j <= rows; j++) {
      const y = y0 + ((y1 - y0) * j) / rows;
      const z = wallZ(k, xs[i], y, side);
      if (z === null) {
        grid[i].push(null);
        continue;
      }
      grid[i].push(pos.length / 3);
      pos.push(xs[i], y, z - side * off);
      c.set(color(xs[i], y));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let i = 1; i < xs.length; i++) {
    for (let j = 1; j <= rows; j++) {
      const a0 = grid[i - 1][j - 1];
      const a1 = grid[i][j - 1];
      const b0 = grid[i - 1][j];
      const b1 = grid[i][j];
      if (a0 === null || a1 === null || b0 === null || b1 === null) continue;
      if (side > 0) idx.push(a0, b0, a1, a1, b0, b1);
      else idx.push(a0, a1, b0, a1, b1, b0);
    }
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Sandstone strata on both canyon walls: alternating light/dark bands (they read by brightness). */
function strata(k: Kit): void {
  const xs: number[] = [];
  for (let x = -52; x <= 38; x += 1.25) xs.push(x);
  const bands: [number, number, number][] = [
    [2.0, 5.5, 0x8a6a4e], [5.5, 8.0, 0xd8c3a0], [8.0, 11.5, 0xa4785a], [11.5, 13.0, 0x5e4a3e], [13.0, 17.5, 0xcdb48c],
    [17.5, 20.0, 0x9c6e52], [20.0, 23.5, 0xe2d2b2], [23.5, 25.0, 0x6e5444], [25.0, 28.5, 0xbf9a74],
  ];
  for (const side of [-1, 1]) {
    for (const [y0, y1, base] of bands) {
      const tone = new THREE.Color(base);
      const g = wallBand(k, xs, y0, y1, side, 0.5, (x, y) => {
        const n = 0.9 + 0.12 * Math.sin(x * 0.37 + y * 1.3) + 0.06 * Math.sin(x * 1.9 - y * 0.7);
        return new THREE.Color(tone.r * n, tone.g * n, tone.b * n).getHex();
      }, Math.max(2, Math.round((y1 - y0) / 0.9)));
      if (g) {
        k.b.add('road', g, 0xffffff);
        g.dispose();
      }
    }
  }
}

const FALL_X = -45;
const POOL = { x: -45, z: -112.2, r: 3.6 };

/** Catmull-Rom through control points, resampled every `step` metres. */
function spline(ctrl: readonly [number, number, number][], step: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)];
    const p1 = ctrl[i];
    const p2 = ctrl[i + 1];
    const p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let s = 0; s < n; s++) {
      const t = s / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number): number => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), f(p0[2], p1[2], p2[2], p3[2])]);
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}

/** River centreline (x, z, half width), east (upstream) → west (into the bay). */
export function riverLine(): [number, number, number][] {
  return spline(
    [
      [44, -104.5, 1.3], [32, -102.2, 1.6], [18, -104.8, 1.7], [6, -109.5, 1.6], [-6, -111.6, 1.3], [-12, -112.4, 1.05], [-24, -112.4, 1.05],
      [-31, -110.6, 1.4], [-38, -108.6, 1.6], [POOL.x, POOL.z + 1.2, 2.0], [-52, -108.5, 2.2], [-60, -106.5, 2.6],
    ],
    1.5,
  );
}

function water(k: Kit): { waterfall: THREE.BufferGeometry; river: THREE.BufferGeometry; line: CanyonResult['riverLine'] } {
  // ── River: a ribbon just above the floor, foamy at the edges; sandy banks underneath ──
  const line = riverLine();
  const pos: number[] = [];
  const foam: number[] = [];
  const idx: number[] = [];
  const across = [-1, -0.6, 0, 0.6, 1];
  const surf = (x: number, z: number): number => Math.max(k.h(x, z) + 0.12, 0.04);
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)];
    const b = line[Math.min(line.length - 1, i + 1)];
    const tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / tl;
    const nz = (b[0] - a[0]) / tl;
    const [cx, cz, hw] = line[i];
    const cy = surf(cx, cz);
    for (let q = 0; q < across.length; q++) {
      const x = cx + nx * across[q] * hw;
      const z = cz + nz * across[q] * hw;
      pos.push(x, Math.min(cy + 0.02, surf(x, z)), z);
      const nearPool = Math.max(0, 1 - Math.hypot(cx - POOL.x, cz - POOL.z) / 6);
      foam.push(Math.max(Math.abs(across[q]) ** 3 * 0.6, nearPool * 0.55));
      if (i > 0 && q > 0) {
        const a1 = i * across.length + q;
        idx.push(a1 - across.length - 1, a1 - 1, a1 - across.length, a1 - across.length, a1 - 1, a1);
      }
    }
  }
  // Plunge pool: a disc of water at the foot of the falls.
  const p0 = pos.length / 3;
  const py = surf(POOL.x, POOL.z) + 0.03;
  pos.push(POOL.x, py, POOL.z);
  foam.push(1);
  const ps = 20;
  for (let i = 0; i <= ps; i++) {
    const ang = (i / ps) * Math.PI * 2;
    pos.push(POOL.x + Math.cos(ang) * POOL.r, py, POOL.z + Math.sin(ang) * POOL.r);
    foam.push(0.35);
    if (i > 0) idx.push(p0, p0 + i + 1, p0 + i);
  }
  const river = new THREE.BufferGeometry();
  river.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  river.setAttribute('aFoam', new THREE.Float32BufferAttribute(foam, 1));
  river.setIndex(idx);
  river.computeVertexNormals();
  const n = river.attributes.normal;
  if (n.getY(0) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    river.setIndex(idx);
    river.computeVertexNormals();
  }
  river.computeBoundingSphere();
  // Banks: sand and pebbles on both sides, under the water edge.
  ribbon(k, line.map(([x, z]) => [x, z]), [-3.4, -2.4, -1.2, 1.2, 2.4, 3.4], [0x9f9a7e, 0xc9b994, 0xb0a07c, 0xb0a07c, 0xc9b994, 0x9f9a7e], 0.05, false, (x, z) => 0.92 + 0.12 * Math.sin(x * 2.7) * Math.cos(z * 3.1));

  // ── Waterfall: a sheet that follows the north wall from the rim to the pool ──
  const xs = [FALL_X - 2.2, FALL_X - 1.1, FALL_X, FALL_X + 1.1, FALL_X + 2.2];
  const fpos: number[] = [];
  const ffoam: number[] = [];
  const fidx: number[] = [];
  const top = k.h(FALL_X, -124) - 0.2;
  const rows = 40;
  for (let j = 0; j <= rows; j++) {
    const y = top + ((py - top) * j) / rows;
    for (let i = 0; i < xs.length; i++) {
      const wz = wallZ(k, xs[i], Math.max(y, py + 0.6), -1) ?? POOL.z - 2;
      const out = 0.45 + 0.35 * (j / rows) ** 2;
      const yy = j === rows ? py + 0.05 : y;
      fpos.push(xs[i], yy, j === rows ? POOL.z - 1.0 : wz + out);
      ffoam.push(Math.min(1, 0.25 + Math.abs(i - 2) * 0.25 + (j > rows - 5 ? 0.6 : 0)));
      if (j > 0 && i > 0) {
        const a1 = j * xs.length + i;
        fidx.push(a1 - xs.length - 1, a1 - xs.length, a1 - 1, a1 - xs.length, a1, a1 - 1);
      }
    }
  }
  const waterfall = new THREE.BufferGeometry();
  waterfall.setAttribute('position', new THREE.Float32BufferAttribute(fpos, 3));
  waterfall.setAttribute('aFoam', new THREE.Float32BufferAttribute(ffoam, 1));
  waterfall.setIndex(fidx);
  waterfall.computeVertexNormals();
  waterfall.computeBoundingSphere();

  // Spring at the rim: the falls burst out between boulders.
  pebbles(k, FALL_X, -124.6, 2.2, 14, 7);
  return { waterfall, river, line: line.map(([x, z, hw]) => ({ x, z, hw })) };
}

export function buildCanyon(k: Kit): CanyonResult {
  bridge(k);
  strata(k);
  const w = water(k);
  const b = k.b;
  // ── Landing shore beside the bungee landing: pebble beach, reeds, boulders, flags ──
  const L = ANCHORS.bungeeLanding;
  pebbles(k, L.x - 7.5, L.z - 4.6, 1.6, 12, 11);
  pebbles(k, L.x + 7.5, L.z - 4.4, 1.4, 10, 12);
  pebbles(k, POOL.x + 3.2, POOL.z + 2.8, 1.5, 12, 13);
  for (const [rx, rz, s] of [[-29, -111.2, 1], [-34, -109.6, 2], [-40.5, -110.2, 3], [-49.5, -110.2, 4], [-50.5, -105.6, 5], [-8.5, -110.2, 6], [-3, -110.4, 7]] as const) reeds(k, rx, rz, s);
  for (const [fx, fz, c] of [[L.x - 6.8, L.z + 2.5, 0x7cc243], [L.x + 6.8, L.z + 2.5, 0xf2c14e], [L.x - 6.8, L.z - 2.0, 0xc8433a], [L.x + 6.8, L.z - 2.0, 0x2f5d7c]] as const) markerFlag(k, fx, fz, 2.2, c);
  // Stepping stones across the river below the pool (no gaps a kid can't hop).
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const sx = -52.5 + t * 1.5;
    const sz = -111.2 + t * 5.6;
    const sy = Math.max(k.h(sx, sz), 0) + 0.12;
    b.add('matte', sphereG(1), 0xb5ab9a, T(sx, sy, sz, i, 0.55, 0.22, 0.5));
    k.col.box(T(sx, sy, sz), 0, 0.06, 0, 0.45, 0.16, 0.42);
  }
  // Flags at both bridge approaches on the rim.
  tallPennant(k, BRIDGE.x - 6.5, BRIDGE.z0 + 1.5, 6, 0x7cc243, Math.PI / 2);
  tallPennant(k, BRIDGE.x + 6.5, BRIDGE.z0 + 1.5, 6, 0xf2c14e, Math.PI / 2);
  tallPennant(k, BRIDGE.x - 6.5, BRIDGE.z1 - 2.5, 6, 0xf2c14e, Math.PI / 2);
  tallPennant(k, BRIDGE.x + 6.5, BRIDGE.z1 - 2.5, 6, 0x7cc243, Math.PI / 2);

  const trees: ManualTree[] = [
    { x: L.x - 11, z: L.z + 5.5, kind: 'rock', scale: 1.5 },
    { x: L.x + 12, z: L.z + 5.2, kind: 'rock', scale: 1.3 },
    { x: L.x + 14, z: L.z - 5.6, kind: 'rock', scale: 0.8 },
    { x: POOL.x - 3.4, z: POOL.z - 1.6, kind: 'rock', scale: 1.4 },
    { x: POOL.x + 4.5, z: POOL.z - 1.4, kind: 'rock', scale: 1.2 },
    { x: FALL_X - 3.4, z: -124.8, kind: 'rock', scale: 1.5 },
    { x: FALL_X + 3.3, z: -125.2, kind: 'rock', scale: 1.3 },
    { x: FALL_X + 1.2, z: -127.5, kind: 'rock', scale: 0.9 },
    { x: FALL_X - 5.5, z: -127, kind: 'bush', scale: 1.0 },
    { x: 22, z: -104, kind: 'rock', scale: 1.4 },
    { x: 30, z: -108.4, kind: 'rock', scale: 0.9 },
  ];
  const keepouts: Keepout[] = [
    { x: BRIDGE.x, z: (BRIDGE.z0 + BRIDGE.z1) / 2, hx: 6, hz: (BRIDGE.z0 - BRIDGE.z1) / 2 + 2 },
    { x: L.x, z: CANYON.z, hx: 20, hz: 4 },
    { x: POOL.x, z: POOL.z, r: POOL.r + 0.8, paved: true },
    ...w.line.filter((_, i) => i % 3 === 0).map((p) => ({ x: p.x, z: p.z, r: p.hw + 1.2, paved: true })),
    { x: FALL_X, z: -125, hx: 4, hz: 2.5 },
  ];
  return { trees, keepouts, waterfall: w.waterfall, river: w.river, riverLine: w.line };
}
