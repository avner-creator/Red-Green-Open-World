/**
 * Big both-eye landmarks for the new island zones (each visible from far away), zone gateway arches
 * and festoon lights. Static parts go into the shared batcher; anything that turns (big wheel,
 * carousel, windmill sails, kites) is built on the 'toy' material and spins in the vertex shader, so
 * it costs no extra draw call. Solid parts get colliders. Pure: no WebGL.
 */
import * as THREE from 'three';
import { M, T } from '../batch';
import { C, bunting, type Kit } from '../props';
import { blobG, boxG, coneG, cylG, flagG, prismG, rbox, sphereG, torusG } from '../shapes';
import { TOY } from '../materials';
import type { Decals } from '../decals';
import type { IconId } from '../pictograms';
import { toyPart } from './toys';

const CREAM = 0xf4efe6;
const INK = 0x1f2228;
const WOOD = 0x9b6b43;
const WOOD_DARK = 0x6a4630;

/**
 * Cylinder / cone (radius 1, height 1, base at y = 0) whose faces alternate between `colors` around
 * the axis (vertex colours: stripes cost nothing extra). `top` = top radius (0 = cone).
 */
const striped = new Map<string, THREE.BufferGeometry>();
function stripedG(seg: number, top: number, colors: readonly number[], open = true): THREE.BufferGeometry {
  const key = `${seg},${top},${colors.join(',')},${open}`;
  let g = striped.get(key);
  if (g) return g;
  g = new THREE.CylinderGeometry(top, 1, 1, seg, 1, open).translate(0, 0.5, 0).toNonIndexed();
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const cs = colors.map((c) => new THREE.Color(c));
  for (let i = 0; i < pos.count; i += 3) {
    const cx = pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2);
    const cz = pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2);
    const a = Math.atan2(cz, cx) + Math.PI;
    const c = cs[Math.floor((a / (Math.PI * 2)) * seg) % cs.length];
    for (let j = 0; j < 3; j++) col.set([c.r, c.g, c.b], (i + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  striped.set(key, g);
  return g;
}

const right = (yaw: number): [number, number] => [Math.cos(yaw), -Math.sin(yaw)];
const fwd = (yaw: number): [number, number] => [Math.sin(yaw), Math.cos(yaw)];

/** Local (lx right, lz forward) → world xz for a frame at (x, z) facing yaw. */
function at(x: number, z: number, yaw: number, lx: number, lz: number): [number, number] {
  const [rx, rz] = right(yaw);
  const [fx, fz] = fwd(yaw);
  return [x + rx * lx + fx * lz, z + rz * lx + fz * lz];
}

// ───────────────────────────── Fun Fair ─────────────────────────────

/** Big wheel: A-frame legs, a spinning double rim with spokes and round pods, a boarding deck. */
export function bigWheel(k: Kit, d: Decals, x: number, z: number, yaw: number): void {
  const y = k.h(x, z);
  const R = 13;
  const hub = y + R + 2.6;
  const ax: [number, number, number] = [Math.sin(yaw), 0, Math.cos(yaw)];
  const [rx, rz] = right(yaw);
  const pivot: [number, number, number] = [x, hub, z];
  const S = TOY.spin;
  const w = 0.12;
  // Legs: two A-frames, one each side of the wheel along the axis.
  for (const s of [-1, 1]) {
    const ox = ax[0] * s * 1.6;
    const oz = ax[2] * s * 1.6;
    for (const t of [-1, 1]) {
      const fx = x + ox + rx * t * 6.2;
      const fz = z + oz + rz * t * 6.2;
      const fy = k.h(fx, fz);
      const len = Math.hypot(6.2, hub - fy);
      const lean = Math.atan2(6.2, hub - fy) * -t;
      k.b.add('paint', cylG(8), 0xe8e2d4, M(T(fx, fy, fz, yaw), T(0, 0, 0, 0, 0.32, len, 0.32, 0, lean)), { aoY: fy, aoH: 0.8, ao: 0.3 });
      k.col.box(T(fx, fy, fz, yaw), 0, 1.2, 0, 0.45, 1.2, 0.45);
    }
    k.b.add('metal', cylG(12), 0x2a3a6a, T(x + ox, hub - 0.5, z + oz, 0, 0.55, 1, 0.55));
  }
  k.b.add('metal', cylG(12), 0x2a3a6a, M(T(x, hub, z, yaw, 1, 1, 1, Math.PI / 2), T(0, -1.8, 0, 0, 0.35, 3.6, 0.35)));
  // Boarding deck with steps.
  const [dx, dz] = at(x, z, yaw, 0, 2.4);
  k.b.add('paint', rbox(5, 0.5, 3, 0.06), 0xc8433a, T(dx, k.h(dx, dz) - 0.1, dz, yaw), { aoY: y, aoH: 0.3 });
  k.b.add('paint', rbox(5.2, 0.08, 3.2, 0.03), CREAM, T(dx, k.h(dx, dz) + 0.4, dz, yaw));
  k.col.box(T(dx, k.h(dx, dz), dz, yaw), 0, 0.2, 0, 2.5, 0.25, 1.5);
  // The wheel: two rims, spokes, a hub star and pods (spheres: they look right at any angle).
  for (const s of [-0.7, 0.7]) {
    toyPart(k, torusG(0.3, 56, Math.PI * 2, R), 0xf4efe6, T(x + ax[0] * s, hub, z + ax[2] * s, yaw, 1, 1, 1, Math.PI / 2), pivot, S, ax, w);
    toyPart(k, torusG(0.2, 40, Math.PI * 2, R * 0.55), 0xe2483c, T(x + ax[0] * s, hub, z + ax[2] * s, yaw, 1, 1, 1, Math.PI / 2), pivot, S, ax, w);
  }
  const pods = [0xe2483c, 0xf2c14e, 0x3a72d8, 0xf08a24, 0xd8409a, 0x4caf50];
  for (let i = 0; i < 12; i++) {
    const th = (i / 12) * Math.PI * 2;
    for (const s of [-0.7, 0.7]) {
      toyPart(k, boxG(), i % 2 ? 0xe2483c : 0xe8e2d4, T(x + ax[0] * s, hub, z + ax[2] * s, yaw, 0.22, R, 0.22, 0, th - Math.PI / 2), pivot, S, ax, w);
    }
    const px = x + rx * Math.cos(th) * R;
    const pz = z + rz * Math.cos(th) * R;
    const py = hub + Math.sin(th) * R;
    toyPart(k, sphereG(1), pods[i % pods.length], T(px, py - 1.2, pz, 0, 1.25, 1.1, 1.25), pivot, S, ax, w);
    toyPart(k, cylG(10), CREAM, T(px, py - 0.5, pz, 0, 1.28, 0.14, 1.28), pivot, S, ax, w);
    toyPart(k, sphereG(1), 0xfff2b0, T(px, py, pz, 0, 0.22, 0.22, 0.22), pivot, S, ax, w);
  }
  for (const s of [-1, 1]) toyPart(k, cylG(16), 0xf2c14e, T(x + ax[0] * s * 0.9, hub, z + ax[2] * s * 0.9, yaw, 1.2, 0.2, 1.2, Math.PI / 2), pivot, S, ax, w);
  // A big round sign on the deck rail with the wheel icon (both faces).
  const [sx, sz] = at(x, z, yaw, -3.6, 4.2);
  const sy = k.h(sx, sz);
  k.b.add('paint', cylG(8), INK, T(sx, sy, sz, 0, 0.09, 2.6, 0.09));
  k.b.add('paint', cylG(24), CREAM, T(sx, sy + 3.0, sz, yaw, 0.7, 0.12, 0.7, Math.PI / 2));
  d.add('iWheel', T(sx + ax[0] * 0.07, sy + 3.0, sz + ax[2] * 0.07, yaw), 1.25, 1.25, true, 0.14);
  k.col.cyl(sx, sy, sz, 1.3, 0.12);
}

/** Carousel: round deck, striped spinning canopy, horses on poles going round. */
export function carousel(k: Kit, x: number, z: number): void {
  const y = k.h(x, z);
  const pivot: [number, number, number] = [x, y, z];
  const S = TOY.spin;
  const ax: [number, number, number] = [0, 1, 0];
  const w = 0.45;
  k.b.add('paint', cylG(32), 0x2a3a6a, T(x, y - 0.1, z, 0, 4.6, 0.5, 4.6), { aoY: y, aoH: 0.3 });
  k.b.add('paint', cylG(32), CREAM, T(x, y + 0.4, z, 0, 4.4, 0.08, 4.4));
  k.col.cyl(x, y - 0.1, z, 0.27, 4.6);
  toyPart(k, cylG(12), 0xf2c14e, T(x, y + 0.45, z, 0, 0.45, 3.4, 0.45), pivot, S, ax, w);
  toyPart(k, stripedG(16, 0, [0xe2483c, CREAM], false), CREAM, T(x, y + 3.95, z, 0, 4.8, 1.6, 4.8), pivot, S, ax, w);
  toyPart(k, stripedG(32, 1, [0xe2483c, 0xf2c14e]), CREAM, T(x, y + 3.55, z, 0, 4.55, 0.4, 4.55), pivot, S, ax, w);
  toyPart(k, sphereG(1), 0xf2c14e, T(x, y + 5.6, z, 0, 0.35, 0.35, 0.35), pivot, S, ax, w);
  const horses = [CREAM, 0x3a72d8, 0xf08a24, CREAM, 0xd8409a, 0x4caf50];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const hx = x + Math.cos(a) * 3.1;
    const hz = z + Math.sin(a) * 3.1;
    const yaw = -a;
    toyPart(k, cylG(8), 0xf2c14e, T(hx, y + 0.45, hz, 0, 0.05, 3.1, 0.05), pivot, S, ax, w);
    toyPart(k, blobG(40 + i, 1, 0.1), horses[i], T(hx, y + 1.45, hz, yaw, 0.32, 0.36, 0.72), pivot, S, ax, w);
    const [nx, nz] = [hx - Math.sin(a) * 0.6, hz + Math.cos(a) * 0.6];
    toyPart(k, blobG(50 + i, 1, 0.1), horses[i], T(nx, y + 1.95, nz, yaw, 0.2, 0.36, 0.24, -0.5), pivot, S, ax, w);
    toyPart(k, sphereG(1), INK, T(nx, y + 2.3, nz, yaw, 0.08, 0.2, 0.25), pivot, S, ax, w);
  }
}

