/**
 * Areas further out: tidy blockouts for the bridge, lighthouse, ranch, lake platform, Silly Zone and launch pads.
 */
import * as THREE from 'three';
import { M, T } from './batch';
import { C, barrel, box, fence, hayBale, icon, type Kit } from './props';
import { boxG, coneG, cylG, discG, flagG, rbox, sphereG, torusG } from './shapes';
import { ANCHORS, BRIDGE, CANYON, DECK_Y } from './layout';
import type { Keepout, ManualTree } from './scatter';

export interface AreaResult {
  trees: ManualTree[];
  keepouts: Keepout[];
}

// ───────────────────────────── Bridge ─────────────────────────────

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
  k.col.box(T(x, top - 0.35, zc), 0, 0, 0, hw, 0.35, len / 2);
  // Steel side girders.
  for (const s of [-1, 1]) box(b, 'metal', T(0, 0, 0), x + s * (hw + 0.15), top - 1.5, zc, 0.35, 1.3, len, 0x6e2f28);
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
  }
  for (let i = 1; i < 6; i++) {
    const [hz, hy] = arch(i / 6);
    box(b, 'metal', T(0, 0, 0), x, hy - 0.2, hz, width - 1.2, 0.25, 0.25, 0x2c3036);
  }
  // Stone abutments at both ends.
  for (const ez of [z0 - 1.5, z1 + 1.5]) {
    const ey = k.h(x, ez);
    box(b, 'matte', T(0, 0, 0), x, Math.min(ey, top) - 6, ez, width + 1.6, top - Math.min(ey, top) + 5.4, 3, 0xb5ab9a);
    for (const s of [-1, 1]) {
      box(b, 'matte', T(0, 0, 0), x + s * (hw + 0.5), top - 0.6, ez, 1.0, 1.9, 1.0, 0xc9bfac);
      b.add('glow', boxG(), C.bulb, T(x + s * (hw + 0.5), top + 1.3, ez, 0, 0.4, 0.45, 0.4));
      box(b, 'metal', T(0, 0, 0), x + s * (hw + 0.5), top + 1.75, ez, 0.55, 0.12, 0.55, 0x2c3036);
      k.col.box(T(x + s * (hw + 0.5), top + 0.35, ez), 0, 0, 0, 0.5, 1.0, 0.5);
    }
  }
  // Bungee platform: juts out west from the railing gap.
  const px0 = x - hw;
  const px1 = x - hw - 3.8;
  const pcx = (px0 + px1) / 2;
  box(b, 'paint', T(0, 0, 0), pcx, top - 0.65, gz, 3.8, 0.6, 3.4, 0x5e4634);
  for (let i = 0; i < 6; i++) box(b, 'paint', T(0, 0, 0), pcx, top - 0.07, gz - 1.5 + i * 0.6, 3.7, 0.07, 0.52, tones[i % 4]);
  // Hazard stripe at the edge.
  for (let i = 0; i < 7; i++) box(b, 'paint', T(0, 0, 0), px1 + 0.15, top - 0.04, gz - 1.5 + i * 0.5, 0.3, 0.06, 0.5, i % 2 ? 0x1c1c1c : 0xf2c14e);
  k.col.box(T(pcx, top - 0.35, gz), 0, 0, 0, 1.9, 0.35, 1.7);
  for (const s of [-1, 1]) {
    const rz = gz + s * 1.6;
    box(b, 'metal', T(0, 0, 0), pcx, top + 1.0, rz, 3.8, 0.1, 0.1, 0x2c3036);
    for (const qx of [px0, px1 + 0.3]) box(b, 'metal', T(0, 0, 0), qx, top, rz, 0.12, 1.1, 0.12, 0x2c3036);
    k.col.box(T(pcx, top, rz), 0, 0.55, 0, 1.9, 0.55, 0.08);
    // Gantry posts.
    box(b, 'metal', T(0, 0, 0), px1 + 0.6, top, rz, 0.22, 3.4, 0.22, 0xf2c14e);
  }
  box(b, 'metal', T(0, 0, 0), px1 + 0.6, top + 3.3, gz, 0.3, 0.3, 3.6, 0xf2c14e);
  b.add('gloss', torusG(0.08, 16), 0xd9b34a, T(px1 + 0.6, top + 3.05, gz, 0, 0.22, 1, 0.22, Math.PI / 2));
}

