/**
 * The lighthouse on the northern headland, now climbable on foot: stone steps up to the plinth by
 * the door, then a railed spiral walkway (three turns, ~14° slope) that winds round the tower and
 * swings out past the gallery's edge to a landing level with the gallery deck. Plus the keeper's
 * hut with a picket garden, a gravel apron, benches, a coin telescope and rocks.
 *
 * The weak-eye stepping-stone spiral (secrets stream) circles the tower at r ≈ 4.9 m (inner edge
 * 4.1 m): the plinth (r 3.75) and the walkway (outer edge ≤ 3.95 m) stay inside it.
 */
import { M, T } from '../batch';
import { C, bench, box, fence, lamp, type Kit } from '../props';
import { boxG, coneG, cylG, discG, rbox, sphereG, torusG } from '../shapes';
import { ANCHORS } from '../layout';
import type { Keepout, ManualTree } from '../scatter';
import { groundDisc } from '../core-areas';
import { pebbles } from './common';

/** Tower dimensions shared with the gem spots (gallery deck at y + 14.3). */
export const LH = {
  plinthR: 3.75,
  plinthTop: 1.1,
  towerH: 13.2,
  r0: 2.6,
  r1: 1.9,
  galleryR: 2.9,
  /** Walkway: start angle (world, cos→x sin→z), turns, width, landing span after the end. */
  start: Math.PI,
  turns: 3,
  width: 1.0,
  outerR: 2.95,
} as const;

export interface LighthouseResult {
  trees: ManualTree[];
  keepouts: Keepout[];
  /** Lantern centre (for the rotating beam). */
  lamp: { x: number; y: number; z: number };
  /** Walkway centreline samples (for tests): world points with the walking surface height. */
  walkway: { x: number; y: number; z: number; r0: number; r1: number }[];
}

const STONE = 0xc9bfac;
const RED = 0xa8322a;
const CREAM = 0xf2eee6;

