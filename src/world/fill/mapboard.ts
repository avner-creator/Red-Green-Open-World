/**
 * The island map on the plaza: a big framed board with the island drawn in cream on a dark sea, the
 * roads in dark brown, every attraction and zone as its pictogram badge, and a yellow "you are here"
 * pin. The map is turned so that "up" on the board is the way the reader is looking (forward-up), so
 * a child can match left and right on the map to the world. Wordless; cream-on-navy and dark-on-cream
 * read by brightness in the red-only and green-only channels. Geometry + pictogram decals only.
 */
import * as THREE from 'three';
import { M, T } from '../batch';
import { C, type Kit } from '../props';
import { boxG, cylG, rbox, sphereG, torusG } from '../shapes';
import type { Decals } from '../decals';
import type { IconId } from '../pictograms';
import type { ProcessedRoad } from '../terrain';
import { coastRadius } from '../terrain';
import { ATTRACTIONS, GLASSES_WAY } from '../attractions';
import { ANCHORS } from '../layout';

/** Where the board stands (the main street's east corner, by the park road) and the point it faces. */
export const MAP_BOARD = { x: 11, z: -16.5, faceX: 0, faceZ: 9 } as const;

const NAVY = 0x1b2a48;
const LAND = 0xeee2c0;
const ROAD = 0x6a5440;
const CREAM = 0xf4efe6;

