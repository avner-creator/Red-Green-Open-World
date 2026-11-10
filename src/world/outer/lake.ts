/**
 * Lake and beach: a timber pier with a T-head out into the bay (rowing boats moored alongside), a
 * lifeguard tower, striped beach umbrellas with towels (no text), sun loungers, sandcastles, an
 * upturned boat on the sand, reeds along the shores, and a ring of swim buoys round the floating
 * platform (the buoys bob: their positions go to the live layer).
 */
import * as THREE from 'three';
import { M, T } from '../batch';
import { C, box, type Kit } from '../props';
import { boxG, coneG, cylG, rbox, sphereG, torusG } from '../shapes';
import { ANCHORS } from '../layout';
import type { Keepout, ManualTree } from '../scatter';
import { reeds } from './common';

export interface LakeResult {
  trees: ManualTree[];
  keepouts: Keepout[];
  /** Swim buoys (x, z, colour) for the bobbing instanced mesh. */
  buoys: { x: number; z: number; color: number }[];
}

/** Pier: runs north (−Z) from the south beach. Deck top height and the T-head. */
export const PIER = { x: -128, z0: -1, z1: -25, width: 2.6, top: 1.05, head: 7 } as const;

const WOOD = 0x9b7350;
const WOOD_D = 0x6a4630;

