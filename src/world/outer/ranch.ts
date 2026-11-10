/**
 * The ranch: a red barn with its sliding doors open (straw, stalls and hay inside), a paddock with a
 * riding track round its edge, striped show-jump fences and a farm gate a horse can jump, pennants
 * on the fence, a silo, a water-pump windmill, troughs, a saddle rack and hay. The horses (another
 * stream) idle in the middle of the paddock, so nothing solid stands inside the anchor's clear
 * radius except the track paint and the old paddock fence.
 */
import * as THREE from 'three';
import { M, T } from '../batch';
import { C, barrel, box, crate, fence, hayBale, icon, lamp, type Kit } from '../props';
import { boxG, coneG, cylG, rbox, sphereG, torusG } from '../shapes';
import { ANCHORS } from '../layout';
import type { Keepout, ManualTree } from '../scatter';
import { groundRect, markerFlag, ribbon, roundedRect, tallPennant } from './common';

export interface RanchResult {
  trees: ManualTree[];
  keepouts: Keepout[];
  /** Windmill hub (world) and the direction its wheel faces (yaw), for the live spinning wheel. */
  windmill: { x: number; y: number; z: number; yaw: number };
}

const RED = 0x9a3e2e;
const WHITE = 0xf2eee6;

/**
 * Paddock fence box (relative to the anchor): ±18 × ±14. The west road runs in diagonally through the
 * north-east corner, so that corner is the open entrance (fence stops 3 m short of it on the north
 * side and starts at z + 3 on the east side); the west side has a jumpable farm gate to the barn.
 */
export const PADDOCK = { hx: 18, hz: 14, northEnd: 3, eastStart: -1, westGate: [-3, 3] as const, beachGap: [-14.8, -10.6] as const };
/** Ranch entrance arch over the west road (centre on the road, yaw along it). */
export const ARCH = { x: -54, z: 32.5, yaw: Math.atan2(-8, 10), half: 4.6 };
/** Riding track centreline (rounded rect inside the fence) and its width. */
export const TRACK = { hx: 15.6, hz: 11.6, r: 2.3, width: 2.6 };
/**
 * Show jumps at the ends of the long straights (local x, z), outside the anchor's clear radius. The
 * beach path leaves through the north-west, so that end of the north straight has no jump.
 */
export const JUMPS: readonly [number, number][] = [[13.3, -11.6], [-13.3, 11.6], [13.3, 11.6]];