/** Striped fair tent with a pennant on top. */
export function tent(k: Kit, x: number, z: number, r: number, stripe: number): void {
  const y = k.h(x, z);
  k.b.add('paint', stripedG(16, 1, [stripe, CREAM]), CREAM, T(x, y - 0.1, z, 0, r, 2.3, r), { aoY: y, aoH: 0.6, ao: 0.3 });
  k.b.add('paint', stripedG(16, 0, [stripe, CREAM], false), CREAM, T(x, y + 2.2, z, 0, r * 1.08, r * 0.9, r * 1.08));
  k.b.add('metal', cylG(6), INK, T(x, y + 2.2 + r * 0.9, z, 0, 0.04, 1.1, 0.04));
  k.b.add('cloth', flagG(), stripe, T(x + 0.05, y + 2.2 + r * 0.9 + 1.0, z, 0, 0.9, 0.55, 1));
  k.col.cyl(x, y, z, 1.6, r * 0.95);
}

// ───────────────────────────── Windmill Farm ─────────────────────────────

export function windmill(k: Kit, d: Decals, x: number, z: number, yaw: number): void {
  const y = k.h(x, z);
  const ax: [number, number, number] = [Math.sin(yaw), 0, Math.cos(yaw)];
  k.b.add('matte', cylG(10, 0.62), CREAM, T(x, y - 0.2, z, 0, 3.2, 11, 3.2), { aoY: y, aoH: 1.2, ao: 0.35 });
  for (const hy of [3.6, 7.2]) k.b.add('paint', cylG(10, 0.95, true), 0xc8433a, T(x, y + hy, z, 0, 3.2 - hy * 0.11, 0.35, 3.2 - hy * 0.11));
  k.b.add('paint', coneG(10), 0xa4372a, T(x, y + 10.7, z, 0, 2.3, 3.0, 2.3));
  // Door and two round windows facing the sails.
  const [dx, dz] = at(x, z, yaw, 0, 3.15);
  k.b.add('paint', rbox(1.3, 2.2, 0.2, 0.05), WOOD_DARK, T(dx, y, dz, yaw));
  for (const wy of [5.0, 8.2]) {
    const [wx, wz] = at(x, z, yaw, 0, 3.2 - wy * 0.11 - 0.02);
    k.b.add('window', cylG(14), 0x60, T(wx, y + wy, wz, yaw, 0.45, 0.12, 0.45, Math.PI / 2));
  }
  k.col.cyl(x, y, z, 5, 3.0);
  // Sails: four lattice blades turning in the wind.
  const hx = x + ax[0] * 2.4;
  const hz = z + ax[2] * 2.4;
  const hy = y + 10.2;
  const pivot: [number, number, number] = [hx, hy, hz];
  toyPart(k, cylG(10), WOOD_DARK, T(x + ax[0] * 1.6, hy, z + ax[2] * 1.6, yaw, 0.35, 1.2, 0.35, Math.PI / 2), pivot, TOY.spin, ax, 0.55);
  for (let i = 0; i < 4; i++) {
    const roll = (i * Math.PI) / 2;
    const m = T(hx, hy, hz, yaw, 1, 1, 1, 0, roll);
    toyPart(k, boxG(), WOOD_DARK, M(m, T(0, 0, 0.1, 0, 0.22, 8, 0.15)), pivot, TOY.spin, ax, 0.55);
    toyPart(k, boxG(), i % 2 ? CREAM : 0xf2e2b8, M(m, T(0.62, 1.4, 0.05, 0, 1.0, 6.4, 0.06)), pivot, TOY.spin, ax, 0.55);
    for (let j = 0; j < 5; j++) toyPart(k, boxG(), WOOD, M(m, T(0.62, 1.6 + j * 1.45, 0.12, 0, 1.15, 0.08, 0.06)), pivot, TOY.spin, ax, 0.55);
  }
  toyPart(k, sphereG(1), 0xf2c14e, T(hx + ax[0] * 0.25, hy, hz + ax[2] * 0.25, 0, 0.4, 0.4, 0.4), pivot, TOY.spin, ax, 0.55);
  // Icon roundel above the door.
  const [ix, iz] = at(x, z, yaw, 0, 3.0);
  d.add('iWindmill', T(ix, y + 3.0, iz, yaw), 1.2, 1.2);
}

