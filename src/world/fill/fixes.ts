/**
 * Playtest fixes that need world dressing (QA rounds 3–4, owner playtest 4):
 * - Scoops' back is a blank plum wall facing Bouncy Park: a mural with the ice-cream pictogram and
 *   arrows round both sides, painted ground arrows to the front, and a giant cone sign behind it.
 * - The bubble pitch had no way in but a jump: wooden steps up to the puffy wall's top by the booth.
 * - The ~2 m gaps between the east-side village houses squeezed the camera: tall hedges close them.
 * Pure: no WebGL.
 */
import * as THREE from 'three';
import { M, T } from '../batch';
import { C, type Kit } from '../props';
import { blobG, coneG, cylG, rbox, sphereG } from '../shapes';
import { ANCHORS } from '../layout';
import type { Decals } from '../decals';
import type { Guard } from './guard';

const CREAM = 0xf4efe6;

/** Bubble-pitch stile: world rectangle (x0..x1, z0..z1) and the platform top. Tests read this. */
export const STILE = { x0: 37.6, x1: 40.2, z0: 45.6, z1: 50.12, top: 17.95, platformZ: 48.9 } as const;

/** Flat arrow (tip +X), lying on the ground. */
function groundArrow(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.5, -0.18);
  s.lineTo(0.15, -0.18);
  s.lineTo(0.15, -0.42);
  s.lineTo(0.6, 0);
  s.lineTo(0.15, 0.42);
  s.lineTo(0.15, 0.18);
  s.lineTo(-0.5, 0.18);
  s.closePath();
  return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2);
}

function scoopsBack(k: Kit, d: Decals, guard: Guard): void {
  const a = ANCHORS.iceCream;
  const yaw = a.yaw;
  // Parlour frame: local +Z = front (towards the plaza); back wall outer face at local z −3.2.
  const P = (lx: number, lz: number): [number, number] => [a.x + Math.cos(yaw) * lx + Math.sin(yaw) * lz, a.z - Math.sin(yaw) * lx + Math.cos(yaw) * lz];
  const [bx, bz] = P(0, -3.24);
  const gy = k.h(bx, bz);
  const m = T(bx, gy, bz, yaw + Math.PI);
  // Mural board on the wall (the wall's own collider covers it): cream frame, pink board, the icon
  // and big arrows pointing round both sides to the open front.
  k.b.add('paint', rbox(7.4, 2.9, 0.06, 0.03), CREAM, M(m, T(0, 0.75, 0)));
  k.b.add('paint', rbox(7.1, 2.6, 0.08, 0.03), 0xd8487a, M(m, T(0, 0.9, 0)));
  d.add('iIceCream', M(m, T(0, 2.2, 0.06)), 2.2);
  const arrow = groundArrow();
  for (const s of [-1, 1]) {
    // Wall arrows: tip pointing sideways (to the corners), standing up on the board.
    k.b.add('paint', arrow, CREAM, M(m, T(s * 2.55, 2.2, 0.07, s > 0 ? 0 : Math.PI, 1.6, 1, 1.6, Math.PI / 2)));
  }
  // Ground arrows: from behind, round the north-west side, to the counter.
  const route: [number, number][] = [[0, -5.6], [3.2, -5.4], [5.4, -3.6], [5.9, -0.6], [5.5, 2.6], [3.6, 5.0]];
  for (let i = 0; i < route.length - 1; i++) {
    const [x0, z0] = P(route[i][0], route[i][1]);
    const [x1, z1] = P(route[i + 1][0], route[i + 1][1]);
    const yy = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    k.b.add('road', arrow, CREAM, T(mx, k.h(mx, mz) + 0.1, mz, yy, 1.5, 1, 1.5));
    k.b.add('road', arrow, 0xd8487a, T(mx, k.h(mx, mz) + 0.11, mz, yy, 1.15, 1, 1.15));
  }
  arrow.dispose();
  // Giant cone sign behind the parlour (outside its clear circle), seen from Bouncy Park.
  const [cx, cz] = P(-1.5, -9.4);
  if (guard.free(cx, cz, 0.6)) {
    guard.take(cx, cz, 0.6);
    const cy = k.h(cx, cz);
    k.b.add('paint', cylG(10), CREAM, T(cx, cy, cz, 0, 0.12, 4.6, 0.12), { aoY: cy, aoH: 0.5, ao: 0.3 });
    k.b.add('paint', coneG(14), 0xd8a050, T(cx, cy + 6.4, cz, 0, 0.75, -1.8, 0.75));
    k.b.add('paint', sphereG(2), 0xf6e2c4, T(cx, cy + 6.85, cz, 0, 0.82, 0.72, 0.82));
    k.b.add('paint', sphereG(2), 0xf08ab0, T(cx, cy + 7.55, cz, 0, 0.7, 0.62, 0.7));
    k.b.add('paint', sphereG(2), 0x6a3a28, T(cx, cy + 8.15, cz, 0, 0.55, 0.5, 0.55));
    k.b.add('gloss', sphereG(1), 0xe2483c, T(cx, cy + 8.75, cz, 0, 0.2, 0.2, 0.2));
    k.col.cyl(cx, cy, cz, 2.3, 0.15);
  }
}