// ───────────────────────────── Lighthouse ─────────────────────────────

function lighthouse(k: Kit): Keepout[] {
  const a = ANCHORS.lighthouse;
  const y = k.h(a.x, a.z);
  const b = k.b;
  b.add('matte', cylG(8), 0xb5ab9a, T(a.x, y - 1, a.z, Math.PI / 8, 3.5, 2.1, 3.5), { aoY: y, aoH: 0.6 });
  const bands = 6;
  const bh = 13.2 / bands;
  for (let i = 0; i < bands; i++) {
    const r0 = 2.6 - (0.7 * i) / bands;
    const r1 = 2.6 - (0.7 * (i + 1)) / bands;
    b.add('paint', cylG(24, r1 / r0), i % 2 ? 0xa8322a : 0xf2eee6, T(a.x, y + 1.1 + i * bh, a.z, 0, r0, bh, r0));
  }
  const gy = y + 1.1 + 13.2;
  b.add('metal', discG(24), 0x3a3f45, T(a.x, gy, a.z, 0, 2.9, 0.25, 2.9));
  b.add('metal', torusG(0.05, 48, Math.PI * 2, 2.8), 0x2c3036, T(a.x, gy + 1.05, a.z));
  for (let i = 0; i < 16; i++) {
    const ang = (i / 16) * Math.PI * 2;
    box(b, 'metal', T(0, 0, 0), a.x + Math.cos(ang) * 2.8, gy + 0.25, a.z + Math.sin(ang) * 2.8, 0.06, 0.82, 0.06, 0x2c3036);
  }
  b.add('glass', cylG(16), 0x9fb8c8, T(a.x, gy + 0.25, a.z, 0, 1.35, 2.1, 1.35));
  b.add('glow', cylG(12), 0xfff0c8, T(a.x, gy + 0.6, a.z, 0, 0.55, 1.2, 0.55));
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    box(b, 'metal', T(0, 0, 0), a.x + Math.cos(ang) * 1.37, gy + 0.25, a.z + Math.sin(ang) * 1.37, 0.08, 2.1, 0.08, 0x2c3036);
  }
  b.add('paint', coneG(24), 0xa8322a, T(a.x, gy + 2.35, a.z, 0, 1.75, 1.5, 1.75));
  b.add('gloss', sphereG(1), 0xd9b34a, T(a.x, gy + 3.95, a.z, 0, 0.22, 0.22, 0.22));
  // Door facing the yaw direction.
  const dm = M(T(a.x, y + 1.1, a.z, a.yaw), T(0, 0, 2.5));
  b.add('paint', rbox(1.1, 2.1, 0.3, 0.05), 0x2f5d7c, dm);
  k.col.cyl(a.x, y - 1, a.z, 1.05, 3.5);
  k.col.cyl(a.x, y + 1.1, a.z, 6.6, 2.5);
  k.col.cyl(a.x, gy, a.z, 0.125, 2.9);
  k.col.cyl(a.x, gy, a.z, 2.2, 1.4);
  // Keeper's hut.
  const hx = a.x - 9;
  const hz = a.z - 8;
  const hy = k.h(hx, hz);
  const hm = T(hx, hy, hz, a.yaw);
  box(b, 'matte', hm, 0, -1, 0, 4.4, 1.2, 3.8, 0xb5ab9a);
  b.add('matte', boxG(), 0xf2eee6, M(hm, T(0, 0.2, 0, 0, 4.2, 2.6, 3.6)), { aoY: hy, aoH: 1 });
  for (const s of [-1, 1]) b.add('paint', boxG(), 0xa8322a, M(hm, T(0, 2.8 + 0.45, s * 0.95, 0, 4.7, 0.18, 2.3, s * 0.42)));
  k.col.box(hm, 0, 1.5, 0, 2.1, 1.5, 1.8);
  return [{ x: a.x, z: a.z, r: 5 }, { x: hx, z: hz, r: 3.5 }];
}

