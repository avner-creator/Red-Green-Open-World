/**
 * Bouncy Park surroundings: rubber play surfaces, fence with an entrance arch, flags, bunting,
 * benches. The trampoline and bounce-pad anchors are left clear for activities.
 */
import * as THREE from 'three';
import { M, T } from './batch';
import { bench, bunting, fence, flagpole, icon, lamp, type Kit } from './props';
import { cylG, rbox, sphereG, torusG } from './shapes';
import { ANCHORS, VILLAGE_Y } from './layout';
import type { Keepout, ManualTree } from './scatter';

export const PARK = { x0: 41, x1: 99, z0: -41, z1: 1 } as const;

/** Checkered rubber disc (alternating luminance in both colour channels). */
function rubberDisc(k: Kit, x: number, z: number, r: number, a: number, bb: number, accent: number): void {
  const y = VILLAGE_Y + 0.05;
  // Concentric target rings, with a ring of accent dots between the two outer bands.
  const rings = Math.round(r / 1.8);
  for (let i = 0; i < rings; i++) {
    const r0 = (i * r) / rings;
    const r1 = ((i + 1) * r) / rings;
    const g = i === 0 ? new THREE.CircleGeometry(r1, 32) : new THREE.RingGeometry(r0, r1, 72, 1);
    g.rotateX(-Math.PI / 2);
    k.b.add('rubber', g, i === 0 ? accent : i % 2 ? bb : a, T(x, y, z));
    g.dispose();
  }
  const rd = r * ((rings - 1) / rings) - (r / rings) * 0.5;
  const dots = Math.round((Math.PI * 2 * rd) / 2.4);
  for (let s = 0; s < dots; s++) {
    const ang = (s / dots) * Math.PI * 2;
    const g = new THREE.CircleGeometry(0.32, 12).rotateX(-Math.PI / 2);
    k.b.add('rubber', g, accent, T(x + Math.cos(ang) * rd, y + 0.01, z + Math.sin(ang) * rd));
    g.dispose();
  }
  // Soft bumper ring.
  k.b.add('rubber', torusG(0.25, 128, Math.PI * 2, r + 0.2), 0xf4efe6, T(x, y + 0.08, z));
}

function candyPillar(k: Kit, x: number, z: number, h: number): void {
  const y = k.h(x, z);
  const n = Math.round(h / 0.6);
  for (let i = 0; i < n; i++) k.b.add('paint', cylG(16), i % 2 ? 0xf4efe6 : 0xc8433a, T(x, y + i * (h / n), z, 0, 0.32, h / n, 0.32));
  k.b.add('gloss', sphereG(2), 0xf2c14e, T(x, y + h + 0.3, z, 0, 0.42, 0.42, 0.42));
  k.col.cyl(x, y, z, h / 2, 0.34);
}