function barn(k: Kit): void {
  const a = ANCHORS.ranch;
  const b = k.b;
  const bx = a.x - 27;
  const bz = a.z;
  const by = k.h(bx, bz);
  // Front (+Z local) faces +X (the paddock); width runs along world Z.
  const m = T(bx, by, bz, Math.PI / 2);
  const w = 12;
  const d = 11;
  const wh = 5.2;
  const ow = 3.1; // half width of the open doorway
  const oh = 3.9;
  box(b, 'matte', m, 0, -1.5, 0, w + 0.4, 1.6, d + 0.4, 0xa79e8e);
  // Walls (separate so the doorway is really open).
  const ao = { aoY: by, aoH: 1.4, ao: 0.3 };
  b.add('matte', boxG(), RED, M(m, T(0, 0, -d / 2 + 0.15, 0, w, wh, 0.3)), ao);
  for (const s of [-1, 1]) b.add('matte', boxG(), RED, M(m, T((s * (w - 0.3)) / 2, 0, 0, 0, 0.3, wh, d)), ao);
  for (const s of [-1, 1]) b.add('matte', boxG(), RED, M(m, T(s * (ow + (w / 2 - ow) / 2), 0, d / 2 - 0.15, 0, w / 2 - ow, wh, 0.3)), ao);
  b.add('matte', boxG(), RED, M(m, T(0, oh, d / 2 - 0.15, 0, ow * 2, wh - oh, 0.3)));
  // Board-and-batten lines on the sides and back.
  for (let i = 0; i < 11; i++) {
    const t = -w / 2 + 0.6 + i * ((w - 1.2) / 10);
    box(b, 'paint', m, t, 0.15, -d / 2 - 0.02, 0.08, wh - 0.3, 0.06, 0x7e3326);
  }
  for (const s of [-1, 1]) for (let i = 0; i < 9; i++) box(b, 'paint', m, s * (w / 2 + 0.02), 0.15, -d / 2 + 0.7 + i * ((d - 1.4) / 8), 0.06, wh - 0.3, 0.08, 0x7e3326);
  // Gable (a solid prism above the walls) and the gambrel roof.
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(w / 2 - 2.8, 2.6);
  shape.lineTo(0, 3.9);
  shape.lineTo(-w / 2 + 2.8, 2.6);
  shape.closePath();
  const gable = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
  b.add('matte', gable, RED, M(m, T(0, wh, 0)));
  gable.dispose();
  const roof = (x0: number, y0: number, x1: number, y1: number): void => {
    const l = Math.hypot(x1 - x0, y1 - y0);
    const roll = Math.atan2(y1 - y0, x1 - x0);
    const rm = M(m, T((x0 + x1) / 2, wh + (y0 + y1) / 2, 0, 0, 1, 1, 1, 0, roll));
    b.add('paint', boxG(), 0x4a4e57, M(rm, T(0, 0, 0, 0, l + 0.2, 0.2, d + 0.8)));
    for (let i = 0; i < 9; i++) b.add('paint', boxG(), 0x3c4048, M(rm, T(-l / 2 + (i + 0.5) * (l / 9), 0.15, 0, 0, 0.06, 0.06, d + 0.82)));
    k.col.box(rm, 0, 0.1, 0, l / 2 + 0.1, 0.15, d / 2 + 0.4);
  };
  roof(-w / 2 - 0.4, -0.35, -w / 2 + 2.8, 2.6);
  roof(-w / 2 + 2.8, 2.6, 0, 3.9);
  roof(0, 3.9, w / 2 - 2.8, 2.6);
  roof(w / 2 - 2.8, 2.6, w / 2 + 0.4, -0.35);
  // White trim: corners, doorway frame, eaves line.
  for (const s of [-1, 1]) box(b, 'paint', m, (s * w) / 2, 0, d / 2, 0.3, wh, 0.3, WHITE);
  for (const s of [-1, 1]) box(b, 'paint', m, s * (ow + 0.1), 0, d / 2 + 0.02, 0.2, oh, 0.3, WHITE);
  box(b, 'paint', m, 0, oh - 0.1, d / 2 + 0.02, ow * 2 + 0.4, 0.2, 0.3, WHITE);
  box(b, 'paint', m, 0, wh - 0.15, d / 2 + 0.03, w + 0.3, 0.16, 0.3, WHITE);
  // Sliding doors pushed open to both sides on an iron track (classic barn doors).
  const fm = M(m, T(0, 0, d / 2 + 0.28));
  box(b, 'metal', fm, 0, oh + 0.12, 0, w + 0.2, 0.12, 0.1, C.iron);
  for (const s of [-1, 1]) {
    const dm = M(fm, T(s * (ow + 1.55), 0.05, 0));
    box(b, 'paint', dm, 0, 0, 0, 3.0, 3.8, 0.1, 0x7e3326);
    box(b, 'paint', dm, 0, 0, 0.06, 3.0, 0.16, 0.06, WHITE);
    box(b, 'paint', dm, 0, 3.64, 0.06, 3.0, 0.16, 0.06, WHITE);
    for (const sx of [-1.42, 1.42]) box(b, 'paint', dm, sx, 0, 0.06, 0.16, 3.8, 0.06, WHITE);
    for (const r of [0.9, -0.9]) b.add('paint', boxG(), WHITE, M(dm, T(0, 1.9, 0.07, 0, 0.14, 4.6, 0.05, 0, r)));
    for (const rx of [-1, 1]) b.add('metal', torusG(0.04, 10, Math.PI * 2, 0.13), C.iron, M(dm, T(rx, 3.95, 0.04, 0, 1, 1, 1, Math.PI / 2)));
    k.col.box(dm, 0, 1.9, 0, 1.5, 1.9, 0.08);
  }
  // Loft door with hay poking out, and a pulley beam.
  box(b, 'paint', fm, 0, 5.6, -0.25, 1.9, 1.6, 0.1, 0x30251e);
  box(b, 'paint', fm, 0, 5.5, -0.22, 2.2, 1.8, 0.05, WHITE);
  box(b, 'matte', fm, 0, 5.62, -0.2, 1.7, 0.35, 0.3, 0xe0c070);
  box(b, 'paint', fm, 0, 7.45, -0.3, 0.25, 0.25, 1.4, 0x6a4630);
  b.add('metal', torusG(0.04, 10, Math.PI * 2, 0.14), C.iron, M(fm, T(0, 7.25, 0.25, 0, 1, 1, 1, Math.PI / 2)));
  // Interior: straw floor, stall partitions with posts, a hay stack, lanterns.
  box(b, 'matte', m, 0, 0.1, 0, w - 0.7, 0.04, d - 0.7, 0xc9a95a);
  for (const s of [-1, 1]) {
    for (const sz of [-3.2, -0.6]) {
      box(b, 'paint', m, s * 3.1, 0.12, sz, 0.12, 1.5, 2.4, 0x6a4630);
      box(b, 'paint', m, s * 3.1, 0.12, sz + 1.25, 0.18, 1.8, 0.18, 0x4a3020);
    }
  }
  for (let i = 0; i < 3; i++) {
    const hm = M(m, T(-w / 2 + 1.6 + i * 1.5, 0.12, -d / 2 + 1.1));
    b.add('matte', rbox(1.3, 0.6, 0.7, 0.06), 0xe0c070, hm, { aoY: by + 0.1, aoH: 0.6 });
    if (i < 2) b.add('matte', rbox(1.3, 0.6, 0.7, 0.06), 0xd8b860, M(hm, T(0.75, 0.6, 0)));
  }
  for (const s of [-1, 1]) {
    b.add('glow', boxG(), C.bulb, M(m, T(s * 2, 4.3, 0, 0, 0.22, 0.32, 0.22)));
    box(b, 'metal', m, s * 2, 4.62, 0, 0.3, 0.06, 0.3, C.iron);
  }
  // Weathervane-free ridge (a gem floats above it); a hex sign over the loft.
  const sm = M(fm, T(0, 7.0, -0.2));
  b.add('paint', cylG(6), WHITE, M(sm, T(0, 0, 0, 0, 0.62, 0.1, 0.62, Math.PI / 2)));
  b.add('paint', cylG(6), 0x2f5d7c, M(sm, T(0, 0, 0.04, 0, 0.5, 0.1, 0.5, Math.PI / 2)));
  icon(b, M(sm, T(0, 0, 0.15, 0, 0.75, 0.75, 1)), 'horse');
  // Colliders: walls with the doorway open, lintel.
  k.col.box(m, 0, wh / 2, -d / 2 + 0.15, w / 2, wh / 2, 0.15);
  for (const s of [-1, 1]) k.col.box(m, (s * (w - 0.3)) / 2, wh / 2, 0, 0.15, wh / 2, d / 2);
  for (const s of [-1, 1]) k.col.box(m, s * (ow + (w / 2 - ow) / 2), wh / 2, d / 2 - 0.15, (w / 2 - ow) / 2, wh / 2, 0.15);
  k.col.box(m, 0, (oh + wh) / 2, d / 2 - 0.15, ow, (wh - oh) / 2, 0.15);
  k.col.box(m, 0, wh + 1.6, 0, w / 2 - 1.5, 1.6, d / 2);
}