export function barn(k: Kit, x: number, z: number, yaw: number): void {
  const y = k.h(x, z);
  const m = T(x, y, z, yaw);
  const W = 8;
  const D = 6;
  k.b.add('paint', rbox(W, 4.2, D, 0.08), 0xb83a2c, M(m, T(0, -0.2, 0)), { aoY: y, aoH: 0.8, ao: 0.35 });
  k.b.add('paint', prismG(), 0x5a2a22, M(m, T(0, 4.0, 0, Math.PI / 2, D + 0.6, 2.6, W + 0.5)));
  // Big white-framed doors with an X.
  for (const s of [-1, 1]) {
    k.b.add('paint', rbox(1.6, 3.0, 0.1, 0.03), 0xa83224, M(m, T(s * 0.82, 0, D / 2 + 0.03)));
    k.b.add('paint', boxG(), CREAM, M(m, T(s * 0.82, 1.5, D / 2 + 0.1, 0, 0.12, 3.3, 0.06, 0, s * 0.5)));
    k.b.add('paint', boxG(), CREAM, M(m, T(s * 0.82, 1.5, D / 2 + 0.1, 0, 0.12, 3.3, 0.06, 0, -s * 0.5)));
  }
  k.b.add('paint', boxG(), CREAM, M(m, T(0, 3.0, D / 2 + 0.08, 0, 3.6, 0.14, 0.08)));
  k.b.add('window', rbox(1.2, 1.0, 0.1, 0.03), 0x50, M(m, T(0, 4.6, D / 2 + 0.08)));
  k.col.box(m, 0, 2.2, 0, W / 2, 2.4, D / 2);
}

