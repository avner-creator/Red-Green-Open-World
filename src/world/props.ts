/** Reusable street furniture and small props, built into the shared batcher, plus collider helpers. */
import * as THREE from 'three';
import type { PhysicsApi } from '../types';
import { Batcher, M, T } from './batch';
import { blobG, boxG, coneG, cylG, flagG, pennantG, rbox, sphereG, torusG } from './shapes';

export type HeightFn = (x: number, z: number) => number;

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

export class Colliders {
  count = 0;
  constructor(private physics: PhysicsApi) {}
  /** Box in the local frame of `m` (rotation and translation only). */
  box(m: THREE.Matrix4, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): void {
    m.decompose(_p, _q, _s);
    const c = new THREE.Vector3(cx, cy, cz).applyQuaternion(_q).add(_p);
    this.physics.addStaticBox(c, new THREE.Vector3(hx, hy, hz), _q.clone());
    this.count++;
  }
  cyl(x: number, y: number, z: number, halfH: number, r: number): void {
    this.physics.addStaticCylinder(new THREE.Vector3(x, y + halfH, z), halfH, r);
    this.count++;
  }
  sphere(x: number, y: number, z: number, r: number): void {
    this.physics.addStaticSphere(new THREE.Vector3(x, y, z), r);
    this.count++;
  }
}

export interface Kit {
  b: Batcher;
  col: Colliders;
  h: HeightFn;
}

export const C = {
  wood: 0x9b6b43,
  woodDark: 0x6a4630,
  woodLight: 0xc89a66,
  iron: 0x2c3036,
  stone: 0xcfc5b2,
  stoneDark: 0x9a9284,
  white: 0xf4f1ea,
  soil: 0x4a3626,
  leaf: 0x3f7a2a,
  leafDark: 0x2c5a20,
  bulb: 0xffe2b0,
};

/** Unit box scaled: w×h×d at local (x,y,z) with base at y. */
export function box(b: Batcher, key: Parameters<Batcher['add']>[0], m: THREE.Matrix4, x: number, y: number, z: number, w: number, h: number, d: number, color: number, yaw = 0): void {
  b.add(key, boxG(), color, M(m, T(x, y, z, yaw, w, h, d)));
}

export function bench(k: Kit, x: number, z: number, yaw: number): void {
  const y = k.h(x, z);
  const m = T(x, y, z, yaw);
  for (const sx of [-0.75, 0.75]) {
    box(k.b, 'metal', m, sx, 0, 0, 0.08, 0.45, 0.5, C.iron);
    box(k.b, 'metal', m, sx, 0.45, -0.22, 0.08, 0.5, 0.06, C.iron);
  }
  for (let i = 0; i < 3; i++) k.b.add('paint', rbox(1.8, 0.05, 0.15, 0.02), C.woodLight, M(m, T(0, 0.45, -0.17 + i * 0.17)));
  for (let i = 0; i < 2; i++) k.b.add('paint', rbox(1.8, 0.14, 0.04, 0.02), C.woodLight, M(m, T(0, 0.62 + i * 0.2, -0.25, 0, 1, 1, 1, -0.15)));
  k.col.box(m, 0, 0.35, -0.05, 0.95, 0.35, 0.3);
}