/** A striped show-jump: wing posts outside the track, two rails and a ground pole across it. */
function showJump(k: Kit, x: number, z: number, yaw: number, span: number): void {
  const y = k.h(x, z);
  const m = T(x, y, z, yaw);
  const b = k.b;
  for (const s of [-1, 1]) {
    const wm = M(m, T(s * (span / 2 + 0.25), 0, 0));
    b.add('paint', rbox(0.5, 1.35, 0.5, 0.05), WHITE, wm, { aoY: y, aoH: 0.4 });
    b.add('paint', boxG(), 0x2f5d7c, M(wm, T(0, 0.3, 0, 0, 0.52, 0.3, 0.52)));
    b.add('paint', boxG(), 0x2f5d7c, M(wm, T(0, 0.9, 0, 0, 0.52, 0.2, 0.52)));
    b.add('gloss', sphereG(1), 0xf2c14e, M(wm, T(0, 1.45, 0, 0, 0.16, 0.16, 0.16)));
  }
  const pole = (py: number, r: number): void => {
    const n = 6;
    for (let i = 0; i < n; i++) {
      b.add('paint', cylG(8), i % 2 ? 0xf2c14e : WHITE, M(m, T(-span / 2 + (i * span) / n, py, 0, 0, r, span / n, r, 0, -Math.PI / 2)));
    }
  };
  pole(0.95, 0.07);
  pole(0.55, 0.07);
  pole(0.12, 0.1);
  k.col.box(m, 0, 0.52, 0, span / 2, 0.5, 0.08);
  for (const s of [-1, 1]) k.col.box(m, s * (span / 2 + 0.25), 0.68, 0, 0.25, 0.68, 0.25);
}