export function mapBoard(k: Kit, d: Decals, roads: readonly ProcessedRoad[], zones: readonly { x: number; z: number; icon: IconId }[], x: number = MAP_BOARD.x, z: number = MAP_BOARD.z): void {
  const y = k.h(x, z);
  const yaw = Math.atan2(MAP_BOARD.faceX - x, MAP_BOARD.faceZ - z);
  const W = 4.2;
  const H = 3.4;
  const yc = 2.55;
  const m = T(x, y, z, yaw);
  // Frame, posts, roof.
  for (const s of [-1, 1]) {
    k.b.add('paint', rbox(0.3, yc + H / 2 + 0.6, 0.3, 0.05), C.woodDark, M(m, T(s * (W / 2 + 0.18), -0.1, 0)), { aoY: y, aoH: 0.5, ao: 0.35 });
    k.b.add('matte', rbox(0.6, 0.35, 0.6, 0.06), C.stone, M(m, T(s * (W / 2 + 0.18), -0.1, 0)), { aoY: y, aoH: 0.3, ao: 0.3 });
  }
  k.b.add('paint', rbox(W + 0.3, H + 0.3, 0.14, 0.04), 0xc8433a, M(m, T(0, yc - H / 2 - 0.15, -0.02)));
  k.b.add('paint', rbox(W + 0.12, H + 0.12, 0.16, 0.03), CREAM, M(m, T(0, yc - H / 2 - 0.06, -0.01)));
  k.b.add('paint', rbox(W, H, 0.18, 0.02), NAVY, M(m, T(0, yc - H / 2, 0)));
  for (const s of [-1, 1]) k.b.add('paint', boxG(), 0x2c3038, M(m, T(0, yc + H / 2 + 0.32, s * 0.25, 0, W + 0.8, 0.1, 0.62, s * 0.45)));
  k.b.add('gloss', sphereG(1), 0xf2c14e, M(m, T(0, yc + H / 2 + 0.62, 0, 0, 0.2, 0.2, 0.2)));
  k.col.box(m, 0, (yc + H / 2 + 0.6) / 2, 0, W / 2 + 0.35, (yc + H / 2 + 0.6) / 2, 0.3);

  // Map frame: forward-up for a reader facing the board (looking along −normal).
  const span = 330; // metres shown across the island's widest part
  const sc = (Math.min(W, H) - 0.25) / span;
  const n = new THREE.Vector2(Math.sin(yaw), Math.cos(yaw));
  const fwd = n.clone().negate();
  const rgt = new THREE.Vector2(Math.cos(yaw), -Math.sin(yaw));
  const face = 0.095;
  const toBoard = (wx: number, wz: number, lift: number): THREE.Matrix4 => {
    const u = (wx * rgt.x + wz * rgt.y) * sc;
    const v = (wx * fwd.x + wz * fwd.y) * sc;
    return M(m, T(u, yc + v, face + lift));
  };
  // Island: a cream disc-ish shape from the coastline, a greener inner meadow.
  const shape = (inset: number): THREE.ShapeGeometry => {
    const s = new THREE.Shape();
    const N = 72;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r = coastRadius(Math.cos(a), Math.sin(a)) - inset;
      const wx = Math.cos(a) * r;
      const wz = Math.sin(a) * r;
      const u = (wx * rgt.x + wz * rgt.y) * sc;
      const v = (wx * fwd.x + wz * fwd.y) * sc;
      if (i === 0) s.moveTo(u, v);
      else s.lineTo(u, v);
    }
    return new THREE.ShapeGeometry(s);
  };
  const land = shape(0);
  k.b.add('paint', land, LAND, M(m, T(0, yc, face)));
  land.dispose();
  const sand = shape(-5);
  k.b.add('paint', sand, 0xb8d8e8, M(m, T(0, yc, face - 0.004)));
  sand.dispose();
  // Roads: dark strips.
  for (const r of roads) {
    const w = Math.max(0.035, r.def.width * sc * 1.4);
    for (let i = 0; i < r.pts.length - 1; i += 2) {
      const a = r.pts[i];
      const b = r.pts[Math.min(i + 2, r.pts.length - 1)];
      const ua = (a.x * rgt.x + a.z * rgt.y) * sc;
      const va = (a.x * fwd.x + a.z * fwd.y) * sc;
      const ub = (b.x * rgt.x + b.z * rgt.y) * sc;
      const vb = (b.x * fwd.x + b.z * fwd.y) * sc;
      const len = Math.hypot(ub - ua, vb - va);
      if (len < 1e-4) continue;
      const roll = Math.atan2(vb - va, ub - ua);
      k.b.add('paint', boxG(), ROAD, M(m, T((ua + ub) / 2, yc + (va + vb) / 2, face + 0.004, 0, 1, 1, 1, 0, roll - Math.PI / 2).multiply(T(0, -len / 2 - w / 2, 0, 0, w, len + w, 0.012))));
    }
  }
  // Pictogram badges: attractions, glasses sites (smaller), new zones.
  const badge = (wx: number, wz: number, icon: IconId, size: number): void => {
    d.add(icon, toBoard(wx, wz, 0.03), size);
  };
  for (const a of ATTRACTIONS) badge(ANCHORS[a.anchor].x, ANCHORS[a.anchor].z, a.icon, 0.34);
  for (const g of GLASSES_WAY) badge(g.x, g.z, g.icon, 0.26);
  for (const zn of zones) badge(zn.x, zn.z, zn.icon, 0.34);
  // You are here: a yellow ring round the board's own spot, a pin sticking out and the pin badge.
  k.b.add('paint', torusG(0.025, 32, Math.PI * 2, 0.24), 0xf2c14e, toBoard(x, z, 0.02).multiply(T(0, 0, 0, 0, 1, 1, 1, Math.PI / 2)));
  k.b.add('gloss', cylG(10), 0xf2c14e, toBoard(x, z, 0.0).multiply(T(0, 0, 0, 0, 0.035, 0.22, 0.035, Math.PI / 2)));
  k.b.add('gloss', sphereG(1), 0xf2c14e, toBoard(x, z, 0.22).multiply(T(0, 0, 0, 0, 0.09, 0.09, 0.09)));
  d.add('iHere', toBoard(x, z, 0.04).multiply(T(0, 0.42, 0)), 0.56);
  // The back: a big "map" pictogram (the "you are here" badge) for anyone walking round it.
  d.add('iHere', M(m, T(0, yc, -0.11, Math.PI)), 1.6);
}