export function lamp(k: Kit, x: number, z: number, yaw = 0): void {
  const y = k.h(x, z);
  const m = T(x, y, z, yaw);
  k.b.add('metal', cylG(8), C.iron, M(m, T(0, 0, 0, 0, 0.16, 0.5, 0.16)));
  k.b.add('metal', cylG(8, 0.6), C.iron, M(m, T(0, 0.5, 0, 0, 0.07, 3.2, 0.07)));
  k.b.add('metal', cylG(8), C.iron, M(m, T(0, 3.7, 0, 0, 0.11, 0.12, 0.11)));
  // Lantern: glowing core, four corner posts and a pyramid cap.
  k.b.add('glow', boxG(), C.bulb, M(m, T(0, 3.82, 0, 0, 0.3, 0.42, 0.3)));
  for (const [cx, cz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) box(k.b, 'metal', m, cx, 3.8, cz, 0.04, 0.46, 0.04, C.iron);
  k.b.add('metal', coneG(4), C.iron, M(m, T(0, 4.26, 0, Math.PI / 4, 0.36, 0.26, 0.36)));
  k.b.add('metal', sphereG(0), C.iron, M(m, T(0, 4.56, 0, 0, 0.06, 0.06, 0.06)));
  k.col.cyl(x, y, z, 2.1, 0.15);
}

export function planter(k: Kit, x: number, z: number, w: number, d: number, yaw = 0, seed = 1): void {
  const y = k.h(x, z);
  const m = T(x, y, z, yaw);
  k.b.add('matte', rbox(w, 0.55, d, 0.07), C.stone, M(m, T(0, 0, 0)), { aoY: y, aoH: 0.4, ao: 0.3 });
  box(k.b, 'matte', m, 0, 0.5, 0, w - 0.2, 0.08, d - 0.2, C.soil);
  const n = Math.max(1, Math.round(w / 0.9));
  for (let i = 0; i < n; i++) {
    const px = -w / 2 + (i + 0.5) * (w / n);
    const s = 0.45 + ((i * 37 + seed * 13) % 7) * 0.03;
    k.b.add('matte', blobG(seed * 10 + i, 1, 0.2), i % 2 ? C.leaf : C.leafDark, M(m, T(px, 0.75, 0, i, s, s * 0.85, Math.min(s, d * 0.45))), { aoY: y + 0.5, aoH: 0.5, ao: 0.4 });
    if (i % 2 === 0) {
      for (let f = 0; f < 3; f++) {
        k.b.add('paint', sphereG(0), f % 2 ? 0xfff2c8 : 0xf0a8c0, M(m, T(px + (f - 1) * 0.18, 1.05 + (f % 2) * 0.08, (f - 1) * 0.1, 0, 0.07, 0.07, 0.07)));
      }
    }
  }
  k.col.box(m, 0, 0.5, 0, w / 2, 0.5, d / 2);
}

/** Fence along a polyline; posts every ~2.2 m, two rails; colliders per span. */
export function fence(k: Kit, pts: readonly [number, number][], opts: { post?: number; rail?: number; height?: number; picket?: boolean; gapEvery?: number } = {}): void {
  const post = opts.post ?? C.white;
  const rail = opts.rail ?? C.white;
  const fh = opts.height ?? 1.1;
  for (let s = 0; s < pts.length - 1; s++) {
    const [x0, z0] = pts[s];
    const [x1, z1] = pts[s + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / 2.2));
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i <= n; i++) {
      if (i === n && s < pts.length - 2) continue;
      const x = x0 + ((x1 - x0) * i) / n;
      const z = z0 + ((z1 - z0) * i) / n;
      const y = k.h(x, z);
      k.b.add('paint', rbox(0.14, fh + 0.15, 0.14, 0.03), post, T(x, y - 0.1, z, yaw), { aoY: y, aoH: 0.4, ao: 0.35 });
      k.b.add('paint', coneG(4), post, T(x, y + fh + 0.05, z, yaw + Math.PI / 4, 0.11, 0.12, 0.11));
    }
    for (let i = 0; i < n; i++) {
      const xa = x0 + ((x1 - x0) * i) / n;
      const za = z0 + ((z1 - z0) * i) / n;
      const xb = x0 + ((x1 - x0) * (i + 1)) / n;
      const zb = z0 + ((z1 - z0) * (i + 1)) / n;
      const ya = k.h(xa, za);
      const yb = k.h(xb, zb);
      const sl = Math.hypot(xb - xa, zb - za);
      const pitch = -Math.atan2(yb - ya, sl);
      const mx = (xa + xb) / 2;
      const mz = (za + zb) / 2;
      const my = (ya + yb) / 2;
      for (const ry of opts.picket ? [0.35, 0.8] : [0.45, 0.9]) {
        k.b.add('paint', boxG(), rail, T(mx, my + ry, mz, yaw, 0.06, 0.1, sl, pitch));
      }
      if (opts.picket) {
        const m = Math.max(1, Math.round(sl / 0.32));
        for (let j = 0; j < m; j++) {
          const t = (j + 0.5) / m;
          const px = xa + (xb - xa) * t;
          const pz = za + (zb - za) * t;
          const py = ya + (yb - ya) * t;
          k.b.add('paint', boxG(), rail, T(px, py, pz, yaw, 0.03, fh - 0.12, 0.1));
        }
      }
      k.col.box(T(mx, my, mz, yaw), 0, fh / 2, 0, 0.08, fh / 2 + 0.1, sl / 2);
    }
  }
}