export function pumpkin(k: Kit, x: number, z: number, s: number, seed: number): void {
  const y = k.h(x, z);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + seed;
    k.b.add('paint', sphereG(1), i % 2 ? 0xf07a1c : 0xe86a14, T(x + Math.cos(a) * 0.16 * s, y + 0.34 * s, z + Math.sin(a) * 0.16 * s, a, 0.34 * s, 0.32 * s, 0.22 * s), { aoY: y, aoH: 0.3, ao: 0.3 });
  }
  k.b.add('paint', cylG(6), 0x3b6a2a, T(x, y + 0.6 * s, z, 0, 0.05 * s, 0.18 * s, 0.05 * s));
  if (s > 0.9) k.col.sphere(x, y + 0.3 * s, z, 0.38 * s);
}

/** Friendly scarecrow: big smile, straw hat, waving arms (static). */
export function scarecrow(k: Kit, x: number, z: number, yaw: number): void {
  const y = k.h(x, z);
  const m = T(x, y, z, yaw);
  k.b.add('paint', cylG(8), WOOD_DARK, M(m, T(0, 0, 0, 0, 0.08, 2.4, 0.08)));
  k.b.add('paint', boxG(), WOOD_DARK, M(m, T(0, 1.75, 0, 0, 2.2, 0.08, 0.08)));
  k.b.add('paint', rbox(0.9, 0.9, 0.45, 0.08), 0x3a72d8, M(m, T(0, 1.1, 0)));
  k.b.add('paint', rbox(1.0, 0.12, 0.5, 0.03), 0xc8433a, M(m, T(0, 1.55, 0)));
  k.b.add('matte', sphereG(2), 0xe8d6a8, M(m, T(0, 2.35, 0, 0, 0.36, 0.36, 0.33)));
  k.b.add('matte', cylG(16), 0xe0c070, M(m, T(0, 2.62, 0, 0, 0.62, 0.05, 0.62)));
  k.b.add('matte', cylG(12, 0.7), 0xe0c070, M(m, T(0, 2.64, 0, 0, 0.32, 0.32, 0.32)));
  for (const s of [-1, 1]) {
    k.b.add('paint', sphereG(0), INK, M(m, T(s * 0.13, 2.42, 0.31, 0, 0.05, 0.06, 0.03)));
    k.b.add('matte', coneG(5), 0xe0c070, M(m, T(s * 1.12, 1.75, 0, 0, 0.12, 0.35, 0.12, 0, (s * Math.PI) / 2)));
  }
  k.b.add('paint', torusG(0.025, 10, Math.PI, 0.14), INK, M(m, T(0, 2.3, 0.31, 0, 1, 1, 1, Math.PI / 2, Math.PI)));
  k.col.cyl(x, y, z, 1.2, 0.35);
}

// ───────────────────────────── Sandcastle Cove ─────────────────────────────

const SAND = 0xe8cf94;
const SAND_DARK = 0xc9ad74;