/** A five-bar farm gate (closed) across a fence gap: horses jump it, people climb or hop it. */
function farmGate(k: Kit, x: number, z0: number, z1: number): void {
  const zc = (z0 + z1) / 2;
  const len = Math.abs(z1 - z0);
  const y = k.h(x, zc);
  const m = T(x, y, zc, 0);
  const b = k.b;
  for (const s of [-1, 1]) b.add('paint', rbox(0.26, 1.5, 0.26, 0.04), 0x6a4630, M(m, T(0, -0.1, (s * len) / 2)), { aoY: y, aoH: 0.4 });
  for (let i = 0; i < 5; i++) box(b, 'paint', m, 0, 0.18 + i * 0.19, 0, 0.07, 0.09, len - 0.3, i % 2 ? WHITE : 0xf2c14e);
  b.add('paint', boxG(), WHITE, M(m, T(0, 0.55, 0, 0, 0.07, 0.09, Math.hypot(len - 0.4, 0.8) , Math.atan2(0.8, len - 0.4))));
  for (const s of [-1, 1]) box(b, 'paint', m, 0, 0.12, s * (len / 2 - 0.35), 0.08, 0.95, 0.09, WHITE);
  k.col.box(m, 0, 0.55, 0, 0.08, 0.55, len / 2);
}