export function flagpole(k: Kit, x: number, z: number, height: number, flag: number, flagW = 1.6): void {
  const y = k.h(x, z);
  k.b.add('metal', cylG(8), 0xe8e6e0, T(x, y, z, 0, 0.07, height, 0.07));
  k.b.add('metal', cylG(8), C.stoneDark, T(x, y, z, 0, 0.22, 0.25, 0.22));
  k.b.add('gloss', sphereG(1), 0xf0c050, T(x, y + height + 0.08, z, 0, 0.12, 0.12, 0.12));
  k.b.add('cloth', flagG(), flag, T(x + 0.05, y + height - 0.1, z, 0.35, flagW, flagW * 0.62, 1));
  k.col.cyl(x, y, z, height / 2, 0.12);
}

/** A sagging string of pennants between two points (alternating colours). */
export function bunting(b: Batcher, a: THREE.Vector3, c: THREE.Vector3, colors: readonly number[], sag = 0.6): void {
  const len = a.distanceTo(c);
  const n = Math.max(2, Math.round(len / 0.7));
  const yaw = Math.atan2(c.x - a.x, c.z - a.z);
  let prev = a.clone();
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const p = a.clone().lerp(c, t);
    p.y -= sag * 4 * t * (1 - t);
    const mid = prev.clone().add(p).multiplyScalar(0.5);
    const d = p.distanceTo(prev);
    b.add('metal', boxG(), 0x3a3a3a, T(mid.x, mid.y - 0.01, mid.z, yaw, 0.02, 0.02, d, -Math.asin((p.y - prev.y) / d)));
    if (i < n) b.add('cloth', pennantG(), colors[i % colors.length], T(p.x, p.y, p.z, yaw + Math.PI / 2, 0.38, 0.45, 1));
    prev = p;
  }
}

export type IconKind = 'trampoline' | 'balloon' | 'car' | 'horse' | 'lighthouse' | 'bridge' | 'star';

/** Simple pictograms (white) on a board, in the board's local frame (board faces +Z). */
export function icon(b: Batcher, m: THREE.Matrix4, kind: IconKind, color = C.white): void {
  const z = 0.06;
  switch (kind) {
    case 'trampoline':
      b.add('paint', torusG(0.12, 16, Math.PI), color, M(m, T(0, -0.12, z, 0, 0.3, 0.3, 0.3, Math.PI / 2)));
      box(b, 'paint', m, 0, -0.18, z, 0.62, 0.06, 0.04, color);
      break;
    case 'balloon':
      b.add('paint', sphereG(1), color, M(m, T(0, 0.08, z, 0, 0.2, 0.24, 0.05)));
      box(b, 'paint', m, 0, -0.3, z, 0.12, 0.1, 0.04, color);
      break;
    case 'car':
      box(b, 'paint', m, 0, -0.12, z, 0.56, 0.16, 0.04, color);
      box(b, 'paint', m, -0.04, 0.02, z, 0.3, 0.12, 0.04, color);
      for (const wx of [-0.17, 0.17]) b.add('paint', cylG(10), color, M(m, T(wx, -0.2, z, 0, 0.08, 0.06, 0.08, Math.PI / 2)));
      break;
    case 'horse':
      b.add('paint', torusG(0.18, 14, Math.PI * 1.4), color, M(m, T(0, 0, z, 0, 0.2, 0.2, 0.2, Math.PI / 2, Math.PI * 0.8)));
      break;
    case 'lighthouse':
      b.add('paint', cylG(8, 0.6), color, M(m, T(0, -0.3, z, 0, 0.12, 0.5, 0.04)));
      box(b, 'paint', m, 0, 0.22, z, 0.16, 0.1, 0.04, 0xf0c050);
      break;
    case 'bridge':
      b.add('paint', torusG(0.1, 16, Math.PI), color, M(m, T(0, -0.25, z, 0, 0.3, 0.3, 0.3, Math.PI / 2)));
      box(b, 'paint', m, 0, 0.0, z, 0.66, 0.06, 0.04, color);
      break;
    case 'star':
      for (let i = 0; i < 5; i++) b.add('paint', coneG(3), color, M(m, T(0, 0, z, 0, 0.08, 0.26, 0.03, 0, (i * Math.PI * 2) / 5)));
      break;
  }
}