function castleTower(k: Kit, x: number, z: number, r: number, h: number, flag: number): void {
  const y = k.h(x, z);
  k.b.add('matte', cylG(14), SAND, T(x, y - 0.3, z, 0, r, h + 0.3, r), { aoY: y, aoH: 0.8, ao: 0.4 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    k.b.add('matte', boxG(), SAND_DARK, T(x + Math.cos(a) * r * 0.85, y + h, z + Math.sin(a) * r * 0.85, -a, 0.42, 0.45, 0.42));
  }
  k.b.add('paint', coneG(12), flag === 0xe2483c ? 0x3a72d8 : 0xe2483c, T(x, y + h, z, 0, r * 0.75, r * 1.3, r * 0.75));
  k.b.add('metal', cylG(6), INK, T(x, y + h + r * 1.2, z, 0, 0.04, 1.2, 0.04));
  k.b.add('cloth', flagG(), flag, T(x + 0.04, y + h + r * 1.2 + 1.1, z, 0.3, 0.9, 0.55, 1));
  k.col.cyl(x, y, z, h / 2, r);
}

export function sandcastle(k: Kit, d: Decals, x: number, z: number, yaw: number): void {
  const y = k.h(x, z);
  castleTower(k, x, z, 2.2, 6.5, 0xf2c14e);
  const corners: [number, number][] = [[-4.5, -4.5], [4.5, -4.5], [-4.5, 4.5], [4.5, 4.5]];
  corners.forEach(([lx, lz], i) => {
    const [cx, cz] = at(x, z, yaw, lx, lz);
    castleTower(k, cx, cz, 1.1, 3.6, i % 2 ? 0xe2483c : 0x3a72d8);
  });
  for (let i = 0; i < 4; i++) {
    const [ax0, az0] = corners[i];
    const [ax1, az1] = corners[[1, 3, 0, 2][i]];
    const [p0x, p0z] = at(x, z, yaw, ax0, az0);
    const [p1x, p1z] = at(x, z, yaw, ax1, az1);
    const mx = (p0x + p1x) / 2;
    const mz = (p0z + p1z) / 2;
    const len = Math.hypot(p1x - p0x, p1z - p0z) - 2;
    const wy = Math.atan2(p1x - p0x, p1z - p0z);
    const my = k.h(mx, mz);
    // The front wall (+Z side) has a gate gap in the middle.
    const front = i === 3;
    const segs = front ? [-1, 1] : [0];
    for (const s of segs) {
      const sl = front ? len / 2 - 1.2 : len;
      const off = front ? s * (len / 4 + 0.6) : 0;
      const cx = mx + Math.sin(wy) * off;
      const cz = mz + Math.cos(wy) * off;
      k.b.add('matte', rbox(0.9, 2.2, sl, 0.1), SAND, T(cx, my - 0.3, cz, wy), { aoY: my, aoH: 0.6, ao: 0.4 });
      const n = Math.max(1, Math.round(sl / 0.9));
      for (let j = 0; j < n; j += 2) {
        const t = (j + 0.5) / n - 0.5;
        k.b.add('matte', boxG(), SAND_DARK, T(cx + Math.sin(wy) * t * sl, my + 1.9, cz + Math.cos(wy) * t * sl, wy, 0.95, 0.4, 0.45));
      }
      k.col.box(T(cx, my, cz, wy), 0, 1.0, 0, 0.45, 1.1, sl / 2);
    }
  }
  // Dark gate arch and a shell/starfish trim.
  const [gx, gz] = at(x, z, yaw, 0, 4.6);
  k.b.add('paint', torusG(0.25, 16, Math.PI, 1.0), SAND_DARK, T(gx, k.h(gx, gz) + 1.2, gz, yaw, 1, 1, 1, Math.PI / 2));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    k.b.add('paint', coneG(3), 0xf08a24, T(gx + 1.6, k.h(gx, gz) + 2.2, gz, yaw, 0.1, 0.35, 0.05, 0, a));
  }
  d.add('iCastle', T(x + Math.sin(yaw) * 2.25, y + 4.2, z + Math.cos(yaw) * 2.25, yaw), 1.6, 1.6);
}

export function beachHut(k: Kit, x: number, z: number, yaw: number, color: number): void {
  const y = k.h(x, z);
  const m = T(x, y, z, yaw);
  for (let i = 0; i < 6; i++) k.b.add('paint', rbox(0.4, 2.4, 2.6, 0.03), i % 2 ? CREAM : color, M(m, T(-1.0 + i * 0.4, 0, 0)), { aoY: y, aoH: 0.5, ao: 0.3 });
  k.b.add('paint', prismG(), 0xf4efe6, M(m, T(0, 2.4, 0, Math.PI / 2, 3.0, 1.1, 2.8)));
  k.b.add('paint', rbox(0.9, 1.8, 0.08, 0.03), INK, M(m, T(0, 0.05, 1.31)));
  k.col.box(m, 0, 1.3, 0, 1.25, 1.3, 1.35);
}

