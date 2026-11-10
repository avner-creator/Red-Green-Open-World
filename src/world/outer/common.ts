/**
 * Small shared helpers for the outer areas (ranch, canyon, Silly Zone surroundings, lake and
 * beach, lighthouse): ground paint that hugs the terrain, ribbons along a path, marker flags.
 * Everything goes through the shared batcher (merged by material per chunk).
 */
import * as THREE from 'three';
import { M, T, type Batcher } from '../batch';
import type { MatKey } from '../materials';
import { C, type Kit } from '../props';
import { boxG, coneG, cylG, pennantG, sphereG } from '../shapes';

/**
 * A rectangle of ground paint (local X/Z half extents `hx`/`hz`, rotated by `yaw`) in `cell`-sized
 * quads that follow the terrain. Coloured per vertex by `paint(localX, localZ)`; road material.
 */
export function groundRect(
  k: Kit, cx: number, cz: number, hx: number, hz: number, yaw: number, cell: number, lift: number,
  paint: (lx: number, lz: number) => number,
): void {
  const nx = Math.max(1, Math.round((hx * 2) / cell));
  const nz = Math.max(1, Math.round((hz * 2) / cell));
  const cs = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const lx = -hx + (i * 2 * hx) / nx;
      const lz = -hz + (j * 2 * hz) / nz;
      // Same convention as T(yaw): local +X → (cos, −sin), local +Z → (sin, cos).
      const x = cx + lx * cs + lz * sn;
      const z = cz - lx * sn + lz * cs;
      pos.push(x, k.h(x, z) + lift, z);
      c.set(paint(lx, lz));
      col.push(c.r, c.g, c.b);
      if (i > 0 && j > 0) {
        const a1 = j * (nx + 1) + i;
        const a0 = a1 - 1;
        const b1 = a1 - (nx + 1);
        const b0 = b1 - 1;
        idx.push(b0, a0, b1, b1, a0, a1);
      }
    }
  }
  addGround(k, pos, col, idx);
}

/**
 * A ribbon along a polyline (optionally closed) that hugs the terrain. `profile` gives offsets across
 * the ribbon (metres from the centreline, left → right) and `colors` one colour per offset.
 * `tint(x, z, i)` may darken/lighten per vertex (e.g. hoof tracks); return 1 for no change.
 */
export function ribbon(
  k: Kit, pts: readonly [number, number][], profile: readonly number[], colors: readonly number[], lift: number,
  closed = false, tint?: (x: number, z: number, i: number) => number, fixedY?: (x: number, z: number) => number,
): void {
  const src = closed ? [...pts, pts[0]] : pts;
  const m = profile.length;
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i < src.length; i++) {
    const a = src[closed && i === 0 ? src.length - 2 : Math.max(0, i - 1)];
    const b = src[closed && i === src.length - 1 ? 1 : Math.min(src.length - 1, i + 1)];
    const tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / tl;
    const nz = (b[0] - a[0]) / tl;
    for (let q = 0; q < m; q++) {
      const x = src[i][0] + nx * profile[q];
      const z = src[i][1] + nz * profile[q];
      pos.push(x, (fixedY ? fixedY(x, z) : k.h(x, z)) + lift, z);
      c.set(colors[q]);
      const f = tint ? tint(x, z, q) : 1;
      col.push(c.r * f, c.g * f, c.b * f);
      if (i > 0 && q > 0) {
        const a1 = i * m + q;
        const a0 = a1 - 1;
        const b1 = a1 - m;
        const b0 = b1 - 1;
        idx.push(b0, a0, b1, b1, a0, a1);
      }
    }
  }
  addGround(k, pos, col, idx);
}

/** Merge a terrain-hugging grid into the road material, faces up. */
function addGround(k: Kit, pos: number[], col: number[], idx: number[]): void {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  let up = 0;
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i += Math.max(1, Math.floor(n.count / 16))) up += n.getY(i);
  if (up < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  k.b.add('road', g, 0xffffff);
  g.dispose();
}