/** Wooden signpost with arrow boards pointing at areas, each with an icon (no text). */
export function signpost(k: Kit, x: number, z: number, arrows: readonly { yaw: number; icon: IconKind; color: number }[]): void {
  const y = k.h(x, z);
  k.b.add('paint', rbox(0.16, 3.0, 0.16, 0.03), C.woodDark, T(x, y, z), { aoY: y, aoH: 0.5 });
  k.b.add('paint', coneG(4), C.woodDark, T(x, y + 3.0, z, Math.PI / 4, 0.14, 0.18, 0.14));
  arrows.forEach((a, i) => {
    const m = M(T(x, y + 2.55 - i * 0.62, z, a.yaw - Math.PI / 2), T(0.62, 0, 0.1));
    k.b.add('paint', rbox(1.0, 0.5, 0.08, 0.03), a.color, M(m, T(0, -0.25, 0)));
    k.b.add('paint', coneG(3), a.color, M(m, T(0.62, 0, 0, 0, 0.3, 0.26, 0.04, 0, -Math.PI / 2)));
    icon(k.b, M(m, T(-0.05, 0.02, 0, 0, 0.7, 0.7, 1)), a.icon);
    icon(k.b, M(m, T(-0.05, 0.02, -0.12, Math.PI, 0.7, 0.7, 1)), a.icon);
  });
  k.col.cyl(x, y, z, 1.5, 0.12);
}

export function barrel(k: Kit, x: number, z: number, color = 0x8a5a36, y?: number): void {
  const yy = y ?? k.h(x, z);
  k.b.add('paint', cylG(12), color, T(x, yy, z, 0, 0.36, 0.95, 0.36), { aoY: yy, aoH: 0.3 });
  for (const ry of [0.15, 0.78]) k.b.add('metal', cylG(12, 1, true), 0x3b3b3b, T(x, yy + ry, z, 0, 0.375, 0.06, 0.375));
  k.col.cyl(x, yy, z, 0.48, 0.36);
}

export function crate(k: Kit, x: number, z: number, s = 0.9, yaw = 0, y?: number): void {
  const yy = y ?? k.h(x, z);
  const m = T(x, yy, z, yaw);
  k.b.add('paint', rbox(s, s, s, 0.04), C.woodLight, m, { aoY: yy, aoH: 0.3 });
  for (const sx of [-1, 1]) box(k.b, 'paint', m, (sx * s) / 2, 0.05, 0, 0.04, s * 0.9, s * 0.96, C.wood);
  k.col.box(m, 0, s / 2, 0, s / 2, s / 2, s / 2);
}

export function hayBale(k: Kit, x: number, z: number, yaw: number): void {
  const y = k.h(x, z);
  const m = M(T(x, y + 0.6, z, yaw), T(0, 0, 0, 0, 0.6, 1.3, 0.6, 0, Math.PI / 2));
  k.b.add('matte', cylG(14), 0xe0c070, M(m, T(0, -0.5, 0)), { aoY: y, aoH: 0.4 });
  k.col.box(T(x, y, z, yaw), 0, 0.6, 0, 0.65, 0.6, 0.6);
}

export function cone(b: Batcher, x: number, y: number, z: number, color = 0xf07a28): void {
  b.add('paint', boxG(), 0x2b2b2b, T(x, y, z, 0, 0.42, 0.05, 0.42));
  b.add('paint', coneG(12), color, T(x, y + 0.05, z, 0, 0.17, 0.6, 0.17));
  b.add('paint', cylG(12, 0.8, true), C.white, T(x, y + 0.28, z, 0, 0.115, 0.12, 0.115));
}