// ───────────────────────────── Ranch ─────────────────────────────

function ranch(k: Kit): Keepout[] {
  const a = ANCHORS.ranch;
  const b = k.b;
  const rail = { post: 0xd9cdb6, rail: 0xefe7d6, height: 1.25 };
  const xL = a.x - 18;
  const xR = a.x + 18;
  const zT = a.z - 14;
  const zB = a.z + 14;
  fence(k, [[xR, a.z - 3], [xR, zT], [xL, zT], [xL, a.z - 3]], rail);
  fence(k, [[xL, a.z + 3], [xL, zB], [xR, zB], [xR, a.z + 3]], rail);
  // Barn (gable faces the paddock).
  const bx = a.x - 27;
  const bz = a.z;
  const by = k.h(bx, bz);
  const m = T(bx, by, bz, Math.PI / 2);
  const w = 12;
  const d = 11;
  const wh = 5.2;
  box(b, 'matte', m, 0, -1.5, 0, w + 0.4, 1.6, d + 0.4, 0xa79e8e);
  b.add('matte', boxG(), 0x9a3e2e, M(m, T(0, 0, 0, 0, w, wh, d)), { aoY: by, aoH: 1.4, ao: 0.3 });
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(w / 2 - 2.8, 2.6);
  shape.lineTo(0, 3.9);
  shape.lineTo(-w / 2 + 2.8, 2.6);
  shape.closePath();
  const gable = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
  b.add('matte', gable, 0x9a3e2e, M(m, T(0, wh, 0)));
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
  // Trim, big doors with white X braces, loft door.
  for (const s of [-1, 1]) box(b, 'paint', m, (s * w) / 2, 0, d / 2, 0.3, wh, 0.3, 0xf2eee6);
  const fm = M(m, T(0, 0, d / 2 + 0.02));
  for (const s of [-1, 1]) {
    const dm = M(fm, T(s * 1.55, 0, 0));
    box(b, 'paint', dm, 0, 0, 0, 3.0, 3.8, 0.1, 0x7e3326);
    box(b, 'paint', dm, 0, 0, 0.06, 3.0, 0.16, 0.06, 0xf2eee6);
    box(b, 'paint', dm, 0, 3.64, 0.06, 3.0, 0.16, 0.06, 0xf2eee6);
    for (const sx of [-1.42, 1.42]) box(b, 'paint', dm, sx, 0, 0.06, 0.16, 3.8, 0.06, 0xf2eee6);
    for (const r of [0.9, -0.9]) b.add('paint', boxG(), 0xf2eee6, M(dm, T(0, 1.9, 0.07, 0, 0.14, 4.6, 0.05, 0, r)));
  }
  box(b, 'paint', fm, 0, 5.6, 0, 1.9, 1.6, 0.1, 0x30251e);
  box(b, 'paint', fm, 0, 5.5, 0.03, 2.2, 1.8, 0.05, 0xf2eee6);
  box(b, 'paint', fm, 0, 5.6, 0.07, 1.9, 1.6, 0.05, 0x5a2a20);
  k.col.box(m, 0, wh / 2, 0, w / 2, wh / 2, d / 2);
  // Hay, trough, barrels, a sign arch at the east gate.
  hayBale(k, bx + 7, bz - 8, 0.2);
  hayBale(k, bx + 8.4, bz - 7.2, 1.1);
  hayBale(k, bx + 6.4, bz + 8.5, 0.5);
  const tx = xL + 2;
  const tz = zB - 2.5;
  const ty = k.h(tx, tz);
  box(b, 'paint', T(tx, ty, tz, 0.1), 0, 0, 0, 2.6, 0.7, 0.9, 0x7a5236);
  box(b, 'gloss', T(tx, ty, tz, 0.1), 0, 0.62, 0, 2.4, 0.06, 0.7, 0x4f9fae);
  k.col.box(T(tx, ty, tz, 0.1), 0, 0.35, 0, 1.3, 0.35, 0.45);
  barrel(k, bx + 8, bz + 4.2);
  for (const s of [-1, 1]) {
    const gx = xR;
    const gzz = a.z + s * 3.3;
    const gy = k.h(gx, gzz);
    b.add('paint', rbox(0.3, 4.2, 0.3, 0.05), 0x6a4630, T(gx, gy, gzz));
    k.col.cyl(gx, gy, gzz, 2.1, 0.2);
  }
  const gm = T(xR, k.h(xR, a.z) + 3.9, a.z, Math.PI / 2);
  b.add('paint', rbox(7.4, 0.35, 0.35, 0.05), 0x6a4630, gm);
  b.add('paint', rbox(2.2, 1.1, 0.1, 0.05), 0x6a4630, M(gm, T(0, -1.3, 0)));
  icon(b, M(gm, T(0, -0.75, 0.06, 0, 1.2, 1.2, 1)), 'horse');
  icon(b, M(gm, T(0, -0.75, -0.06, Math.PI, 1.2, 1.2, 1)), 'horse');
  return [{ x: a.x, z: a.z, hx: 19, hz: 15 }, { x: bx, z: bz, hx: d / 2 + 2, hz: w / 2 + 2 }];
}

