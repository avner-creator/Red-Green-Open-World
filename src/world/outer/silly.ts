/**
 * Silly Zone surroundings only (the props inside the anchor radius belong to the activity stream):
 * a bold checkerboard ring and zig-zag band outside the old play disc, a wobbly candy-striped picket
 * fence with an inflatable arch over the entrance facing the south road, crooked "this way? that
 * way?" signposts, giant inflatable rubber ducks and pinwheels. Bright-on-dark everywhere so it reads
 * by brightness alone.
 */
import * as THREE from 'three';
import { M, T } from '../batch';
import { bunting, icon, type Kit } from '../props';
import { boxG, coneG, cylG, rbox, sphereG, torusG } from '../shapes';
import { ANCHORS } from '../layout';
import type { Keepout, ManualTree } from '../scatter';
import { groundDisc } from '../core-areas';

/** Ring geometry around the anchor (metres from its centre). */
export const SILLY_RING = { inner: 18.8, outer: 23.4, fence: 26.5 } as const;
/** Extra openings in the fence (centre angle, world cos→x sin→z; half width, radians). Spans near roads are left open too. */
export const SILLY_GAPS: readonly [number, number][] = [[Math.PI * 0.95, 0.12], [0.12, 0.12]];
/** Inflatable welcome arch across the end of the south road (centre, yaw along the road, half span). */
export const SILLY_ARCH = { x: 6.6, z: 71.5, yaw: Math.atan2(2, 14), half: 4.95 } as const;

const CREAM = 0xf6eedb;
const PLUM = 0x3e2458;
const YEL = 0xf2c14e;
const PINK = 0xe0559a;

function inGap(ang: number, pad = 0): boolean {
  return SILLY_GAPS.some(([c, h]) => Math.abs(Math.atan2(Math.sin(ang - c), Math.cos(ang - c))) < h + pad);
}

function duck(k: Kit, x: number, z: number, yaw: number, s: number): void {
  const y = k.h(x, z);
  const m = T(x, y, z, yaw, s, s, s);
  const b = k.b;
  b.add('gloss', sphereG(2), 0xf5cf38, M(m, T(0, 0.95, 0, 0, 1.25, 0.85, 1.0)), { aoY: y, aoH: 0.5, ao: 0.35 });
  b.add('gloss', sphereG(2), 0xf5cf38, M(m, T(0, 1.95, 0.75, 0, 0.62, 0.6, 0.6)));
  b.add('gloss', sphereG(1), 0xf5cf38, M(m, T(0, 1.4, -1.05, 0, 0.4, 0.35, 0.35)));
  b.add('gloss', sphereG(1), 0xf07a28, M(m, T(0, 1.85, 1.33, 0, 0.36, 0.13, 0.3)));
  for (const sx of [-1, 1]) {
    b.add('gloss', sphereG(1), 0xffffff, M(m, T(sx * 0.27, 2.15, 1.2, 0, 0.17, 0.2, 0.08)));
    b.add('gloss', sphereG(0), 0x111111, M(m, T(sx * 0.27, 2.17, 1.27, 0, 0.08, 0.1, 0.04)));
  }
  k.col.sphere(x, y + 0.95 * s, z, 1.0 * s);
  k.col.sphere(x + Math.sin(yaw) * 0.75 * s, y + 1.95 * s, z + Math.cos(yaw) * 0.75 * s, 0.55 * s);
}

/** A wobbly post with arrow boards pointing every which way (one straight up, one at the ground). */
function crookedSign(k: Kit, x: number, z: number, seed: number): void {
  const y = k.h(x, z);
  const lean = 0.12 * (seed % 2 ? 1 : -1);
  const pm = T(x, y, z, seed * 1.3, 1, 1, 1, lean * 0.6, lean);
  const b = k.b;
  b.add('paint', rbox(0.18, 3.4, 0.18, 0.04), 0x6a4630, pm, { aoY: y, aoH: 0.5 });
  b.add('gloss', sphereG(1), PINK, M(pm, T(0, 3.5, 0, 0, 0.24, 0.24, 0.24)));
  const arms: [number, number, number, number][] = [
    [2.9, 0.4, 0, YEL], [2.35, 2.6, 0.5, 0x2f8fb0], [1.8, -1.2, -0.45, PINK], [1.3, 3.8, 0.25, 0x8ac04a],
  ];
  arms.forEach(([hy, yaw, roll, colr], i) => {
    const am = M(pm, T(0, hy, 0, yaw + seed, 1, 1, 1, 0, roll));
    b.add('paint', rbox(1.1, 0.42, 0.08, 0.03), CREAM, M(am, T(0.62, -0.21, 0)));
    b.add('paint', rbox(1.0, 0.32, 0.12, 0.03), colr, M(am, T(0.62, -0.16, 0)));
    b.add('paint', coneG(3), colr, M(am, T(1.25, 0, 0, 0, 0.27, 0.24, 0.05, 0, -Math.PI / 2)));
    if (i === 1) b.add('paint', torusG(0.04, 16, Math.PI * 1.6, 0.12), CREAM, M(am, T(0.6, 0.0, 0.07, 0, 1, 1, 1, Math.PI / 2)));
    else icon(b, M(am, T(0.6, 0.0, 0.0, 0, 0.42, 0.42, 1)), 'star', CREAM);
  });
  // One arm pointing straight up and one at the ground (silly!).
  b.add('paint', rbox(0.3, 1.0, 0.1, 0.03), YEL, M(pm, T(0.16, 3.65, 0, 0, 1, 1, 1, 0, 0)));
  b.add('paint', coneG(3), YEL, M(pm, T(0.16, 4.65, 0, 0, 0.3, 0.3, 0.06)));
  k.col.cyl(x, y, z, 1.7, 0.14);
}