function windmillPump(k: Kit, x: number, z: number, yaw: number): RanchResult['windmill'] {
  const y = k.h(x, z);
  const b = k.b;
  const h = 8.5;
  // Four splayed lattice legs with cross braces.
  const base = 1.3;
  const top = 0.35;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x0 = x + sx * base;
    const z0 = z + sz * base;
    const x1 = x + sx * top;
    const z1 = z + sz * top;
    const l = Math.hypot(x1 - x0, h, z1 - z0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(x1 - x0, h, z1 - z0).normalize());
    b.add('metal', cylG(6), 0x8e959c, new THREE.Matrix4().compose(new THREE.Vector3(x0, y, z0), q, new THREE.Vector3(0.06, l, 0.06)));
    k.b.add('matte', rbox(0.4, 0.3, 0.4, 0.04), C.stoneDark, T(x0, y - 0.1, z0));
  }
  for (const t of [0.25, 0.5, 0.75]) {
    const r = base + (top - base) * t;
    const yy = y + h * t;
    for (const [px, pz, rot] of [[0, -r, 0], [0, r, 0], [-r, 0, Math.PI / 2], [r, 0, Math.PI / 2]] as const) {
      box(b, 'metal', T(x + px, yy, z + pz, rot), 0, 0, 0, r * 2, 0.06, 0.06, 0x8e959c);
    }
  }
  // Platform, gearbox, tail vane.
  box(b, 'metal', T(x, y + h, z, yaw), 0, 0, 0, 1.1, 0.08, 1.1, 0x5a6068);
  const gm = T(x, y + h + 0.1, z, yaw);
  b.add('paint', rbox(0.5, 0.45, 0.8, 0.05), 0x6e2f28, gm);
  box(b, 'metal', gm, 0, 0.2, -1.4, 0.06, 0.06, 2.2, C.iron);
  b.add('paint', boxG(), WHITE, M(gm, T(0, -0.25, -2.6, 0, 0.04, 1.0, 1.3)));
  b.add('paint', boxG(), 0xb8433a, M(gm, T(0, 0.05, -2.62, 0, 0.05, 0.4, 1.1)));
  // Pump rod down to a little tank and spout over a trough.
  box(b, 'metal', T(x, y, z), 0, 0.3, 0, 0.05, h, 0.05, C.iron);
  b.add('metal', cylG(12), 0x8e959c, T(x + 0.6, y, z + 0.6, 0, 0.35, 1.0, 0.35));
  k.col.cyl(x, y, z, 1.2, 1.1);
  return { x, y: y + h + 0.32, z, yaw };
}

function trough(k: Kit, x: number, z: number, yaw: number): void {
  const y = k.h(x, z);
  const m = T(x, y, z, yaw);
  k.b.add('paint', rbox(2.6, 0.7, 0.9, 0.05), 0x7a5236, m, { aoY: y, aoH: 0.3 });
  box(k.b, 'gloss', m, 0, 0.6, 0, 2.4, 0.06, 0.7, 0x4f8fa8);
  for (const s of [-1, 1]) box(k.b, 'metal', m, s * 1.0, 0.0, 0, 0.08, 0.72, 0.94, C.iron);
  k.col.box(m, 0, 0.35, 0, 1.3, 0.35, 0.45);
}

function saddleRack(k: Kit, x: number, z: number, yaw: number): void {
  const y = k.h(x, z);
  const m = T(x, y, z, yaw);
  const b = k.b;
  for (const s of [-1, 1]) b.add('paint', rbox(0.14, 1.2, 0.14, 0.03), 0x6a4630, M(m, T(s * 1.4, 0, 0)));
  box(b, 'paint', m, 0, 1.0, 0, 3.0, 0.14, 0.14, 0x9b6b43);
  const cols = [0x6e3a1e, 0x2a2420, 0x8a5a36];
  for (let i = 0; i < 3; i++) {
    const sm = M(m, T(-0.9 + i * 0.9, 1.1, 0));
    b.add('gloss', sphereG(1), cols[i], M(sm, T(0, 0, 0, 0, 0.36, 0.16, 0.42)));
    box(b, 'gloss', sm, 0, -0.45, 0, 0.06, 0.45, 0.62, cols[i]);
    b.add('metal', torusG(0.02, 8, Math.PI * 2, 0.07), 0xd9b34a, M(sm, T(0, -0.5, 0.33, 0, 1, 1, 1, Math.PI / 2)));
  }
  k.col.box(m, 0, 0.6, 0, 1.5, 0.6, 0.25);
}