// ───────────────────────────── Lake platform ─────────────────────────────

function lakePlatform(k: Kit): void {
  const a = ANCHORS.lakePlatform;
  const top = a.y ?? 0.75;
  const b = k.b;
  const m = T(a.x, 0, a.z, a.yaw);
  box(b, 'paint', m, 0, top - 0.42, 0, 7, 0.36, 7, 0x5e4634);
  for (let i = 0; i < 12; i++) box(b, 'paint', m, 0, top - 0.07, -3.3 + i * 0.6, 6.9, 0.07, 0.54, [0xa67c56, 0x9b7350, 0x936d4b][i % 3]);
  for (const s of [-1, 1]) b.add('paint', cylG(16), 0xe6e1d6, M(m, T(s * 2.6, 0.05, -3.4, 0, 0.45, 6.8, 0.45, Math.PI / 2)));
  for (const [cx, cz] of [[-3.3, -3.3], [3.3, -3.3], [-3.3, 3.3], [3.3, 3.3]]) box(b, 'paint', m, cx, top - 0.1, cz, 0.22, 1.2, 0.22, 0x6a4630);
  for (const [x0, z0, x1, z1] of [[-3.3, -3.3, 3.3, -3.3], [3.3, -3.3, 3.3, 3.3], [-3.3, -3.3, -3.3, 3.3]]) {
    box(b, 'paint', m, (x0 + x1) / 2, top + 0.9, (z0 + z1) / 2, Math.abs(x1 - x0) + 0.1, 0.08, Math.abs(z1 - z0) + 0.1, 0xefe7d6);
  }
  // Ladder on the open side, life ring, flag.
  for (const s of [-0.4, 0.4]) box(b, 'metal', m, s, -1.2, 3.55, 0.06, top + 1.9, 0.06, 0xd0d0d0);
  for (let i = 0; i < 4; i++) box(b, 'metal', m, 0, -0.6 + i * 0.45, 3.55, 0.8, 0.05, 0.05, 0xd0d0d0);
  b.add('paint', torusG(0.12, 24), 0xf4efe6, M(m, T(-3.42, top + 0.45, 0, Math.PI / 2, 0.45, 0.45, 0.45, Math.PI / 2)));
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2;
    box(b, 'paint', m, -3.45, top + 0.42 + Math.sin(ang) * 0.45, Math.cos(ang) * 0.45, 0.1, 0.14, 0.14, 0xc8433a);
  }
  const fm = M(m, T(2.8, top, -2.8));
  b.add('metal', cylG(8), 0xe8e6e0, M(fm, T(0, 0, 0, 0, 0.06, 4, 0.06)));
  b.add('cloth', flagG(), 0xf2c14e, M(fm, T(0.05, 3.9, 0, 0.4, 1.3, 0.8, 1)));
  k.col.box(m, 0, top - 0.3, 0, 3.5, 0.3, 3.5);
  for (const [x0, z0, x1, z1] of [[-3.3, -3.3, 3.3, -3.3], [3.3, -3.3, 3.3, 3.3], [-3.3, -3.3, -3.3, 3.3]]) {
    k.col.box(m, (x0 + x1) / 2, top + 0.5, (z0 + z1) / 2, Math.abs(x1 - x0) / 2 + 0.1, 0.5, Math.abs(z1 - z0) / 2 + 0.1);
  }
}