export function buildPark(k: Kit): { trees: ManualTree[]; keepouts: Keepout[] } {
  const tr = ANCHORS.trampoline;
  const bp = ANCHORS.bouncePads;
  const y = VILLAGE_Y;
  rubberDisc(k, tr.x, tr.z, 14.5, 0xeee2c6, 0x4f6d8f, 0xf2c14e);
  rubberDisc(k, bp.x, bp.z, 12, 0xeee2c6, 0x2f6f73, 0xd85a8c);
  // Paved paths: gate → trampoline zone, zones → south gate.
  const path = (x0: number, z0: number, x1: number, z1: number, w: number): void => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    k.b.add('paving', rbox(w, 0.12, len, 0.03), 0xd9cfbd, T((x0 + x1) / 2, y, (z0 + z1) / 2, Math.atan2(x1 - x0, z1 - z0)));
  };
  path(39, -18, 46, -19.5, 4);
  path(64, -12, 60, 1.5, 3.2);
  path(73, -3, 72, 1.5, 3.2);

  // Fence with two gates (west, south).
  const { x0, x1, z0, z1 } = PARK;
  const fc = { post: 0xf2c14e, rail: 0x2f6f8f, height: 1.15 };
  fence(k, [[x0, -14.5], [x0, z1], [56, z1]], fc);
  fence(k, [[63, z1], [70, z1]], fc);
  fence(k, [[76, z1], [x1, z1], [x1, z0], [x0, z0], [x0, -21.5]], fc);

  // Entrance arch (west gate) with a star.
  candyPillar(k, x0, -21.8, 4.2);
  candyPillar(k, x0, -14.2, 4.2);
  const am = T(x0, y + 4.4, -18, Math.PI / 2);
  k.b.add('paint', torusG(0.32, 40, Math.PI, 3.8), 0xf2c14e, M(am, T(0, 0, 0, 0, 1, 1, 1, Math.PI / 2)));
  k.b.add('paint', rbox(2.4, 1.0, 0.14, 0.05), 0x4f6d8f, M(am, T(0, 1.5, 0)));
  icon(k.b, M(am, T(0, 2.0, 0.08, 0, 1.5, 1.5, 1)), 'star', 0xf2c14e);
  icon(k.b, M(am, T(0, 2.0, -0.08, Math.PI, 1.5, 1.5, 1)), 'star', 0xf2c14e);
  candyPillar(k, 56, z1, 2.6);
  candyPillar(k, 63, z1, 2.6);
  candyPillar(k, 70, z1, 2.6);
  candyPillar(k, 76, z1, 2.6);

  // Flags at the corners and bunting along the sides.
  const flagCols = [0xc8433a, 0x2f5d7c, 0xf2c14e, 0x3b6b45];
  const corners: [number, number][] = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  corners.forEach(([fx, fz], i) => flagpole(k, fx, fz, 7.5, flagCols[i]));
  const pennants = [0xc8433a, 0xf4efe6, 0x2f5d7c, 0xf2c14e, 0x3b6b45, 0xf4efe6];
  const top = (x: number, z: number, hh: number): THREE.Vector3 => new THREE.Vector3(x, k.h(x, z) + hh, z);
  bunting(k.b, top(x0, -21.8, 4.4), top(x0, z0, 6.8), pennants, 0.8);
  bunting(k.b, top(x0, -14.2, 4.4), top(x0, z1, 6.8), pennants, 0.8);
  bunting(k.b, top(x0, z0, 6.8), top(x1, z0, 6.8), pennants, 2.2);
  bunting(k.b, top(x1, z0, 6.8), top(x1, z1, 6.8), pennants, 1.6);

  // A ring of short poles around the trampoline zone with bunting between them.
  const ringPoles: THREE.Vector3[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const px = tr.x + Math.cos(a) * 16.5;
    const pz = tr.z + Math.sin(a) * 16.5;
    if (px < x0 + 1.5) continue;
    const py = k.h(px, pz);
    k.b.add('paint', cylG(10), 0xf4efe6, T(px, py, pz, 0, 0.09, 3.6, 0.09));
    k.b.add('gloss', sphereG(1), 0xc8433a, T(px, py + 3.7, pz, 0, 0.16, 0.16, 0.16));
    k.col.cyl(px, py, pz, 1.8, 0.1);
    ringPoles.push(new THREE.Vector3(px, py + 3.55, pz));
  }
  for (let i = 0; i < ringPoles.length - 1; i++) bunting(k.b, ringPoles[i], ringPoles[i + 1], pennants, 0.5);

  // Benches, lamps, bins (the ice-cream kiosk moved out: Scoops is the real shop, on the plaza).
  bench(k, 50, -38.5, 0);
  bench(k, 68, -38.5, 0);
  bench(k, 96.5, -22, -Math.PI / 2);
  bench(k, 45, -4, Math.PI * 0.75);
  for (const [lx, lz] of [[44, -36], [74, -36], [96, -4], [44, -2], [72, -21]]) lamp(k, lx, lz);
  for (const [bx, bz] of [[52.5, -38.6], [94, -24]]) {
    const by = k.h(bx, bz);
    k.b.add('paint', cylG(12), 0x3b6b45, T(bx, by, bz, 0, 0.28, 0.85, 0.28), { aoY: by, aoH: 0.3 });
    k.col.cyl(bx, by, bz, 0.42, 0.28);
  }

  const trees: ManualTree[] = [];
  for (const tx of [48, 62, 76, 90]) trees.push({ x: tx, z: -45.5, kind: 'oak', scale: 0.9 });
  for (const tz of [-34, -20, -6]) trees.push({ x: 103, z: tz, kind: 'oak', scale: 0.95 });
  trees.push({ x: 46, z: -30, kind: 'oak', scale: 0.8 });
  trees.push({ x: 95, z: -2, kind: 'oak', scale: 0.8 });
  const keepouts: Keepout[] = [{ x: (x0 + x1) / 2, z: (z0 + z1) / 2, hx: (x1 - x0) / 2 + 1, hz: (z1 - z0) / 2 + 1, paved: false }];
  keepouts.push({ x: tr.x, z: tr.z, r: 15, paved: true }, { x: bp.x, z: bp.z, r: 12.5, paved: true });
  return { trees, keepouts };
}