export function buildLighthouse(k: Kit): LighthouseResult {
  const a = ANCHORS.lighthouse;
  const y = k.h(a.x, a.z);
  const b = k.b;
  const base = y + LH.plinthTop;
  const towerR = (yy: number): number => LH.r0 - ((LH.r0 - LH.r1) * Math.min(1, Math.max(0, yy - base))) / LH.towerH;
  const doorAng = Math.atan2(Math.cos(a.yaw), Math.sin(a.yaw));

  // ── Gravel apron and plinth with steps at the door ──
  groundDisc(k, a.x, a.z, 3.6, 7.2, 0.06, (x, z) => (Math.sin(x * 2.3) * Math.cos(z * 2.9) > 0.3 ? 0xb9ae96 : 0xc8bda3), 3, 48);
  groundDisc(k, a.x, a.z, 7.2, 7.6, 0.06, () => 0x9a9284, 1, 48);
  b.add('matte', cylG(20), 0xb5ab9a, T(a.x, y - 1, a.z, Math.PI / 8, LH.plinthR, 2.1, LH.plinthR), { aoY: y, aoH: 0.6 });
  b.add('matte', cylG(20), STONE, T(a.x, base - 0.12, a.z, Math.PI / 8, LH.plinthR + 0.1, 0.14, LH.plinthR + 0.1));
  k.col.cyl(a.x, y - 1, a.z, (LH.plinthTop + 1) / 2, LH.plinthR);
  const sm = T(a.x, y, a.z, a.yaw);
  // Local +Z of `sm` points from the axis out through the door.
  for (let i = 0; i < 4; i++) {
    const top = (LH.plinthTop * (4 - i)) / 4;
    const zc = LH.plinthR + 0.16 + i * 0.32;
    box(b, 'matte', sm, 0, -0.4, zc, 2.0, top + 0.4, 0.34, i % 2 ? STONE : 0xbdb3a0);
    k.col.box(sm, 0, (top - 0.4) / 2, zc, 1.0, (top + 0.4) / 2, 0.17);
  }
  for (const s of [-1, 1]) box(b, 'matte', sm, s * 1.12, -0.4, LH.plinthR + 0.65, 0.24, LH.plinthTop + 0.75, 1.3, 0xa79e8e);

  // ── Tower: striped bands, door, small windows ──
  const bands = 6;
  const bh = LH.towerH / bands;
  for (let i = 0; i < bands; i++) {
    const r0 = LH.r0 - ((LH.r0 - LH.r1) * i) / bands;
    const r1 = LH.r0 - ((LH.r0 - LH.r1) * (i + 1)) / bands;
    b.add('paint', cylG(24, r1 / r0), i % 2 ? RED : CREAM, T(a.x, base + i * bh, a.z, 0, r0, bh, r0));
  }
  const dm = M(T(a.x, base, a.z, a.yaw), T(0, 0, LH.r0 - 0.05));
  b.add('paint', rbox(1.2, 2.2, 0.3, 0.05), CREAM, dm);
  b.add('paint', rbox(1.0, 2.05, 0.34, 0.05), 0x2f5d7c, dm);
  b.add('gloss', sphereG(0), 0xd9b34a, M(dm, T(0.32, 1.0, 0.2, 0, 0.06, 0.06, 0.06)));
  b.add('paint', cylG(16, 1, false), CREAM, M(dm, T(0, 2.25, 0.05, 0, 0.75, 0.12, 0.3)));
  for (const [ang, hh] of [[doorAng + 2.1, 5.2], [doorAng - 2.3, 8.6], [doorAng + 0.4, 11.4]] as const) {
    const r = towerR(base + hh);
    const wm = T(a.x + Math.cos(ang) * r, base + hh, a.z + Math.sin(ang) * r, Math.atan2(Math.cos(ang), Math.sin(ang)));
    b.add('paint', rbox(0.6, 0.9, 0.12, 0.04), CREAM, wm);
    b.add('window', boxG(), 0xb30000, M(wm, T(0, 0.12, 0.04, 0, 0.4, 0.66, 0.06)));
  }
  k.col.cyl(a.x, base, a.z, LH.towerH / 2, (LH.r0 + LH.r1) / 2 + 0.05);

  // ── Gallery, rail with a gap at the walkway landing, lantern ──
  const gy = base + LH.towerH;
  const deck = gy + 0.25;
  const endAng = LH.start + LH.turns * Math.PI * 2;
  b.add('metal', discG(28), 0x3a3f45, T(a.x, gy, a.z, 0, LH.galleryR, 0.25, LH.galleryR));
  b.add('metal', cylG(28, 1, true), 0x2c3036, T(a.x, gy - 0.35, a.z, 0, LH.galleryR, 0.35, LH.galleryR));
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2;
    const bm = T(a.x + Math.cos(ang) * (LH.r1 + 0.35), gy - 1.0, a.z + Math.sin(ang) * (LH.r1 + 0.35), Math.atan2(Math.cos(ang), Math.sin(ang)));
    b.add('metal', boxG(), 0x2c3036, M(bm, T(0, 0, 0.1, 0, 0.12, 1.0, 0.9, 0.7)));
  }
  const gapFrom = endAng - 0.55;
  const gapTo = endAng + 0.35;
  const railArc = Math.PI * 2 - (gapTo - gapFrom);
  b.add('metal', torusG(0.05, 40, railArc, LH.galleryR - 0.1), 0x2c3036, T(a.x, deck + 0.85, a.z, -gapFrom));
  b.add('metal', torusG(0.035, 40, railArc, LH.galleryR - 0.1), 0x2c3036, T(a.x, deck + 0.42, a.z, -gapFrom));
  for (let i = 0; i <= 14; i++) {
    const ang = gapTo + (i / 14) * railArc;
    box(b, 'metal', T(0, 0, 0), a.x + Math.cos(ang) * (LH.galleryR - 0.1), deck - 0.05, a.z + Math.sin(ang) * (LH.galleryR - 0.1), 0.06, 0.92, 0.06, 0x2c3036);
  }
  b.add('glass', cylG(16), 0x9fb8c8, T(a.x, deck, a.z, 0, 1.35, 2.1, 1.35));
  b.add('glow', cylG(12), 0xfff0c8, T(a.x, deck + 0.35, a.z, 0, 0.55, 1.2, 0.55));
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    box(b, 'metal', T(0, 0, 0), a.x + Math.cos(ang) * 1.37, deck, a.z + Math.sin(ang) * 1.37, 0.08, 2.1, 0.08, 0x2c3036);
  }
  b.add('metal', cylG(16), 0x2c3036, T(a.x, deck + 2.05, a.z, 0, 1.5, 0.12, 1.5));
  b.add('paint', coneG(24), RED, T(a.x, deck + 2.1, a.z, 0, 1.75, 1.5, 1.75));
  b.add('gloss', sphereG(1), 0xd9b34a, T(a.x, deck + 3.7, a.z, 0, 0.22, 0.22, 0.22));
  b.add('metal', cylG(6), 0x2c3036, T(a.x, deck + 3.9, a.z, 0, 0.03, 0.9, 0.03));
  k.col.cyl(a.x, gy, a.z, 0.125, LH.galleryR);
  k.col.cyl(a.x, deck, a.z, 1.3, 1.4);

  // ── Spiral walkway ──
  const totalRise = deck - base;
  const segPerTurn = 28;
  const n = LH.turns * segPerTurn;
  const span = endAng - LH.start;
  const swing = 3.6; // radians before the end where the walkway swings out past the gallery edge
  const innerAt = (ang: number, yy: number): number => {
    const tr = towerR(yy) + 0.05;
    const u = Math.min(1, Math.max(0, (ang - (endAng - swing)) / 0.7));
    return tr + (LH.outerR - tr) * (u * u * (3 - 2 * u));
  };
  const walkway: LighthouseResult['walkway'] = [];
  const pt = (ang: number, yy: number, r: number): [number, number, number] => [a.x + Math.cos(ang) * r, yy, a.z + Math.sin(ang) * r];
  const seg = (ang0: number, ang1: number, y0: number, y1: number, last: boolean): void => {
    const am = (ang0 + ang1) / 2;
    const ri = innerAt(am, (y0 + y1) / 2);
    const rm = ri + LH.width / 2;
    const p0 = pt(ang0, y0, rm);
    const p1 = pt(ang1, y1, rm);
    const len = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]);
    const yaw = Math.atan2(p1[0] - p0[0], p1[2] - p0[2]);
    const pitch = -Math.atan2(y1 - y0, len);
    const cx = (p0[0] + p1[0]) / 2;
    const cz = (p0[2] + p1[2]) / 2;
    const cy = (y0 + y1) / 2;
    // Local frame: +Z along the walk, +X outward (to the right when climbing anticlockwise in XZ).
    const m = T(cx, cy, cz, yaw, 1, 1, 1, pitch);
    b.add('matte', boxG(), 0xbdb3a0, M(m, T(0, -0.28, 0, 0, LH.width, 0.28, len + 0.06)));
    b.add('paint', boxG(), 0x8e8576, M(m, T(0, -0.01, len / 2 - 0.05, 0, LH.width, 0.03, 0.09)));
    k.col.box(m, 0, -0.14, 0, LH.width / 2, 0.14, len / 2 + 0.06);
    // Rail on the outer edge: post + top rail; a collider keeps walkers on the walkway.
    const side = Math.sign(Math.cos(yaw) * Math.cos(am) - Math.sin(yaw) * Math.sin(am)) || 1;
    const ox = (side * LH.width) / 2;
    box(b, 'metal', m, ox, 0, -len / 2, 0.05, 0.95, 0.05, 0x2c3036);
    b.add('metal', boxG(), 0x2c3036, M(m, T(ox, 0.9, 0, 0, 0.06, 0.06, len + 0.04)));
    b.add('metal', boxG(), 0x2c3036, M(m, T(ox, 0.48, 0, 0, 0.03, 0.03, len + 0.04)));
    if (!last) k.col.box(m, ox, 0.5, 0, 0.05, 0.5, len / 2);
    walkway.push({ x: cx, y: cy, z: cz, r0: ri, r1: ri + LH.width });
  };
  for (let i = 0; i < n; i++) {
    const ang0 = LH.start + (span * i) / n;
    const ang1 = LH.start + (span * (i + 1)) / n;
    seg(ang0, ang1, base + (totalRise * i) / n, base + (totalRise * (i + 1)) / n, false);
  }
  // Level landing beside the rail gap, then onto the deck.
  for (let i = 0; i < 3; i++) seg(endAng + i * 0.14, endAng + (i + 1) * 0.14, deck, deck, i === 2);
  // Brackets under the walkway every half turn.
  for (let i = 1; i < LH.turns * 2; i++) {
    const ang = LH.start + (span * i) / (LH.turns * 2);
    const yy = base + (totalRise * i) / (LH.turns * 2);
    const ri = innerAt(ang, yy);
    if (ri > towerR(yy) + 0.3) continue;
    const bm = T(a.x + Math.cos(ang) * ri, yy - 0.28, a.z + Math.sin(ang) * ri, Math.atan2(Math.cos(ang), Math.sin(ang)));
    b.add('metal', boxG(), 0x2c3036, M(bm, T(0, -0.7, 0.35, 0, 0.08, 0.7, 0.7, -0.75)));
  }
  // Slim steel posts under the swung-out top section, down to the gallery brackets' level.
  for (const da of [3.1, 2.2, 1.3, 0.5]) {
    const ang = endAng - da;
    const yy = deck - da * (totalRise / span);
    const [px, , pz] = pt(ang, yy, LH.outerR + LH.width / 2);
    box(b, 'metal', T(0, 0, 0), px, yy - 2.2, pz, 0.08, 1.95, 0.08, 0x2c3036);
  }

  // ── Keeper's hut with a picket garden ──
  const hx = a.x - 9;
  const hz = a.z - 8;
  const hy = k.h(hx, hz);
  const hm = T(hx, hy, hz, a.yaw);
  box(b, 'matte', hm, 0, -1, 0, 4.4, 1.2, 3.8, 0xb5ab9a);
  b.add('matte', boxG(), CREAM, M(hm, T(0, 0.2, 0, 0, 4.2, 2.6, 3.6)), { aoY: hy, aoH: 1 });
  for (const s of [-1, 1]) b.add('paint', boxG(), RED, M(hm, T(0, 2.8 + 0.45, s * 0.95, 0, 4.7, 0.18, 2.3, s * 0.42)));
  b.add('paint', boxG(), 0x7e2a24, M(hm, T(0, 3.85, 0, 0, 4.8, 0.14, 0.3)));
  b.add('paint', rbox(0.9, 1.9, 0.14, 0.04), 0x2f5d7c, M(hm, T(0.8, 0.2, 1.82)));
  b.add('paint', rbox(1.0, 0.9, 0.12, 0.03), CREAM, M(hm, T(-1.0, 1.1, 1.82)));
  b.add('window', boxG(), 0xb30000, M(hm, T(-1.0, 1.18, 1.86, 0, 0.8, 0.7, 0.05)));
  b.add('matte', rbox(0.5, 1.4, 0.5, 0.04), 0x9a9284, M(hm, T(1.4, 2.6, -0.6)));
  k.col.box(hm, 0, 1.5, 0, 2.1, 1.5, 1.8);
  const gp = (lx: number, lz: number): [number, number] => {
    const s = Math.sin(a.yaw);
    const c = Math.cos(a.yaw);
    return [hx + lx * c + lz * s, hz - lx * s + lz * c];
  };
  fence(k, [gp(-2.6, 2.4), gp(-2.6, 4.6), gp(2.6, 4.6), gp(2.6, 3.4)], { picket: true, height: 0.8 });
  for (let i = 0; i < 5; i++) {
    const [fx, fz] = gp(-2.0 + i * 0.8, 3.6);
    b.add('matte', sphereG(1), i % 2 ? C.leaf : C.leafDark, T(fx, k.h(fx, fz) + 0.25, fz, i, 0.35, 0.3, 0.35));
    b.add('paint', sphereG(0), [0xfff2c8, 0xf0a8c0, 0xf2c14e][i % 3], T(fx, k.h(fx, fz) + 0.6, fz, 0, 0.09, 0.09, 0.09));
  }

  // ── Headland furniture: benches facing the sea, a coin telescope, lamps by the path ──
  bench(k, a.x + 1.5, a.z - 10, Math.PI + 0.3);
  bench(k, a.x - 6, a.z + 8.6, 0.2);
  const tx = a.x + 5.5;
  const tz = a.z - 10.5;
  const ty = k.h(tx, tz);
  const tm = T(tx, ty, tz, Math.PI * 0.85);
  b.add('metal', cylG(10), 0x2f5d7c, M(tm, T(0, 0, 0, 0, 0.12, 1.1, 0.12)));
  b.add('metal', cylG(10), 0x2c3036, M(tm, T(0, 0, 0, 0, 0.3, 0.1, 0.3)));
  b.add('gloss', rbox(0.34, 0.34, 0.5, 0.06), 0x2f5d7c, M(tm, T(0, 1.05, 0, 0, 1, 1, 1, -0.25)));
  b.add('metal', cylG(10), 0xd9b34a, M(tm, T(0, 1.3, 0.25, 0, 0.12, 0.35, 0.12, Math.PI / 2 - 0.25)));
  k.col.cyl(tx, ty, tz, 0.7, 0.25);
  lamp(k, a.x + 7.5, a.z - 3.8);
  lamp(k, a.x + 2.0, a.z + 7.8);
  pebbles(k, a.x - 7.8, a.z + 3.2, 1.4, 9, 3);
  pebbles(k, a.x + 9, a.z - 9.5, 1.6, 10, 5);

  const trees: ManualTree[] = [
    { x: a.x - 12, z: a.z + 4, kind: 'rock', scale: 1.4 },
    { x: a.x - 13, z: a.z + 6.5, kind: 'rock', scale: 0.7 },
    { x: a.x - 3, z: a.z - 13, kind: 'rock', scale: 1.25 },
    { x: a.x + 12.5, z: a.z - 9, kind: 'rock', scale: 1.3 },
    { x: a.x + 13, z: a.z - 6.5, kind: 'rock', scale: 0.6 },
    { x: a.x - 14, z: a.z - 3, kind: 'bush', scale: 1.1 },
    { x: a.x + 8, z: a.z + 11, kind: 'bush', scale: 1.0 },
    { x: a.x - 11, z: a.z - 14, kind: 'pine', scale: 0.9 },
  ];
  const keepouts: Keepout[] = [
    { x: a.x, z: a.z, r: 7.6, paved: true },
    { x: hx, z: hz, r: 4.8 },
    { x: tx, z: tz, r: 1.2 },
  ];
  return { trees, keepouts, lamp: { x: a.x, y: deck + 0.95, z: a.z }, walkway };
}