/** Pinwheel on a stick (static), bright petals around a dark hub. */
function pinwheel(k: Kit, x: number, z: number, y: number, face: number, seed: number): void {
  const m = T(x, y, z, face);
  const b = k.b;
  b.add('paint', cylG(6), CREAM, M(m, T(0, -1.2, 0, 0, 0.03, 1.2, 0.03)));
  const cols = [PINK, YEL, 0x2f8fb0, 0x8ac04a];
  for (let i = 0; i < 4; i++) {
    const ang = (i / 4) * Math.PI * 2 + seed;
    b.add('paint', coneG(3), cols[(i + seed) % 4], M(m, T(Math.cos(ang) * 0.18, Math.sin(ang) * 0.18, 0.02, 0, 0.2, 0.36, 0.03, 0, ang - Math.PI / 2)));
  }
  b.add('gloss', sphereG(0), 0x1c1c1c, M(m, T(0, 0, 0.05, 0, 0.06, 0.06, 0.06)));
}

export function buildSillySurroundings(k: Kit, roadEdge: (x: number, z: number) => number): { trees: ManualTree[]; keepouts: Keepout[] } {
  const a = ANCHORS.sillyZone;
  const b = k.b;
  const { inner, outer, fence: fr } = SILLY_RING;
  // ── Ground: yellow rim, plum/cream checker band, zig-zag edge, white outline ──
  groundDisc(k, a.x, a.z, inner, inner + 0.6, 0.06, () => YEL, 1, 96);
  groundDisc(k, a.x, a.z, inner + 0.6, outer - 0.8, 0.06, (x, z) => {
    const ang = Math.atan2(z - a.z, x - a.x);
    const r = Math.hypot(x - a.x, z - a.z);
    const u = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 48);
    const v = Math.floor((r - inner - 0.6) / 1.05);
    return (u + v) % 2 ? PLUM : CREAM;
  }, 12, 192);
  groundDisc(k, a.x, a.z, outer - 0.8, outer, 0.06, (x, z) => {
    const ang = Math.atan2(z - a.z, x - a.x);
    const r = Math.hypot(x - a.x, z - a.z);
    const tri = Math.abs(((ang + Math.PI) / (Math.PI * 2)) * 96 % 2 - 1);
    return r - (outer - 0.8) < tri * 0.8 ? PINK : 0x6c8f3c;
  }, 4, 384);

  // ── Candy-striped picket fence with gaps; pinwheels on every fourth post ──
  const posts = 72;
  let pw = 0;
  for (let i = 0; i < posts; i++) {
    const a0 = (i / posts) * Math.PI * 2;
    const a1 = ((i + 1) / posts) * Math.PI * 2;
    if (inGap(a0) || inGap(a1)) continue;
    const x0 = a.x + Math.cos(a0) * fr;
    const z0 = a.z + Math.sin(a0) * fr;
    const x1 = a.x + Math.cos(a1) * fr;
    const z1 = a.z + Math.sin(a1) * fr;
    if (roadEdge(x0, z0) < 1.5 || roadEdge(x1, z1) < 1.5 || roadEdge((x0 + x1) / 2, (z0 + z1) / 2) < 1.5) continue;
    const y0 = k.h(x0, z0);
    const wob = 0.08 * Math.sin(i * 1.7);
    b.add('paint', rbox(0.16, 1.25, 0.16, 0.03), i % 2 ? PINK : CREAM, T(x0, y0 - 0.1, z0, a0, 1, 1, 1, wob, -wob), { aoY: y0, aoH: 0.4 });
    b.add('gloss', sphereG(0), i % 2 ? CREAM : PINK, T(x0, y0 + 1.2, z0, 0, 0.12, 0.12, 0.12));
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    const my = (y0 + k.h(x1, z1)) / 2;
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    const l = Math.hypot(x1 - x0, z1 - z0);
    const pitch = -Math.atan2(k.h(x1, z1) - y0, l);
    for (const [ry, cc] of [[0.35, YEL], [0.85, CREAM]] as const) b.add('paint', boxG(), cc, T(mx, my + ry, mz, yaw, 0.07, 0.12, l, pitch));
    for (let j = 0; j < 3; j++) {
      const t = (j + 0.5) / 3;
      const px = x0 + (x1 - x0) * t;
      const pz = z0 + (z1 - z0) * t;
      b.add('paint', boxG(), j % 2 ? PLUM : CREAM, T(px, k.h(px, pz) - 0.05, pz, yaw, 0.1, 0.95, 0.04));
    }
    k.col.box(T(mx, my, mz, yaw), 0, 0.6, 0, 0.08, 0.65, l / 2);
    if (i % 4 === 0) pinwheel(k, x0 + Math.cos(a0) * 0.05, z0 + Math.sin(a0) * 0.05, y0 + 1.75, a0 + Math.PI / 2, pw++);
  }

  // ── Inflatable welcome arch over the end of the south road, with bunting ──
  const am = T(SILLY_ARCH.x, k.h(SILLY_ARCH.x, SILLY_ARCH.z), SILLY_ARCH.z, SILLY_ARCH.yaw);
  const ay = k.h(SILLY_ARCH.x, SILLY_ARCH.z);
  const R = SILLY_ARCH.half;
  const nb = 22;
  for (let i = 0; i <= nb; i++) {
    const t = (i / nb) * Math.PI;
    const px = Math.cos(t) * R;
    const py = Math.sin(t) * (R * 0.95) + 0.6;
    b.add('gloss', sphereG(1), i % 2 ? YEL : PINK, M(am, T(px, py, 0, 0, 0.62, 0.62, 0.62)), i < 2 || i > nb - 2 ? { aoY: ay, aoH: 0.8 } : undefined);
  }
  for (const s of [-1, 1]) {
    b.add('gloss', sphereG(2), 0x2f8fb0, M(am, T(s * R, 0.0, 0, 0, 0.85, 0.7, 0.85)));
    const wp = new THREE.Vector3(s * R, 0, 0).applyMatrix4(am);
    k.col.cyl(wp.x, k.h(wp.x, wp.z), wp.z, 1.2, 0.8);
  }
  // Big googly face on top of the arch.
  b.add('gloss', sphereG(2), CREAM, M(am, T(0, R * 0.95 + 1.1, 0, 0, 1.05, 1.05, 0.7)));
  for (const sx of [-0.38, 0.38]) {
    b.add('gloss', sphereG(1), 0xffffff, M(am, T(sx, R * 0.95 + 1.35, 0.55, 0, 0.3, 0.3, 0.16)));
    b.add('gloss', sphereG(1), 0x111111, M(am, T(sx * 1.25, R * 0.95 + 1.28, 0.68, 0, 0.14, 0.14, 0.06)));
  }
  b.add('paint', torusG(0.07, 16, Math.PI, 0.4), PLUM, M(am, T(0, R * 0.95 + 0.9, 0.62, 0, 1, 1, 1, Math.PI / 2, Math.PI)));
  const top = new THREE.Vector3(0, R * 0.95 + 0.4, 0).applyMatrix4(am);
  for (const s of [-1, 1]) {
    const far = new THREE.Vector3(s * (R + 4), 0, 2.5).applyMatrix4(am);
    far.y = k.h(far.x, far.z) + 2.6;
    const pole = far.clone();
    b.add('metal', cylG(6), CREAM, T(pole.x, pole.y - 2.6, pole.z, 0, 0.06, 2.8, 0.06));
    k.col.cyl(pole.x, pole.y - 2.6, pole.z, 1.4, 0.08);
    bunting(b, top, far, [PINK, CREAM, YEL, 0x2f8fb0], 1.2);
  }

  // ── Crooked signposts, giant ducks ──
  crookedSign(k, a.x + Math.cos(-1.95) * 25, a.z + Math.sin(-1.95) * 25, 1);
  crookedSign(k, a.x + Math.cos(3.54) * 24.6, a.z + Math.sin(3.54) * 24.6, 2);
  crookedSign(k, a.x + Math.cos(2.4) * 24.6, a.z + Math.sin(2.4) * 24.6, 3);
  crookedSign(k, a.x + Math.cos(0.75) * 24.6, a.z + Math.sin(0.75) * 24.6, 4);
  duck(k, a.x + Math.cos(-2.55) * 30, a.z + Math.sin(-2.55) * 30, 0.9, 1.4);
  duck(k, a.x + Math.cos(0.3) * 30, a.z + Math.sin(0.3) * 30, -1.4, 1.1);
  duck(k, a.x + Math.cos(1.45) * 30.5, a.z + Math.sin(1.45) * 30.5, Math.PI, 1.6);

  const trees: ManualTree[] = [
    { x: a.x + 30, z: a.z + 16, kind: 'palm', scale: 1.0 },
    { x: a.x - 33, z: a.z + 2, kind: 'palm', scale: 1.1 },
    { x: a.x - 30, z: a.z - 9, kind: 'bush', scale: 1.2 },
    { x: a.x + 31, z: a.z - 6, kind: 'bush', scale: 1.1 },
  ];
  const keepouts: Keepout[] = [
    { x: a.x, z: a.z, r: outer + 0.2, paved: true },
    { x: a.x, z: a.z, r: fr + 1.2 },
  ];
  return { trees, keepouts };
}