function bubbleStile(k: Kit): void {
  const { x0, x1, z0, z1, top, platformZ } = STILE;
  const w = x1 - x0;
  const xc = (x0 + x1) / 2;
  const g = k.h(xc, z0);
  const rise = top - g;
  const n = Math.max(3, Math.ceil(rise / 0.3));
  const run = (platformZ - z0) / n;
  for (let i = 0; i < n; i++) {
    const h = ((i + 1) * rise) / n;
    const z = z0 + i * run;
    k.b.add('paint', rbox(w, h, run + 0.02, 0.03), i % 2 ? 0xf2c14e : 0x3a72d8, T(xc, g, z + run / 2), { aoY: g, aoH: 0.3, ao: 0.3 });
    k.col.box(T(xc, g, z + run / 2), 0, h / 2, 0, w / 2, h / 2, run / 2);
  }
  // Platform up to the wall, with side rails.
  const pd = z1 - platformZ;
  k.b.add('paint', rbox(w, rise, pd, 0.03), 0xf4efe6, T(xc, g, platformZ + pd / 2));
  k.col.box(T(xc, g, platformZ + pd / 2), 0, rise / 2, 0, w / 2, rise / 2, pd / 2);
  for (const s of [-1, 1]) {
    const rx = xc + s * (w / 2 + 0.06);
    const len = z1 - z0;
    k.b.add('paint', rbox(0.1, 0.1, len, 0.02), C.white, T(rx, top + 0.85, (z0 + z1) / 2));
    for (const z of [z0 + 0.1, platformZ, z1 - 0.1]) {
      const py = z >= platformZ ? top : g + ((z - z0) / (platformZ - z0)) * rise;
      k.b.add('paint', cylG(8), C.white, T(rx, Math.min(py, top) - 0.02, z, 0, 0.05, top + 0.9 - Math.min(py, top), 0.05));
    }
    k.col.box(T(rx, top, (z0 + z1) / 2), 0, 0.45, 0, 0.06, 0.45, (z1 - z0) / 2);
  }
}

/** Tall flowering hedges closing the narrow gaps between the east-side village houses. */
function villageHedges(k: Kit): void {
  const gaps: [number, number, number][] = [
    // x centre, z centre, gap width
    [12.75, -30.25, 2.6],
    [12.75, -42.5, 2.1],
  ];
  for (const [x, z, w] of gaps) {
    const y = k.h(x, z);
    const len = 8.6;
    k.b.add('matte', rbox(len, 2.3, w + 0.3, 0.25), C.leafDark, T(x, y - 0.05, z, Math.PI / 2), { aoY: y, aoH: 0.8, ao: 0.4 });
    for (let i = 0; i < 9; i++) {
      const t = (i / 8 - 0.5) * (len - 0.6);
      for (const s of [-1, 1]) {
        k.b.add('matte', blobG(300 + i, 0, 0.2), i % 2 ? C.leaf : C.leafDark, T(x + t, y + 1.9 + (i % 3) * 0.12, z + s * (w / 2 + 0.05), i, 0.5, 0.45, 0.35));
      }
      k.b.add('paint', sphereG(0), [0xfff2c8, 0xf0a8c0, 0xffffff][i % 3], T(x + t, y + 1.4 + (i % 2) * 0.4, z + (i % 2 ? 1 : -1) * (w / 2 + 0.18), 0, 0.09, 0.09, 0.09));
    }
    // A low gate arch on the street side (closed), so it reads as a garden, not a wall.
    const gx = x - Math.sign(x) * (len / 2 - 0.1);
    k.b.add('paint', rbox(0.12, 1.4, w, 0.03), CREAM, T(gx - Math.sign(x) * 0.25, y, z));
    k.col.box(T(x, y, z), 0, 1.4, 0, len / 2, 1.4, w / 2 + 0.15);
  }
}

export function buildFixes(k: Kit, d: Decals, guard: Guard): void {
  scoopsBack(k, d, guard);
  bubbleStile(k);
  villageHedges(k);
}