export function umbrella(k: Kit, x: number, z: number, color: number): void {
  const y = k.h(x, z);
  k.b.add('metal', cylG(6), CREAM, T(x, y, z, 0, 0.05, 2.5, 0.05));
  for (let i = 0; i < 8; i++) k.b.add('paint', coneG(3), i % 2 ? color : CREAM, M(T(x, y + 2.15, z, (i * Math.PI) / 4), T(0, 0, 0, 0, 1.45, 0.55, 1.45)));
  k.b.add('paint', rbox(1.6, 0.06, 0.8, 0.02), color, T(x + 0.6, y + 0.02, z + 1.1, 0.3));
  k.col.cyl(x, y, z, 1.2, 0.12);
}

// ───────────────────────────── Star Lookout ─────────────────────────────

export function lookout(k: Kit, d: Decals, x: number, z: number, yaw: number): void {
  const y = k.h(x, z);
  const H = 8;
  for (const [lx, lz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]] as [number, number][]) {
    const [px, pz] = at(x, z, yaw, lx, lz);
    const py = k.h(px, pz);
    k.b.add('paint', rbox(0.3, y + H - py + 1.1, 0.3, 0.04), WOOD, T(px, py - 0.1, pz, yaw), { aoY: py, aoH: 0.6, ao: 0.3 });
    k.col.box(T(px, py, pz, yaw), 0, 1.3, 0, 0.2, 1.3, 0.2);
  }
  for (const hy of [2.6, 5.2]) {
    for (const s of [-1, 1]) {
      const [bx, bz] = at(x, z, yaw, s * 1.6, 0);
      k.b.add('paint', boxG(), WOOD_DARK, T(bx, y + hy, bz, yaw, 0.12, 0.12, 3.2, 0, s * 0.0));
      const [cx, cz] = at(x, z, yaw, 0, s * 1.6);
      k.b.add('paint', boxG(), WOOD_DARK, T(cx, y + hy, cz, yaw + Math.PI / 2, 0.12, 0.12, 3.2));
    }
  }
  k.b.add('paint', rbox(4.2, 0.3, 4.2, 0.05), WOOD, T(x, y + H, z, yaw));
  for (let i = 0; i < 4; i++) {
    const a = yaw + (i * Math.PI) / 2;
    const [rx, rz] = [x + Math.sin(a) * 2.0, z + Math.cos(a) * 2.0];
    k.b.add('paint', boxG(), CREAM, T(rx, y + H + 0.9, rz, a + Math.PI / 2, 0.1, 0.1, 4.1));
  }
  k.b.add('paint', coneG(4), 0x3a72d8, T(x, y + H + 1.9, z, yaw + Math.PI / 4, 3.3, 1.6, 3.3));
  for (const [lx, lz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]] as [number, number][]) {
    const [px, pz] = at(x, z, yaw, lx, lz);
    k.b.add('paint', cylG(6), CREAM, T(px, y + H, pz, 0, 0.07, 1.95, 0.07));
  }
  // The gold star on a pole: the landmark seen from the bridge and the plaza.
  k.b.add('metal', cylG(6), INK, T(x, y + H + 3.4, z, 0, 0.08, 2.4, 0.08));
  for (let i = 0; i < 5; i++) {
    k.b.add('gloss', coneG(3), 0xf2c14e, T(x, y + H + 6.6, z, yaw, 0.5, 1.5, 0.25, 0, (i * Math.PI * 2) / 5));
  }
  k.b.add('gloss', sphereG(1), 0xf2c14e, T(x, y + H + 6.6, z, 0, 0.55, 0.55, 0.35));
  const [ix, iz] = at(x, z, yaw, 0, 1.75);
  d.add('iLookout', T(ix, y + 4.0, iz, yaw), 1.3, 1.3);
}

export function telescope(k: Kit, x: number, z: number, yaw: number): void {
  const y = k.h(x, z);
  k.b.add('metal', cylG(8), INK, T(x, y, z, 0, 0.08, 1.1, 0.08));
  k.b.add('paint', cylG(12, 0.7), 0x3a72d8, T(x, y + 1.15, z, yaw, 0.14, 0.9, 0.14, -1.15));
  k.b.add('gloss', cylG(12), 0xf2c14e, T(x, y + 1.12, z, yaw, 0.17, 0.12, 0.17, -1.15));
  k.col.cyl(x, y, z, 0.7, 0.15);
}

// ───────────────────────────── Rainbow Point ─────────────────────────────