// ───────────────────────────── Silly Zone & launch pads ─────────────────────────────

function sillyZone(k: Kit): Keepout[] {
  const a = ANCHORS.sillyZone;
  const y = k.h(a.x, a.z) + 0.05;
  const r = 18;
  const sectors = 24;
  for (let s = 0; s < sectors; s++) {
    const g = new THREE.RingGeometry(2.4, r, 3, 1, (s / sectors) * Math.PI * 2, (Math.PI * 2) / sectors).rotateX(-Math.PI / 2);
    k.b.add('rubber', g, s % 2 ? 0xeee2c6 : 0x5b3f7c, T(a.x, y, a.z));
    g.dispose();
  }
  const c = new THREE.CircleGeometry(2.4, 24).rotateX(-Math.PI / 2);
  k.b.add('rubber', c, 0xf2c14e, T(a.x, y, a.z));
  c.dispose();
  k.b.add('rubber', torusG(0.35, 128, Math.PI * 2, r + 0.3), 0xf2c14e, T(a.x, y + 0.1, a.z));
  // Inflatable bollards around the edge.
  const cols = [0xd85a8c, 0x2f8fb0, 0xf2c14e, 0x8ac04a];
  for (let i = 0; i < 10; i++) {
    const ang = (i / 10) * Math.PI * 2 + 0.15;
    const bx = a.x + Math.cos(ang) * (r + 2);
    const bz = a.z + Math.sin(ang) * (r + 2);
    const by = k.h(bx, bz);
    const col = cols[i % cols.length];
    k.b.add('gloss', cylG(16), col, T(bx, by, bz, 0, 0.55, 1.3, 0.55), { aoY: by, aoH: 0.4, ao: 0.3 });
    k.b.add('gloss', sphereG(2), col, T(bx, by + 1.3, bz, 0, 0.55, 0.55, 0.55));
    k.b.add('gloss', torusG(0.12, 20), 0xf4efe6, T(bx, by + 0.7, bz, 0, 0.56, 1, 0.56));
    k.col.cyl(bx, by, bz, 0.9, 0.55);
  }
  // Launch pads: slate mat with bright chevrons pointing along the anchor yaw.
  const l = ANCHORS.launchPads;
  const ly = k.h(l.x, l.z) + 0.05;
  const lm = T(l.x, ly, l.z, l.yaw);
  k.b.add('rubber', rbox(18, 0.06, 18, 0.03), 0x48586a, lm);
  for (let row = -1; row <= 1; row++) {
    for (let i = 0; i < 3; i++) {
      for (const s of [-1, 1]) {
        k.b.add('paint', boxG(), 0xf4efe6, M(lm, T(row * 5 + s * 0.9, 0.04, -4 + i * 3.2 + 0.6, s * 0.75, 0.45, 0.03, 2.6)));
      }
    }
  }
  return [{ x: a.x, z: a.z, r: r + 3.5, paved: true }, { x: l.x, z: l.z, hx: 9.5, hz: 9.5, paved: true }];
}

export function buildAreas(k: Kit): AreaResult {
  const keepouts: Keepout[] = [];
  bridge(k);
  keepouts.push(...lighthouse(k));
  keepouts.push(...ranch(k));
  lakePlatform(k);
  keepouts.push(...sillyZone(k));
  keepouts.push({ x: BRIDGE.x, z: (BRIDGE.z0 + BRIDGE.z1) / 2, hx: 6, hz: (BRIDGE.z0 - BRIDGE.z1) / 2 + 2 });
  keepouts.push({ x: ANCHORS.bungeeLanding.x, z: CANYON.z, hx: 20, hz: 4 });
  const trees: ManualTree[] = [
    { x: ANCHORS.ranch.x - 30, z: ANCHORS.ranch.z - 14, kind: 'oak', scale: 1.2 },
    { x: ANCHORS.ranch.x - 31, z: ANCHORS.ranch.z + 14, kind: 'oak', scale: 1.1 },
  ];
  return { trees, keepouts };
}