function silo(k: Kit, x: number, z: number): void {
  const y = k.h(x, z);
  const b = k.b;
  b.add('matte', cylG(16), 0xa79e8e, T(x, y - 0.3, z, 0, 2.6, 0.6, 2.6));
  b.add('matte', cylG(18), 0xd9d2c2, T(x, y + 0.3, z, 0, 2.3, 9.2, 2.3), { aoY: y, aoH: 1.4, ao: 0.3 });
  for (let i = 1; i < 6; i++) b.add('metal', cylG(18, 1, true), 0x8e959c, T(x, y + 0.3 + i * 1.55, z, 0, 2.33, 0.12, 2.33));
  b.add('metal', sphereG(2), 0x8e959c, T(x, y + 9.5, z, 0, 2.35, 1.5, 2.35));
  b.add('gloss', coneG(8), 0xb8433a, T(x, y + 10.8, z, 0, 0.3, 0.5, 0.3));
  // Ladder up the side facing the barn.
  for (const s of [-0.25, 0.25]) box(b, 'metal', T(x + 2.36, y, z + s), 0, 0, 0, 0.05, 9.5, 0.05, C.iron);
  for (let i = 0; i < 18; i++) box(b, 'metal', T(x + 2.36, y + 0.5 + i * 0.5, z), 0, 0, 0, 0.05, 0.04, 0.5, C.iron);
  k.col.cyl(x, y, z, 5, 2.35);
}