export function rainbow(k: Kit, d: Decals, x: number, z: number, yaw: number): void {
  const y = k.h(x, z);
  const bands = [0xe2483c, 0xf08a24, 0xf2d23c, 0x4caf50, 0x3a72d8, 0x8a4cc8];
  bands.forEach((c, i) => {
    const r = 9.6 - i * 0.62;
    k.b.add('paint', torusG(0.32, 40, Math.PI, r), c, T(x, y - 0.3, z, yaw, 1, 1, 1, Math.PI / 2));
  });
  for (const s of [-1, 1]) {
    const [cx, cz] = at(x, z, yaw, s * 7.9, 0);
    const cy = k.h(cx, cz);
    for (let j = 0; j < 4; j++) {
      const [bx, bz] = at(cx, cz, yaw, (j - 1.5) * 0.9, (j % 2) * 0.6 - 0.3);
      k.b.add('matte', blobG(70 + j + (s > 0 ? 4 : 0), 1, 0.12), 0xf8f6f0, T(bx, cy + 0.6 + (j % 2) * 0.5, bz, j, 1.3, 1.0, 1.1), { aoY: cy, aoH: 0.6, ao: 0.25 });
    }
    k.col.sphere(cx, cy + 0.7, cz, 1.8);
  }
  d.add('iRainbow', T(x, y + 10.4, z, yaw), 1.4, 1.4, true, 0.02);
}

export function wishingWell(k: Kit, x: number, z: number): void {
  const y = k.h(x, z);
  k.b.add('matte', cylG(16), C.stone, T(x, y - 0.1, z, 0, 1.0, 0.9, 1.0), { aoY: y, aoH: 0.4 });
  k.b.add('gloss', cylG(16), 0x3a8ab0, T(x, y + 0.6, z, 0, 0.8, 0.1, 0.8));
  for (const s of [-1, 1]) k.b.add('paint', rbox(0.14, 2.1, 0.14, 0.03), WOOD, T(x + s * 0.85, y, z));
  k.b.add('paint', prismG(), 0xc8433a, T(x, y + 2.0, z, 0, 2.3, 0.7, 1.3));
  k.col.cyl(x, y, z, 0.6, 1.05);
}

// ───────────────────────────── Picnic grove / kites ─────────────────────────────

export function picnicTable(k: Kit, x: number, z: number, yaw: number, cloth: number): void {
  const y = k.h(x, z);
  const m = T(x, y, z, yaw);
  k.b.add('paint', rbox(2.2, 0.08, 0.9, 0.02), WOOD, M(m, T(0, 0.75, 0)));
  k.b.add('cloth', boxG(), cloth, M(m, T(0, 0.83, 0, 0, 1.6, 0.01, 0.92)));
  for (const s of [-1, 1]) {
    k.b.add('paint', rbox(2.2, 0.06, 0.3, 0.02), WOOD, M(m, T(0, 0.42, s * 0.75)));
    k.b.add('paint', boxG(), WOOD_DARK, M(m, T(s * 0.85, 0, 0, 0, 0.1, 0.78, 1.7)));
  }
  k.col.box(m, 0, 0.42, 0, 1.15, 0.42, 0.95);
}

/** Tall pole with a kite on a string that sways in the wind. */
export function kitePole(k: Kit, x: number, z: number, color: number): void {
  const y = k.h(x, z);
  k.b.add('metal', cylG(6), CREAM, T(x, y, z, 0, 0.06, 4.0, 0.06));
  k.col.cyl(x, y, z, 2.0, 0.12);
  const pivot: [number, number, number] = [x, y + 4.0, z];
  const kx = x + 1.2;
  const ky = y + 6.4;
  toyPart(k, boxG(), INK, T((x + kx) / 2, y + 4.0, z, Math.PI / 2, 0.02, 2.65, 0.02, 0, -Math.atan2(1.2, 2.4)), pivot, TOY.sway, [0, 1, 0], 3);
  toyPart(k, sphereG(0), color, T(kx, ky, z, 0, 0.75, 1.0, 0.06), pivot, TOY.sway, [0, 1, 0], 3);
  toyPart(k, sphereG(0), CREAM, T(kx, ky, z + 0.02, 0, 0.35, 0.45, 0.07), pivot, TOY.sway, [0, 1, 0], 3);
  for (let i = 0; i < 3; i++) toyPart(k, coneG(3), i % 2 ? CREAM : color, T(kx, ky - 1.1 - i * 0.4, z, 0, 0.12, 0.3, 0.04, Math.PI), pivot, TOY.sway, [0, 1, 0], 3);
}

// ───────────────────────────── Gateways and lights ─────────────────────────────

/**
 * Zone gateway arch over a road or path: two candy-striped pillars (colliders), a curved top with
 * bulbs, and a big icon roundel in the middle (both faces). `span` is the gap between the pillars.
 */