/** Points along a rounded rectangle (centre, half extents, corner radius), clockwise from +X. */
export function roundedRect(cx: number, cz: number, hx: number, hz: number, r: number, yaw = 0, perCorner = 6): [number, number][] {
  const out: [number, number][] = [];
  const cs = Math.cos(yaw);
  const sn = Math.sin(yaw);
  const corners: [number, number, number][] = [
    [hx - r, hz - r, 0],
    [-(hx - r), hz - r, Math.PI / 2],
    [-(hx - r), -(hz - r), Math.PI],
    [hx - r, -(hz - r), (Math.PI * 3) / 2],
  ];
  for (const [ox, oz, a0] of corners) {
    for (let i = 0; i <= perCorner; i++) {
      const a = a0 + (i / perCorner) * (Math.PI / 2);
      const lx = ox + Math.cos(a) * r;
      const lz = oz + Math.sin(a) * r;
      out.push([cx + lx * cs + lz * sn, cz - lx * sn + lz * cs]);
    }
  }
  return out;
}

/** A thin marker stick with a pennant (no collider: you can ride through it). */
export function markerFlag(k: Kit, x: number, z: number, h: number, color: number, yaw = 0, y?: number): void {
  const yy = y ?? k.h(x, z);
  k.b.add('paint', cylG(6), C.white, T(x, yy, z, 0, 0.04, h, 0.04));
  k.b.add('cloth', pennantG(), color, T(x, yy + h - 0.05, z, yaw, 0.55, 0.7, 1));
}

/** A tall flag pole with a ball finial and a pennant; collider. */
export function tallPennant(k: Kit, x: number, z: number, h: number, color: number, yaw = 0): void {
  const y = k.h(x, z);
  k.b.add('metal', cylG(8), 0xe8e6e0, T(x, y, z, 0, 0.06, h, 0.06));
  k.b.add('matte', cylG(8), C.stoneDark, T(x, y, z, 0, 0.2, 0.22, 0.2));
  k.b.add('gloss', sphereG(1), 0xf0c050, T(x, y + h + 0.06, z, 0, 0.1, 0.1, 0.1));
  k.b.add('cloth', pennantG(), color, T(x, y + h - 0.15, z, yaw, 0.9, 1.3, 1));
  k.col.cyl(x, y, z, h / 2, 0.1);
}

/** A clump of reeds/bulrushes (thin cones with a dark seed head on a few), no collider. */
export function reeds(k: Kit, x: number, z: number, seed: number, y?: number): void {
  const yy = y ?? k.h(x, z);
  const n = 6 + (seed % 3);
  for (let i = 0; i < n; i++) {
    const a = seed * 1.7 + i * 2.39;
    const r = 0.15 + ((i * 37 + seed * 11) % 7) * 0.06;
    const h = 1.0 + ((i * 13 + seed * 5) % 6) * 0.14;
    const px = x + Math.cos(a) * r;
    const pz = z + Math.sin(a) * r;
    const lean = ((i % 3) - 1) * 0.12;
    const m = T(px, yy - 0.05, pz, a, 1, 1, 1, lean, lean * 0.6);
    k.b.add('paint', coneG(4), i % 2 ? 0x6f8f3a : 0x5a7a2e, M(m, T(0, 0, 0, 0, 0.04, h, 0.04)));
    if (i % 3 === 0) k.b.add('paint', cylG(6), 0x4a3020, M(m, T(0, h * 0.62, 0, 0, 0.06, 0.28, 0.06)));
  }
}

/** Pebble/boulder pile in the batch (small, no shadow), for shores and stream banks. */
export function pebbles(k: Kit, x: number, z: number, r: number, n: number, seed: number, y?: number, color = 0x9a9284): void {
  for (let i = 0; i < n; i++) {
    const a = seed * 2.1 + i * 2.39996;
    const d = r * Math.sqrt((i + 0.5) / n);
    const px = x + Math.cos(a) * d;
    const pz = z + Math.sin(a) * d;
    const s = 0.12 + ((i * 29 + seed * 7) % 9) * 0.035;
    const py = (y ?? k.h(px, pz)) + s * 0.25;
    const tone = [color, 0xb5ab9a, 0x7d776c, 0xcfc5b2][(i + seed) % 4];
    k.b.add('matte', sphereG(0), tone, T(px, py, pz, a, s * 1.3, s * 0.7, s));
  }
}

const _up = new THREE.Vector3(0, 1, 0);
/** A square beam from p to q (thickness `t`). */
export function beam(b: Batcher, key: MatKey, p: readonly number[], q: readonly number[], t: number, color: number): void {
  const d = new THREE.Vector3(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
  const l = d.length();
  const quat = new THREE.Quaternion().setFromUnitVectors(_up, d.normalize());
  b.add(key, boxG(), color, new THREE.Matrix4().compose(new THREE.Vector3(p[0], p[1], p[2]), quat, new THREE.Vector3(t, l, t)));
}