export function buildRanch(k: Kit): RanchResult {
  const a = ANCHORS.ranch;
  const b = k.b;
  const xL = a.x - PADDOCK.hx;
  const xR = a.x + PADDOCK.hx;
  const zT = a.z - PADDOCK.hz;
  const zB = a.z + PADDOCK.hz;

  // ── Paddock ground: soft trampled grass, a sand arena track round the edge with hoof marks ──
  groundRect(k, a.x, a.z, PADDOCK.hx - 0.2, PADDOCK.hz - 0.2, 0, 1.5, 0.04, (lx, lz) => {
    // Trampled, sandier ground in the middle where the horses stand; clover-dark patches near the fence.
    const n = Math.sin(lx * 0.7 + lz * 0.3) * Math.cos(lz * 0.55 - lx * 0.2) + 0.35 * Math.sin(lx * 1.9 - lz * 1.3);
    const mid = Math.max(0, 1 - Math.hypot(lx / 9, lz / 7));
    if (mid > 0.45 && n > -0.2) return n > 0.4 ? 0xb3a36c : 0xa29a5e;
    return n > 0.45 ? 0x8fab55 : n < -0.45 ? 0x5f8a3c : 0x779a46;
  });
  const track = roundedRect(a.x, a.z, TRACK.hx, TRACK.hz, TRACK.r, 0, 6);
  const tw = TRACK.width / 2;
  ribbon(k, track, [-tw - 0.25, -tw, -tw * 0.4, 0, tw * 0.4, tw, tw + 0.25], [0x9a8a5a, 0xc8a978, 0xb89668, 0xd2b486, 0xb89668, 0xc8a978, 0x9a8a5a], 0.07, true,
    (x, z, i) => (i > 0 && i < 6 ? 0.93 + 0.12 * Math.sin(x * 3.1 + z * 2.3) * Math.sin(z * 4.7 - x * 1.3) : 1));
  // White inner rail line painted on the ground (start/finish) on the east straight.
  groundRect(k, a.x + TRACK.hx, a.z + 2, tw, 0.25, 0, 0.5, 0.1, () => 0xf3efe4);

  // ── Fences: the old box with two gates (east at the road, west towards the barn) ──
  const rail = { post: 0xd9cdb6, rail: 0xefe7d6, height: 1.25 };
  const [w0, w1] = PADDOCK.westGate;
  // North side: open where the beach path leaves the paddock (north-west).
  fence(k, [[xR - PADDOCK.northEnd, zT], [a.x + PADDOCK.beachGap[1], zT]], rail);
  fence(k, [[xL, zT], [xL, a.z + w0]], rail);
  fence(k, [[xL, a.z + w1], [xL, zB], [xR, zB], [xR, a.z + PADDOCK.eastStart]], rail);
  farmGate(k, xL, a.z + w0, a.z + w1);
  // Pennants on the fence (every ~4.4 m) mark the riding loop; tall flags at the corners.
  const cols = [0xc8433a, 0xf2c14e, 0x2f5d7c, 0xf4efe6];
  let f = 0;
  const along = (x0: number, z0: number, x1: number, z1: number, skip?: [number, number]): void => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 4.4));
    for (let i = 1; i < n; i++) {
      const x = x0 + ((x1 - x0) * i) / n;
      const z = z0 + ((z1 - z0) * i) / n;
      if (skip && z > skip[0] - 1 && z < skip[1] + 1) continue;
      markerFlag(k, x, z, 1.95, cols[f++ % cols.length], Math.atan2(x1 - x0, z1 - z0) + Math.PI / 2);
    }
  };
  along(a.x + PADDOCK.beachGap[1], zT + 0.15, xR - PADDOCK.northEnd, zT + 0.15);
  along(xL + 0.15, zB - 0.15, xR - 0.15, zB - 0.15);
  for (const [cx, cz, c] of [[xL - 0.9, zT - 0.9, 0xc8433a], [xL - 0.9, zB + 0.9, 0x2f5d7c], [xR + 0.9, zB + 0.9, 0xc8433a]] as const) {
    tallPennant(k, cx, cz, 5.2, c);
  }
  // Show jumps on the long straights.
  for (const [jx, jz] of JUMPS) showJump(k, a.x + jx, a.z + jz, Math.PI / 2, TRACK.width + 0.4);

  // ── Entrance arch over the west road where it comes in through the open corner ──
  const am = T(ARCH.x, k.h(ARCH.x, ARCH.z), ARCH.z, ARCH.yaw);
  for (const s of [-1, 1]) {
    const pm = M(am, T(s * ARCH.half, 0, 0));
    const py = k.h(ARCH.x, ARCH.z);
    b.add('paint', rbox(0.38, 4.6, 0.38, 0.05), 0x6a4630, pm, { aoY: py, aoH: 0.5 });
    b.add('matte', rbox(0.8, 0.45, 0.8, 0.05), C.stone, M(pm, T(0, -0.12, 0)));
    b.add('glow', boxG(), C.bulb, M(pm, T(0, 2.6, 0.32, 0, 0.18, 0.26, 0.18)));
    box(b, 'metal', pm, 0, 2.86, 0.32, 0.26, 0.06, 0.26, C.iron);
    const wp = new THREE.Vector3().setFromMatrixPosition(pm);
    k.col.cyl(wp.x, k.h(wp.x, wp.z), wp.z, 2.3, 0.22);
  }
  const gm = M(am, T(0, 4.3, 0));
  b.add('paint', rbox(ARCH.half * 2 + 1.2, 0.4, 0.4, 0.05), 0x6a4630, gm);
  b.add('paint', rbox(2.6, 1.3, 0.12, 0.05), 0x6a4630, M(gm, T(0, -1.45, 0)));
  b.add('paint', rbox(2.3, 1.05, 0.16, 0.05), WHITE, M(gm, T(0, -1.32, 0)));
  icon(b, M(gm, T(0, -0.8, 0.09, 0, 1.35, 1.35, 1)), 'horse', 0x6a4630);
  icon(b, M(gm, T(0, -0.8, -0.09, Math.PI, 1.35, 1.35, 1)), 'horse', 0x6a4630);
  for (const s of [-1, 1]) b.add('metal', boxG(), C.iron, M(gm, T(s * 1.0, -0.22, 0, 0, 0.04, 0.22, 0.04)));
  b.add('metal', torusG(0.06, 12, Math.PI, 0.34), 0xc0c4c8, M(gm, T(0, 0.2, 0.22, 0, 1, 1, 1, Math.PI / 2)));

  barn(k);
  const windmill = windmillPump(k, a.x - 24, a.z + 13, Math.PI / 2 - 0.4);
  silo(k, a.x - 27, a.z - 13.5);

  // ── Yard props outside the fence ──
  trough(k, xL - 1.8, a.z + 8, Math.PI / 2);
  trough(k, xR + 2.0, a.z + 3, Math.PI / 2);
  saddleRack(k, xR + 2.2, a.z - 1.6, Math.PI / 2);
  hayBale(k, a.x - 22.5, a.z - 9.5, 0.2);
  hayBale(k, a.x - 21.2, a.z - 8.2, 1.1);
  hayBale(k, xR + 2.6, zB - 2.0, 0.5);
  hayBale(k, xR + 3.4, zB - 3.4, 1.4);
  // A stack of square bales next to the barn (with a little step so kids can climb it).
  const sx = a.x - 21.8;
  const sz = a.z - 12.2;
  const sy = k.h(sx, sz);
  for (let i = 0; i < 6; i++) {
    const row = i < 3 ? 0 : i < 5 ? 1 : 2;
    const ox = row === 0 ? (i - 1) * 1.15 : row === 1 ? (i - 3.5) * 1.15 : 0;
    const bm = T(sx + ox, sy + row * 0.55, sz, 0);
    b.add('matte', rbox(1.1, 0.55, 0.62, 0.05), 0xe0c070, bm, { aoY: sy, aoH: 0.6 });
    for (const t of [-0.25, 0.25]) box(b, 'paint', bm, t, 0, 0, 0.03, 0.56, 0.64, 0xb08a3a);
    k.col.box(bm, 0, 0.275, 0, 0.55, 0.275, 0.31);
  }
  barrel(k, xR + 2.4, a.z + 6.2, 0x2f5d7c);
  crate(k, xR + 3.2, a.z + 7.2, 0.8, 0.4);
  // Wheelbarrow with hay.
  const wx = a.x - 22.8;
  const wz = a.z + 7.5;
  const wy = k.h(wx, wz);
  const wm = T(wx, wy, wz, 0.6);
  b.add('gloss', rbox(0.9, 0.35, 0.6, 0.06), 0x2f8fb0, M(wm, T(0, 0.38, 0, 0, 1, 1, 1, -0.1)));
  b.add('matte', sphereG(1), 0xe0c070, M(wm, T(0, 0.75, 0, 0, 0.42, 0.15, 0.28)));
  b.add('rubber', torusG(0.06, 12, Math.PI * 2, 0.2), 0x2a2a2c, M(wm, T(0.55, 0.22, 0, 0, 1, 1, 1, Math.PI / 2)));
  for (const s of [-1, 1]) box(b, 'metal', wm, -0.75, 0.45, s * 0.25, 0.8, 0.04, 0.04, C.iron);
  k.col.box(wm, 0, 0.35, 0, 0.7, 0.35, 0.35);
  lamp(k, xL - 3.5, a.z - 6.5);

  const trees: ManualTree[] = [
    { x: a.x - 30, z: a.z - 14, kind: 'oak', scale: 1.2 },
    { x: a.x - 31, z: a.z + 14, kind: 'oak', scale: 1.1 },
    { x: a.x + 24, z: a.z + 18, kind: 'oak', scale: 1.05 },
    { x: a.x - 6, z: a.z + 20.5, kind: 'oak', scale: 0.95 },
    { x: a.x + 6, z: a.z + 21, kind: 'bush', scale: 1.2 },
    { x: a.x - 14, z: a.z - 19, kind: 'bush', scale: 1.1 },
    { x: a.x + 22.5, z: a.z - 17, kind: 'rock', scale: 0.8 },
  ];
  const keepouts: Keepout[] = [
    { x: a.x, z: a.z, hx: PADDOCK.hx + 1, hz: PADDOCK.hz + 1, mown: true },
    { x: a.x - 27, z: a.z, hx: 7.5, hz: 8 },
    { x: a.x - 27, z: a.z - 13.5, r: 3.5 },
    { x: windmill.x, z: windmill.z, r: 2.5 },
    { x: sx, z: sz, r: 2.6 },
    { x: xL - 2, z: a.z, hx: 2.2, hz: 10 },
    { x: xR + 2.8, z: a.z + 5, hx: 2.4, hz: 9 },
  ];
  return { trees, keepouts, windmill };
}