let hull: THREE.BufferGeometry | null = null;
/** Rowing-boat hull (length 3.6 along Z, beam 1.3, depth 0.55) with an inner floor; origin at the keel. */
function hullGeo(): THREE.BufferGeometry {
  if (hull) return hull;
  const sections = 10;
  const ring = 7;
  const pos: number[] = [];
  const idx: number[] = [];
  const L = 3.6;
  for (let i = 0; i <= sections; i++) {
    const t = i / sections;
    const z = -L / 2 + t * L;
    // Beam: pointed bow at +Z, a narrower transom at −Z.
    const beam = 0.65 * (t < 0.75 ? 0.82 + 0.18 * Math.sin((t / 0.75) * Math.PI * 0.5) : Math.cos(((t - 0.75) / 0.25) * Math.PI * 0.5));
    const sheer = 0.55 + 0.12 * (2 * t - 1) ** 2;
    for (let j = 0; j < ring; j++) {
      const u = j / (ring - 1); // 0 = port gunwale, 1 = starboard gunwale
      const ang = Math.PI * u;
      const x = -Math.cos(ang) * Math.max(beam, 0.02);
      const y = sheer - Math.sin(ang) * (sheer - 0.05) * (0.6 + 0.4 * Math.sin(ang));
      pos.push(x, Math.max(0, y), z);
      if (i > 0 && j > 0) {
        const a1 = i * ring + j;
        idx.push(a1 - ring - 1, a1 - 1, a1 - ring, a1 - ring, a1 - 1, a1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const out = g.toNonIndexed();
  out.computeVertexNormals();
  // Make the normals point outward (away from the boat's centreline / up from the keel).
  const p = out.attributes.position;
  const n = out.attributes.normal;
  let dot = 0;
  for (let i = 0; i < p.count; i++) dot += n.getX(i) * p.getX(i) + n.getY(i) * (p.getY(i) - 0.5);
  if (dot > 0) {
    for (let i = 0; i < p.count; i += 3) {
      const ax = p.getX(i + 1), ay = p.getY(i + 1), az = p.getZ(i + 1);
      p.setXYZ(i + 1, p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
      p.setXYZ(i + 2, ax, ay, az);
    }
    out.computeVertexNormals();
  }
  g.dispose();
  hull = out;
  return hull;
}

function rowingBoat(k: Kit, x: number, y: number, z: number, yaw: number, color: number, upturned = false): void {
  const b = k.b;
  const m = upturned ? T(x, y + 0.62, z, yaw, 1, 1, 1, 0, Math.PI) : T(x, y, z, yaw, 1, 1, 1, 0, 0.03);
  b.add('gloss', hullGeo(), color, m);
  if (upturned) {
    k.col.box(T(x, y, z, yaw), 0, 0.31, 0, 0.6, 0.31, 1.7);
    return;
  }
  // Gunwale trim, floor boards, two thwarts, oars.
  box(b, 'paint', m, 0, 0.12, 0, 0.9, 0.04, 2.6, 0xc89a66);
  for (const tz of [-0.5, 0.55]) box(b, 'paint', m, 0, 0.38, tz, 1.15, 0.05, 0.28, 0xc89a66);
  for (const s of [-1, 1]) {
    b.add('paint', cylG(6), 0xd9c09a, M(m, T(s * 0.5, 0.5, 0.2, 0, 0.03, 2.4, 0.03, Math.PI / 2 - 0.08, s * 0.25)));
    box(b, 'paint', m, s * 0.58, 0.4, 1.3, 0.04, 0.12, 0.38, 0xd9c09a);
  }
  b.add('paint', torusG(0.03, 8, Math.PI * 2, 0.08), 0xd0d0d0, M(m, T(0, 0.62, 1.78, 0, 1, 1, 1, Math.PI / 2)));
  k.col.box(T(x, y, z, yaw), 0, 0.3, 0, 0.62, 0.3, 1.7);
}

function pier(k: Kit): void {
  const b = k.b;
  const { x, z0, z1, width, top, head } = PIER;
  const len = z0 - z1;
  const zc = (z0 + z1) / 2;
  const hw = width / 2;
  // Deck planks across the pier, stringers, piles every 3 m (down into the water/sand).
  const n = Math.round(len / 0.36);
  for (let i = 0; i < n; i++) box(b, 'paint', T(0, 0, 0), x, top - 0.08, z0 - (i + 0.5) * (len / n), width, 0.08, len / n - 0.04, [WOOD, 0x8d6847, 0xa67c56][i % 3]);
  for (const s of [-1, 1]) box(b, 'paint', T(0, 0, 0), x + s * (hw - 0.15), top - 0.4, zc, 0.22, 0.32, len, WOOD_D);
  for (let zz = z0 - 1; zz >= z1 - head / 2; zz -= 3) {
    for (const s of [-1, 1]) {
      const px = x + s * (hw + 0.05);
      const by = Math.min(k.h(px, zz), -0.5) - 1.5;
      b.add('paint', cylG(8), WOOD_D, T(px, by, zz, 0, 0.16, top + 0.3 - by, 0.16));
      b.add('paint', cylG(8), 0x3f5a3a, T(px, -0.15, zz, 0, 0.17, 0.3, 0.17));
    }
  }
  k.col.box(T(x, top - 0.25, zc), 0, 0, 0, hw, 0.25, len / 2);
  // T-head across the end.
  const hz = z1 - 1.3;
  const hd = 2.6;
  const nh = Math.round(head / 0.36);
  for (let i = 0; i < nh; i++) box(b, 'paint', T(0, 0, 0), x - head / 2 + (i + 0.5) * (head / nh), top - 0.08, hz, head / nh - 0.04, 0.08, hd, [0xa67c56, WOOD][i % 2]);
  for (const s of [-1, 1]) box(b, 'paint', T(0, 0, 0), x, top - 0.4, hz + s * (hd / 2 - 0.15), head, 0.32, 0.22, WOOD_D);
  for (const px of [-head / 2 + 0.2, head / 2 - 0.2]) {
    for (const s of [-1, 1]) {
      const by = -2.5;
      b.add('paint', cylG(8), WOOD_D, T(x + px, by, hz + s * (hd / 2 - 0.1), 0, 0.16, top + 0.3 - by, 0.16));
    }
  }
  k.col.box(T(x, top - 0.25, hz), 0, 0, 0, head / 2, 0.25, hd / 2);
  // Rope rail on the T-head's far side (posts + rope), bollards, a lamp, a life ring, a ladder.
  for (let i = 0; i <= 4; i++) {
    const px = x - head / 2 + 0.2 + (i * (head - 0.4)) / 4;
    b.add('paint', cylG(8), WOOD_D, T(px, top, hz - hd / 2 + 0.12, 0, 0.08, 0.95, 0.08));
  }
  b.add('matte', cylG(8), 0xe8dcc0, T(x - head / 2 + 0.2, top + 0.85, hz - hd / 2 + 0.12, 0, 0.035, head - 0.4, 0.035, 0, -Math.PI / 2));
  k.col.box(T(x, top, hz - hd / 2 + 0.12), 0, 0.5, 0, head / 2, 0.5, 0.08);
  for (const s of [-1, 1]) {
    b.add('metal', cylG(10), 0x2c3036, T(x + s * (head / 2 - 0.5), top, hz + 0.6, 0, 0.16, 0.42, 0.16));
    b.add('metal', sphereG(1), 0x2c3036, T(x + s * (head / 2 - 0.5), top + 0.45, hz + 0.6, 0, 0.2, 0.12, 0.2));
  }
  for (let zz = z0 - 6; zz > z1 + 2; zz -= 8) {
    for (const s of [-1, 1]) {
      b.add('metal', cylG(10), 0x2c3036, T(x + s * (hw - 0.25), top, zz, 0, 0.13, 0.36, 0.13));
    }
  }
  const lx = x + head / 2 - 0.4;
  const lz = hz - 0.6;
  b.add('metal', cylG(8), C.iron, T(lx, top, lz, 0, 0.07, 3.0, 0.07));
  b.add('glow', boxG(), C.bulb, T(lx, top + 3.0, lz, 0, 0.26, 0.36, 0.26));
  b.add('metal', coneG(4), C.iron, T(lx, top + 3.36, lz, Math.PI / 4, 0.3, 0.22, 0.3));
  k.col.cyl(lx, top, lz, 1.5, 0.1);
  const rm = T(x - head / 2 + 0.6, top + 0.55, hz - hd / 2 + 0.06, 0);
  b.add('paint', torusG(0.1, 20, Math.PI * 2, 0.3), 0xf4efe6, M(rm, T(0, 0, 0, 0, 1, 1, 1, Math.PI / 2)));
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
    b.add('paint', boxG(), 0xc8433a, M(rm, T(Math.cos(ang) * 0.3, Math.sin(ang) * 0.3 - 0.06, 0, 0, 0.12, 0.12, 0.22)));
  }
  for (const s of [-0.3, 0.3]) box(b, 'metal', T(0, 0, 0), x + s, -1.2, hz - hd / 2 - 0.1, 0.05, top + 1.2, 0.05, 0xd0d0d0);
  for (let i = 0; i < 4; i++) box(b, 'metal', T(0, 0, 0), x, -0.6 + i * 0.42, hz - hd / 2 - 0.1, 0.6, 0.04, 0.04, 0xd0d0d0);
  // Boats moored alongside.
  rowingBoat(k, x + hw + 1.0, 0.02, z1 + 7, 0.05, 0x2f8fb0);
  rowingBoat(k, x - hw - 1.0, 0.02, z1 + 11, -0.08, 0xf2eee6);
  rowingBoat(k, x - head / 2 - 1.1, 0.02, hz + 0.3, Math.PI / 2 + 0.1, 0xc8433a);
}

function umbrella(k: Kit, x: number, z: number, tilt: number, c1: number, c2: number): void {
  const y = k.h(x, z);
  const m = T(x, y, z, tilt * 3, 1, 1, 1, tilt * 0.6, tilt);
  const b = k.b;
  b.add('metal', cylG(6), 0xe8e6e0, M(m, T(0, -0.3, 0, 0, 0.035, 2.75, 0.035)));
  const segs = 8;
  for (let i = 0; i < segs; i++) {
    const g = new THREE.ConeGeometry(1.35, 0.55, segs, 1, true, (i / segs) * Math.PI * 2, (Math.PI * 2) / segs).translate(0, 0.27, 0);
    b.add('cloth', g, i % 2 ? c1 : c2, M(m, T(0, 2.15, 0)));
    g.dispose();
  }
  b.add('gloss', sphereG(0), c1, M(m, T(0, 2.72, 0, 0, 0.07, 0.07, 0.07)));
  k.col.cyl(x, y, z, 1.2, 0.06);
}

function towel(k: Kit, x: number, z: number, yaw: number, c1: number, c2: number): void {
  const y = k.h(x, z);
  const m = T(x, y + 0.08, z, yaw);
  box(k.b, 'paint', m, 0, 0, 0, 0.95, 0.03, 1.9, c1);
  for (const tz of [-0.6, 0, 0.6]) box(k.b, 'paint', m, 0, 0.012, tz, 0.96, 0.03, 0.22, c2);
}

function lounger(k: Kit, x: number, z: number, yaw: number, color: number): void {
  const y = k.h(x, z);
  const m = T(x, y, z, yaw);
  const b = k.b;
  for (const s of [-1, 1]) for (const tz of [-0.8, 0.5]) box(b, 'metal', m, s * 0.3, 0, tz, 0.04, 0.32, 0.04, 0xe8e6e0);
  box(b, 'paint', m, 0, 0.3, -0.15, 0.66, 0.06, 1.4, color);
  b.add('paint', boxG(), color, M(m, T(0, 0.33, 0.55, 0, 0.66, 0.06, 0.75, -0.7)));
  k.col.box(m, 0, 0.3, 0, 0.35, 0.3, 0.95);
}

function sandcastle(k: Kit, x: number, z: number, s: number): void {
  const y = k.h(x, z);
  const b = k.b;
  const sand = 0xd8bf8a;
  b.add('matte', cylG(10), sand, T(x, y - 0.05, z, 0, 0.75 * s, 0.4 * s, 0.75 * s), { aoY: y, aoH: 0.2 });
  b.add('matte', cylG(10), 0xcdb27c, T(x, y + 0.35 * s, z, 0, 0.45 * s, 0.35 * s, 0.45 * s));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const tx = x + Math.cos(a) * 0.62 * s;
    const tz = z + Math.sin(a) * 0.62 * s;
    b.add('matte', cylG(8), sand, T(tx, y - 0.05, tz, 0, 0.18 * s, 0.6 * s, 0.18 * s));
    b.add('matte', coneG(8), 0xcdb27c, T(tx, y + 0.55 * s, tz, 0, 0.2 * s, 0.25 * s, 0.2 * s));
  }
  b.add('matte', coneG(8), sand, T(x, y + 0.7 * s, z, 0, 0.3 * s, 0.4 * s, 0.3 * s));
  b.add('metal', cylG(4), 0xe8e6e0, T(x, y + 1.05 * s, z, 0, 0.012, 0.35, 0.012));
  b.add('cloth', new THREE.PlaneGeometry(0.22, 0.14).translate(0.11, 0, 0), 0xc8433a, T(x, y + 1.32 * s, z, 0.4));
  k.col.cyl(x, y, z, 0.3 * s, 0.75 * s);
}

function lifeguardTower(k: Kit, x: number, z: number, yaw: number): void {
  const y = k.h(x, z);
  const m = T(x, y, z, yaw);
  const b = k.b;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(b, 'paint', m, sx * 0.9, -0.3, sz * 0.9, 0.16, 2.9, 0.16, 0xf4efe6);
  for (const sz of [-1, 1]) b.add('paint', boxG(), 0xf4efe6, M(m, T(0, 0.3, sz * 0.9, 0, 0.08, 0.08, 2.4, 0, Math.PI / 2 - 0.6)));
  box(b, 'paint', m, 0, 2.5, 0, 2.2, 0.12, 2.2, WOOD);
  b.add('paint', rbox(2.0, 1.6, 2.0, 0.05), 0xc8433a, M(m, T(0, 2.6, -0.1)));
  box(b, 'paint', m, 0, 3.0, 0.92, 2.0, 0.7, 0.06, 0x2a2a2c);
  for (let i = 0; i < 3; i++) box(b, 'paint', m, 0, 2.62 + i * 0.5, 0.95, 2.02, 0.16, 0.04, 0xf4efe6);
  b.add('paint', boxG(), 0xf4efe6, M(m, T(0, 4.15, -0.1, 0, 2.4, 0.12, 2.4)));
  b.add('metal', cylG(6), 0xe8e6e0, M(m, T(0.9, 4.2, -0.9, 0, 0.03, 1.6, 0.03)));
  b.add('cloth', new THREE.PlaneGeometry(0.7, 0.45).translate(0.35, 0, 0), 0xf2c14e, M(m, T(0.9, 5.55, -0.9)));
  // Ramp up the back.
  const rl = Math.hypot(2.6, 3.0);
  const rmat = M(m, T(0, 1.25, -2.4, 0, 1, 1, 1, Math.atan2(2.6, 3.0)));
  b.add('paint', boxG(), WOOD, M(rmat, T(0, -0.04, 0, 0, 0.9, 0.08, rl)));
  k.col.box(rmat, 0, -0.04, 0, 0.45, 0.06, rl / 2);
  k.col.box(m, 0, 1.4, 0, 1.1, 1.4, 1.1);
  k.col.box(m, 0, 3.4, -0.1, 1.0, 0.8, 1.0);
}

export function buildLake(k: Kit): LakeResult {
  pier(k);
  lifeguardTower(k, -119, 2.2, Math.PI);
  // South beach, west of the beach path (x ≤ −104).
  const cols: [number, number][] = [[0xc8433a, 0xf4efe6], [0x2f5d7c, 0xf2c14e], [0x3b6b45, 0xf4efe6], [0xf07a28, 0x2f5d7c]];
  const spots: [number, number, number][] = [[-141, 1.2, 0.12], [-134.5, 0.6, -0.1], [-114, 1.4, 0.14], [-106, 0.6, -0.08]];
  spots.forEach(([x, z, tilt], i) => {
    const [c1, c2] = cols[i % cols.length];
    umbrella(k, x, z, tilt, c1, c2);
    towel(k, x + 1.3, z - 0.4, 0.15 * (i % 2 ? 1 : -1), c2 === 0xf4efe6 ? 0x2f8fb0 : c2, 0xf4efe6);
    if (i % 2 === 0) lounger(k, x - 1.5, z - 0.2, Math.PI + 0.1, c1);
  });
  sandcastle(k, -137.5, -2.2, 1.0);
  sandcastle(k, -111.5, -2.4, 0.8);
  rowingBoat(k, -145, k.h(-145, 2.5), 2.5, 1.2, 0x3b6b45, true);
  // Reeds along the east shore of the bay and at the beach ends.
  const reedSpots: [number, number][] = [
    [-74, -78], [-74.5, -70], [-75, -62], [-74, -54], [-74.5, -46], [-75, -38], [-76, -31], [-78, -25],
    [-147, -4.5], [-143.5, -5.2], [-98.5, -7.5], [-96.5, -9.8],
  ];
  reedSpots.forEach(([x, z], i) => reeds(k, x, z, 20 + i, Math.max(k.h(x, z), -0.3)));
  // Swim buoys: a ring round the floating platform, outside its clear radius.
  const p = ANCHORS.lakePlatform;
  const buoys: LakeResult['buoys'] = [];
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2;
    buoys.push({ x: p.x + Math.cos(ang) * 10, z: p.z + Math.sin(ang) * 10, color: i % 2 ? 0xf4efe6 : 0xd84a2e });
  }
  for (let i = 1; i < 6; i++) buoys.push({ x: PIER.x + 3.5, z: PIER.z1 - 2 - i * 3.5, color: i % 2 ? 0xf2c14e : 0xf4efe6 });

  const trees: ManualTree[] = [
    { x: -146, z: 6, kind: 'palm', scale: 1.1 },
    { x: -125, z: 6.5, kind: 'palm', scale: 1.0 },
    { x: -104.5, z: 5.5, kind: 'palm', scale: 1.15 },
    { x: -131, z: 6.0, kind: 'bush', scale: 1.0 },
  ];
  const keepouts: Keepout[] = [
    { x: PIER.x, z: (PIER.z0 + 2) / 2, hx: 2, hz: 2.5 },
    { x: -119, z: 2.2, r: 4.5 },
    { x: -125, z: 0.8, hx: 22, hz: 2.6, paved: true },
  ];
  return { trees, keepouts, buoys };
}