export function zoneArch(k: Kit, d: Decals, x: number, z: number, yaw: number, span: number, color: number, icon: IconId): void {
  const y = k.h(x, z);
  const half = span / 2;
  const H = 4.6;
  let top = -Infinity;
  for (const s of [-1, 1]) {
    const [px, pz] = at(x, z, yaw + Math.PI / 2, 0, s * half);
    const py = k.h(px, pz);
    top = Math.max(top, py + H);
    k.b.add('matte', rbox(0.9, 0.5, 0.9, 0.06), C.stone, T(px, py - 0.1, pz, yaw), { aoY: py, aoH: 0.3, ao: 0.35 });
    const n = 8;
    for (let i = 0; i < n; i++) k.b.add('paint', cylG(12), i % 2 ? color : CREAM, T(px, py + 0.35 + (i * (H - 0.35)) / n, pz, 0, 0.28, (H - 0.35) / n, 0.28));
    k.b.add('gloss', sphereG(1), 0xf2c14e, T(px, py + H + 0.25, pz, 0, 0.32, 0.32, 0.32));
    k.col.cyl(px, py, pz, H / 2, 0.42);
  }
  const ay = Math.min(top, y + H);
  // Half-ring over the gap (lies in the plane across the road).
  k.b.add('paint', torusG(0.24, 28, Math.PI, half), color, T(x, ay, z, yaw + Math.PI / 2, 1, 1, 1, Math.PI / 2));
  k.b.add('paint', torusG(0.1, 28, Math.PI, half - 0.34), CREAM, T(x, ay, z, yaw + Math.PI / 2, 1, 1, 1, Math.PI / 2));
  for (let i = 1; i < 10; i++) {
    const th = (i / 10) * Math.PI;
    const [bx, bz] = at(x, z, yaw + Math.PI / 2, 0, Math.cos(th) * half);
    k.b.add('glow', sphereG(0), 0xffe2b0, T(bx, ay + Math.sin(th) * half + 0.28, bz, 0, 0.13, 0.13, 0.13));
  }
  // Roundel at the crown.
  const ry = ay + half + 0.9;
  k.b.add('paint', cylG(28), CREAM, T(x, ry, z, yaw, 1.05, 0.22, 1.05, Math.PI / 2));
  k.b.add('paint', torusG(0.08, 28, Math.PI * 2, 1.05), color, T(x, ry, z, yaw, 1, 1, 1, Math.PI / 2));
  d.add(icon, T(x + Math.sin(yaw) * 0.115, ry, z + Math.cos(yaw) * 0.115, yaw), 1.9, 1.9, true, 0.23);
  // Little pennants hanging from the ring.
  const a = new THREE.Vector3(...pt(at(x, z, yaw + Math.PI / 2, 0, -half + 0.3), ay + 0.9));
  const b = new THREE.Vector3(...pt(at(x, z, yaw + Math.PI / 2, 0, half - 0.3), ay + 0.9));
  bunting(k.b, a, b, [color, CREAM, 0xf2c14e, CREAM], 0.2);
}

const pt = ([x, z]: [number, number], y: number): [number, number, number] => [x, y, z];

/**
 * Carnival lantern posts beside a road or trail: a striped post every `step` m with a crown of
 * coloured bulbs and a pennant. No strings between posts: lines across the view squeeze the camera
 * (QA round 4). Each post is checked with `ok(x, z)`.
 */
export function festoon(
  k: Kit,
  pts: readonly { x: number; z: number }[],
  offset: number,
  step: number,
  ok: (x: number, z: number) => boolean,
  colors: readonly number[],
): number {
  let acc = 0;
  let next = step / 2;
  let placed = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const seg = Math.hypot(b.x - a.x, b.z - a.z);
    while (acc + seg >= next) {
      const t = (next - acc) / seg;
      next += step;
      const ux = (b.x - a.x) / seg;
      const uz = (b.z - a.z) / seg;
      const side = placed % 2 ? 1 : -1;
      const x = a.x + (b.x - a.x) * t - uz * offset * side;
      const z = a.z + (b.z - a.z) * t + ux * offset * side;
      if (!ok(x, z)) continue;
      const y = k.h(x, z);
      const c = colors[placed % colors.length];
      for (let j = 0; j < 3; j++) k.b.add('paint', cylG(6, 1, true), j % 2 ? CREAM : 0x2a3a6a, T(x, y + j * 1.1, z, 0, 0.07, 1.1, 0.07));
      k.b.add('metal', cylG(8), INK, T(x, y, z, 0, 0.15, 0.2, 0.15));
      for (let j = 0; j < 4; j++) {
        const ang = (j / 4) * Math.PI * 2 + placed;
        k.b.add('metal', boxG(), INK, T(x + Math.cos(ang) * 0.18, y + 3.25, z + Math.sin(ang) * 0.18, -ang, 0.36, 0.03, 0.03));
        k.b.add('glow', sphereG(0), colors[(placed + j) % colors.length], T(x + Math.cos(ang) * 0.36, y + 3.15, z + Math.sin(ang) * 0.36, 0, 0.12, 0.15, 0.12));
      }
      k.b.add('gloss', sphereG(0), 0xf2c14e, T(x, y + 3.42, z, 0, 0.1, 0.1, 0.1));
      k.b.add('cloth', flagG(), c === 0xffe2b0 ? 0xc8433a : 0x2f5d7c, T(x + 0.04, y + 3.0, z, Math.atan2(ux, uz), 0.6, 0.38, 1));
      k.col.cyl(x, y, z, 1.7, 0.1);
      placed++;
    }
    acc += seg;
  }
  return placed;
}
