/**
 * The Gear Shack: the gem shop kiosk on the fountain plaza. A chunky market stall with a teal and
 * cream striped awning, a marquee badge with a spinning gold gem on top, hanging pictogram boards
 * (hat, cape, paint drop), hats on pegs, a cape on a rail, paint cans and a giant toy rocket.
 *
 * Local frame: origin on the ground at the anchor, +Z = the counter side where the player stands.
 * The static body goes into the shared batcher; the few animated parts (spinning gem, pinwheels)
 * are tiny separate meshes that share the world materials.
 *
 * Every both-eye part reads by brightness: cream vs deep teal/navy, gold vs navy, never by hue.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Quality } from '../types';
import { M, T } from './batch';
import { ANCHORS } from './layout';
import type { Materials } from './materials';
import { C, box, crate, type HeightFn, type Kit } from './props';
import { boxG, coneG, cylG, rbox, sphereG } from './shapes';
import { groundDisc } from './core-areas';
import type { Keepout } from './scatter';

/** Stall body half extents in the local frame (the collider), and where the player stands. */
export const SHACK = {
  hx: 1.86,
  zBack: -1.18,
  zFront: 1.12,
  height: 3.0,
  /** Local z of the flat standing area in front of the counter (E prompt ~1.5 m in front). */
  standZ: 2.6,
} as const;

const CREAM = 0xf6efe0;
const TEAL = 0x1d5c6a;
const NAVY = 0x243046;
const GOLD = 0xf2c14e;
const GOLD_LIGHT = 0xffe39a;
const BERRY = 0x5b2a86;

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) geoCache.set(key, (g = make()));
  return g;
}

/** Flat silhouette in the XY plane (faces +Z), from a polygon or a shape builder. */
function shapeG(key: string, make: () => THREE.Shape): THREE.BufferGeometry {
  return cached(`shape:${key}`, () => new THREE.ShapeGeometry(make(), 6));
}
function poly(pts: readonly (readonly [number, number])[]): THREE.Shape {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i === 0 ? s.moveTo(x, y) : s.lineTo(x, y)));
  s.closePath();
  return s;
}

/** Half-disc scallop hanging down from y=0 (radius 1, XY plane) with a flutter weight for cloth. */
function scallopG(): THREE.BufferGeometry {
  return cached('scallop', () => {
    const g = new THREE.CircleGeometry(1, 6, Math.PI, Math.PI);
    const pos = g.attributes.position;
    const w = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) w[i] = Math.max(0, -pos.getY(i)) * 0.3;
    g.setAttribute('aWave', new THREE.BufferAttribute(w, 1));
    return g;
  });
}

/** Triangular rocket fin (XY plane, root along the y axis), extruded thin. */
function finG(): THREE.BufferGeometry {
  return cached('fin', () => {
    const g = new THREE.ExtrudeGeometry(poly([[0, 0], [0.26, -0.12], [0.26, 0.04], [0, 0.42]]), { depth: 0.035, bevelEnabled: false });
    g.translate(0, 0, -0.0175);
    return g;
  });
}

/** A brilliant-cut gem (8 facets), flat shaded, alternating gold tones per facet. Centre at the girdle. */
export function gemGeometry(): THREE.BufferGeometry {
  return cached('gem', () => {
    const crown = new THREE.CylinderGeometry(0.55, 0.9, 0.32, 8, 1).translate(0, 0.16, 0);
    const pav = new THREE.CylinderGeometry(0.9, 0.0, 0.85, 8, 1).translate(0, -0.425, 0);
    for (const g of [crown, pav]) {
      g.deleteAttribute('uv');
      g.deleteAttribute('normal');
    }
    const merged = mergeGeometries([crown.toNonIndexed(), pav.toNonIndexed()], false);
    if (!merged) throw new Error('gem geometry');
    merged.computeVertexNormals();
    const n = merged.attributes.position.count;
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    const tones = [GOLD, GOLD_LIGHT, 0xe9a92c, 0xfff1c4];
    for (let t = 0; t < n / 3; t++) {
      // Facets brighten towards the top (the table catches the light).
      const y = merged.attributes.position.getY(t * 3);
      c.set(y > 0.3 ? 0xfff6d8 : tones[t % tones.length]);
      for (let v = 0; v < 3; v++) c.toArray(col, (t * 3 + v) * 3);
    }
    merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return merged;
  });
}

const ICONS = {
  gemCrown: () => poly([[-0.42, 0.1], [-0.22, 0.34], [0.22, 0.34], [0.42, 0.1]]),
  gemPav: () => poly([[-0.42, 0.1], [0.42, 0.1], [0, -0.42]]),
  sparkle: () => poly([[0, 0.12], [0.03, 0.03], [0.12, 0], [0.03, -0.03], [0, -0.12], [-0.03, -0.03], [-0.12, 0], [-0.03, 0.03]]),
  hat: () => poly([[-0.4, -0.3], [0.4, -0.3], [0.4, -0.2], [0.24, -0.2], [0.24, 0.32], [-0.24, 0.32], [-0.24, -0.2], [-0.4, -0.2]]),
  cape: () => poly([[-0.12, 0.36], [0.12, 0.36], [0.2, 0.26], [0.4, -0.34], [0.2, -0.27], [0, -0.36], [-0.2, -0.27], [-0.4, -0.34], [-0.2, 0.26]]),
  drop: () => {
    const s = new THREE.Shape();
    s.moveTo(0, 0.42);
    s.quadraticCurveTo(0.3, 0.06, 0.28, -0.12);
    s.absarc(0, -0.12, 0.28, 0, Math.PI, true);
    s.quadraticCurveTo(-0.3, 0.06, 0, 0.42);
    return s;
  },
} as const;
type IconKey = keyof typeof ICONS;

function flat(k: Kit, m: THREE.Matrix4, icon: IconKey, color: number, x: number, y: number, z: number, s: number): void {
  k.b.add('paint', shapeG(icon, ICONS[icon]), color, M(m, T(x, y, z, 0, s, s, 1)));
}

/** Gold gem pictogram (two tones + a sparkle) on the board plane of `m`. */
function gemIcon(k: Kit, m: THREE.Matrix4, s: number): void {
  flat(k, m, 'gemCrown', GOLD_LIGHT, 0, 0, 0, s);
  flat(k, m, 'gemPav', GOLD, 0, 0, 0, s);
  flat(k, m, 'sparkle', 0xffffff, 0.36 * s, 0.36 * s, 0.002, s);
}

/** A string of glowing bulbs sagging from a to b (world space). */
function bulbString(k: Kit, a: THREE.Vector3, c: THREE.Vector3, n: number, sag: number): void {
  const yaw = Math.atan2(c.x - a.x, c.z - a.z);
  let prev = a.clone();
  const tones = [C.bulb, 0xfff4d6, 0xffc98a];
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const p = a.clone().lerp(c, t);
    p.y -= sag * 4 * t * (1 - t);
    const mid = prev.clone().add(p).multiplyScalar(0.5);
    const d = p.distanceTo(prev);
    k.b.add('metal', boxG(), 0x2a2a2a, T(mid.x, mid.y - 0.012, mid.z, yaw, 0.022, 0.022, d, -Math.asin((p.y - prev.y) / d)));
    if (i < n) {
      k.b.add('glow', sphereG(0), tones[i % tones.length], T(p.x, p.y - 0.1, p.z, 0, 0.065, 0.095, 0.065));
    }
    prev = p;
  }
}

function paintCan(k: Kit, m: THREE.Matrix4, x: number, y: number, z: number, s: number, color: number, yaw = 0): void {
  const cm = M(m, T(x, y, z, yaw, s, s, s));
  // Silver tin, a band of paint over the top (lid included) and a drip running down the side.
  k.b.add('metal', cylG(9, 1, true), 0xc9ced3, M(cm, T(0, 0, 0, 0, 0.12, 0.09, 0.12)));
  k.b.add('gloss', cylG(9), color, M(cm, T(0, 0.085, 0, 0, 0.123, 0.095, 0.123)));
  k.b.add('gloss', boxG(), color, M(cm, T(0.035, 0.025, 0.116, 0, 0.035, 0.08, 0.014)));
}

export function buildGearShack(k: Kit): Keepout[] {
  const a = ANCHORS.gearShack;
  const y = k.h(a.x, a.z);
  const m = T(a.x, y, a.z, a.yaw);
  const b = k.b;
  const L = (lx: number, lz: number): [number, number] => {
    const v = new THREE.Vector3(lx, 0, lz).applyMatrix4(m);
    return [v.x, v.z];
  };

  // ── Plinth and body ──
  b.add('matte', rbox(3.9, 0.16, 2.46, 0.05), C.stoneDark, M(m, T(0, 0, -0.03)), { aoY: y, aoH: 0.2, ao: 0.3 });
  // Back wall: cream outside with a teal wainscot; warm pegboard inside.
  b.add('paint', rbox(3.72, 2.75, 0.14, 0.04), CREAM, M(m, T(0, 0.12, -1.06)), { aoY: y + 0.12, aoH: 1.0, ao: 0.35 });
  box(b, 'paint', m, 0, 0.12, -1.07, 3.74, 0.95, 0.17, TEAL);
  box(b, 'paint', m, 0, 1.07, -1.07, 3.74, 0.06, 0.18, CREAM);
  b.add('paint', boxG(), 0xe8cf94, M(m, T(0, 1.15, -0.98, 0, 3.3, 1.5, 0.04)), { aoY: y + 1.1, aoH: 0.4, ao: 0.25 });
  // Side walls (full height): cream with teal wainscot, chunky rounded edges.
  for (const s of [-1, 1]) {
    b.add('paint', rbox(0.14, 2.62, 2.1, 0.04), CREAM, M(m, T(s * 1.79, 0.12, -0.06)), { aoY: y + 0.12, aoH: 1.0, ao: 0.35 });
    box(b, 'paint', m, s * 1.79, 0.12, -0.06, 0.17, 0.95, 2.12, TEAL);
    box(b, 'paint', m, s * 1.79, 1.07, -0.06, 0.18, 0.06, 2.13, CREAM);
    // Gold-gem roundel on the outside of each side wall.
    const rm = M(m, T(s * 1.875, 1.78, -0.1, (s * Math.PI) / 2));
    b.add('paint', cylG(14), CREAM, M(rm, T(0, 0, 0, 0, 0.52, 0.05, 0.52, Math.PI / 2)));
    b.add('paint', cylG(14), NAVY, M(rm, T(0, 0, 0.01, 0, 0.44, 0.05, 0.44, Math.PI / 2)));
    gemIcon(k, M(rm, T(0, 0.02, 0.062)), 0.72);
  }
  // Counter: cream front with teal harlequin diamonds, dark kick plate, thick wood top.
  b.add('paint', rbox(3.44, 0.92, 0.5, 0.04), CREAM, M(m, T(0, 0.12, 0.72)), { aoY: y + 0.12, aoH: 0.6, ao: 0.4 });
  box(b, 'paint', m, 0, 0.12, 0.98, 3.42, 0.16, 0.04, NAVY);
  for (let i = 0; i < 5; i++) {
    const dx = -1.36 + i * 0.68;
    b.add('paint', boxG(), i % 2 ? GOLD : TEAL, M(m, T(dx, 0.6, 0.975, 0, 0.36, 0.36, 0.03, 0, Math.PI / 4)));
  }
  b.add('paint', rbox(3.84, 0.1, 0.78, 0.04), C.woodLight, M(m, T(0, 1.04, 0.74)));
  box(b, 'paint', m, 0, 1.0, 1.12, 3.84, 0.05, 0.03, C.woodDark);
  // Inner shelf along the back wall with stacked paint cans and folded capes.
  box(b, 'paint', m, 0, 1.18, -0.78, 3.3, 0.06, 0.4, C.wood);
  for (const sx of [-1.3, 0, 1.3]) box(b, 'metal', m, sx, 1.0, -0.95, 0.05, 0.18, 0.3, C.iron);
  const shelfCans: [number, number][] = [[-1.4, 0xf2c14e], [-1.12, 0x2a9d8f], [-1.26, 0xf4f1ea]];
  shelfCans.forEach(([sx, col], i) => paintCan(k, m, sx, 1.24 + (i === 2 ? 0.19 : 0), -0.78, 1, col, i));
  for (let i = 0; i < 3; i++) b.add('paint', boxG(), [BERRY, 0xc8433a, TEAL][i], M(m, T(0.95, 1.24 + i * 0.075, -0.78, 0.05 * i, 0.5, 0.07, 0.34)));

  // ── Hats on pegs (back wall) ──
  const peg = (px: number, py: number): void => {
    b.add('metal', boxG(), C.iron, M(m, T(px, py, -0.97, 0, 0.04, 0.04, 0.2)));
  };
  // Top hat (navy, gold band).
  {
    const hm = M(m, T(-1.15, 1.92, -0.74, 0, 1, 1, 1, -0.25, 0.12));
    b.add('paint', cylG(12), NAVY, M(hm, T(0, 0, 0, 0, 0.22, 0.025, 0.22)));
    b.add('paint', cylG(12, 0.92), NAVY, M(hm, T(0, 0.02, 0, 0, 0.14, 0.26, 0.14)));
    b.add('gloss', cylG(12, 1, true), GOLD, M(hm, T(0, 0.04, 0, 0, 0.142, 0.05, 0.142)));
    peg(-1.15, 1.86);
  }
  // Party cone hat with a pompom (pink and cream stripes).
  {
    const hm = M(m, T(-0.4, 2.0, -0.76, 0, 1, 1, 1, -0.2, -0.1));
    for (let i = 0; i < 3; i++) {
      const r0 = 0.15 * (1 - i / 3);
      b.add('paint', cylG(10, (1 - (i + 1) / 3) / (1 - i / 3) || 0.001), i % 2 ? CREAM : 0xd9487e, M(hm, T(0, i * 0.12, 0, 0, r0, 0.12, r0)));
    }
    b.add('paint', sphereG(1), 0xffffff, M(hm, T(0, 0.37, 0, 0, 0.06, 0.06, 0.06)));
    peg(-0.4, 1.94);
  }
  // Crown (gold with jewels).
  {
    const hm = M(m, T(0.38, 1.9, -0.76, 0, 1, 1, 1, -0.22, 0.08));
    b.add('gloss', cylG(12, 1, true), GOLD, M(hm, T(0, 0, 0, 0, 0.15, 0.11, 0.15)));
    for (let i = 0; i < 6; i++) {
      const an = (i / 6) * Math.PI * 2;
      b.add('gloss', coneG(4), GOLD, M(hm, T(Math.sin(an) * 0.135, 0.1, Math.cos(an) * 0.135, an, 0.045, 0.1, 0.03)));
      if (i % 2 === 0) b.add('gloss', sphereG(0), i ? 0x2a9d8f : 0xc8433a, M(hm, T(Math.sin(an) * 0.152, 0.055, Math.cos(an) * 0.152, 0, 0.028, 0.028, 0.028)));
    }
    peg(0.38, 1.84);
  }
  // Cap (berry dome with a cream brim, turned sideways for style).
  {
    const hm = M(m, T(1.12, 1.94, -0.76, 0.6, 1, 1, 1, -0.25));
    b.add('paint', sphereG(1), BERRY, M(hm, T(0, 0, 0, 0, 0.14, 0.11, 0.14)));
    b.add('paint', boxG(), BERRY, M(hm, T(0, -0.012, 0, 0, 0.29, 0.02, 0.29)));
    b.add('paint', boxG(), CREAM, M(hm, T(0, -0.012, 0.19, 0, 0.2, 0.02, 0.16)));
    b.add('paint', sphereG(0), CREAM, M(hm, T(0, 0.11, 0, 0, 0.025, 0.02, 0.025)));
    peg(1.12, 1.86);
  }

  // ── Cape on a hanger (rail near the right wall) ──
  box(b, 'metal', m, 1.3, 2.36, -0.3, 0.035, 0.035, 1.3, C.iron);
  {
    const cm = M(m, T(1.3, 2.3, 0.05, -0.5));
    b.add('paint', boxG(), C.woodLight, M(cm, T(0, -0.14, 0, Math.PI / 2, 0.04, 0.04, 0.42)));
    b.add('metal', boxG(), C.iron, M(cm, T(0, -0.12, 0, 0, 0.015, 0.12, 0.015)));
    const outer = cached('capeOut', () => new THREE.CylinderGeometry(0.13, 0.4, 1.0, 12, 1, true, -Math.PI * 0.62, Math.PI * 1.24).translate(0, -0.5, 0));
    const inner = cached('capeIn', () => new THREE.CylinderGeometry(0.125, 0.39, 0.99, 12, 1, true, -Math.PI * 0.62, Math.PI * 1.24).translate(0, -0.5, 0).scale(-1, 1, 1));
    // Outer: deep berry; lining: bright gold (bright/dark in both channels).
    b.add('cloth', outer, BERRY, M(cm, T(0, -0.12, 0, Math.PI)));
    b.add('cloth', inner, GOLD, M(cm, T(0, -0.12, 0, Math.PI)));
    b.add('gloss', sphereG(1), GOLD, M(cm, T(0, -0.15, -0.13, 0, 0.04, 0.04, 0.02)));
  }

  // ── Goods on the counter ──
  paintCan(k, m, -1.3, 1.09, 0.75, 1.15, 0xf2c14e, 0.4);
  paintCan(k, m, -1.02, 1.09, 0.62, 1.15, 0x2a9d8f, -0.6);
  paintCan(k, m, -1.17, 1.3, 0.69, 1.0, 0xe86a9a, 1.2);
  // Brass service bell.
  b.add('metal', cylG(14), NAVY, M(m, T(1.15, 1.09, 0.8, 0, 0.11, 0.03, 0.11)));
  b.add('gloss', sphereG(1), 0xe0b84a, M(m, T(1.15, 1.12, 0.8, 0, 0.09, 0.08, 0.09)));
  b.add('gloss', sphereG(0), 0xe0b84a, M(m, T(1.15, 1.21, 0.8, 0, 0.02, 0.02, 0.02)));
  // Glasses on a little stand (fun shades: cream frame, dark lenses).
  {
    const gm = M(m, T(0.55, 1.09, 0.8, -0.3));
    box(b, 'paint', gm, 0, 0, 0, 0.04, 0.16, 0.04, C.woodDark);
    for (const s of [-1, 1]) b.add('glass', cylG(8), 0x101418, M(gm, T(s * 0.075, 0.2, 0.02, 0, 0.065, 0.02, 0.05, Math.PI / 2)));
    for (const s of [-1, 1]) b.add('paint', cylG(10, 1, true), 0xf4f1ea, M(gm, T(s * 0.075, 0.2, 0.0, 0, 0.075, 0.05, 0.06, Math.PI / 2)));
  }

  // ── Front posts (candy-striped), awning struts ──
  for (const s of [-1, 1]) {
    for (let i = 0; i < 8; i++) b.add('paint', cylG(8, 1, i < 7), i % 2 ? TEAL : CREAM, M(m, T(s * 1.8, 0.12 + i * 0.4, 1.0, 0, 0.085, 0.4, 0.085)));
    b.add('gloss', sphereG(1), GOLD, M(m, T(s * 1.8, 3.38, 1.0, 0, 0.12, 0.12, 0.12)));
    // Diagonal strut from the post to the awning's front edge.
    b.add('metal', cylG(6), C.iron, M(m, T(s * 1.8, 1.85, 1.0, 0, 0.025, 0.77, 0.025, 0.94)));
  }

  // ── Striped awning: bent canopy, cream and deep teal stripes, scalloped valance ──
  const N = 8;
  const W = 4.0;
  const sw = W / N;
  const segs: [number, number, number, number][] = [
    // z0, y0, z1, y1
    [-1.15, 3.0, 0.55, 2.78],
    [0.55, 2.78, 1.62, 2.3],
  ];
  for (let i = 0; i < N; i++) {
    const sx = -W / 2 + (i + 0.5) * sw;
    const col = i % 2 ? TEAL : CREAM;
    for (const [z0, y0, z1, y1] of segs) {
      const len = Math.hypot(z1 - z0, y1 - y0);
      const pitch = Math.atan2(y0 - y1, z1 - z0);
      // Slight billow: stripe centres sit a touch higher than their edges.
      b.add('cloth', boxG(), col, M(m, T(sx, (y0 + y1) / 2 - 0.03, (z0 + z1) / 2, 0, sw + 0.002, 0.05, len + 0.02, pitch)));
    }
    b.add('cloth', scallopG(), col, M(m, T(sx, 2.31, 1.63, 0, sw / 2, sw / 2 * 0.9, 1)));
  }
  // Side cheeks of the awning and a cream ridge cap at the back.
  for (const s of [-1, 1]) {
    b.add('paint', boxG(), TEAL, M(m, T(s * (W / 2 + 0.02), 2.7, 0.24, 0, 0.04, 0.16, 2.8, Math.atan2(0.7, 2.77))));
  }
  box(b, 'paint', m, 0, 2.98, -1.2, W + 0.1, 0.14, 0.16, CREAM);
  box(b, 'metal', m, 0, 2.27, 1.62, W + 0.06, 0.04, 0.04, C.iron);

  // ── Hanging pictogram boards: hat, cape, paint drop ──
  const boards: [number, IconKey, number][] = [[-1.2, 'hat', NAVY], [0, 'cape', BERRY], [1.2, 'drop', TEAL]];
  boards.forEach(([bx, ic, col], i) => {
    const bm = M(m, T(bx, 1.78, 1.6, 0, 1, 1, 1, 0, (i - 1) * 0.05));
    for (const s of [-1, 1]) box(b, 'metal', bm, s * 0.15, 0.48, 0, 0.012, 0.06, 0.012, C.iron);
    b.add('paint', boxG(), NAVY, M(bm, T(0, 0, 0, 0, 0.5, 0.48, 0.06)));
    b.add('paint', boxG(), CREAM, M(bm, T(0, 0.04, 0, 0, 0.42, 0.4, 0.07)));
    for (const f of [1, -1]) {
      const fm = M(bm, T(0, 0.24, f * 0.037, f > 0 ? 0 : Math.PI));
      flat(k, fm, ic, col, 0, 0, 0, 0.36);
      if (ic === 'hat') box(b, 'paint', fm, 0, -0.06, 0.002, 0.17, 0.035, 0.001, GOLD);
      if (ic === 'cape') b.add('paint', sphereG(0), GOLD, M(fm, T(0, 0.1, 0.004, 0, 0.03, 0.03, 0.005)));
      if (ic === 'drop') b.add('paint', sphereG(0), CREAM, M(fm, T(-0.04, -0.04, 0.004, 0, 0.03, 0.04, 0.005)));
    }
  });

  // ── Marquee badge with a gold gem icon (the spinning 3D gem sits on top; see createGearShackLive) ──
  {
    for (const s of [-1, 1]) {
      b.add('metal', cylG(8), C.iron, M(m, T(s * 0.7, 2.9, -0.55, 0, 0.05, 0.6, 0.05)));
    }
    const bm = M(m, T(0, 4.0, -0.55, 0, 1, 1, 1, 0, 0.07));
    b.add('paint', cylG(24), CREAM, M(bm, T(0, 0, -0.12, 0, 0.97, 0.24, 0.97, Math.PI / 2)));
    b.add('paint', cylG(24), NAVY, M(bm, T(0, 0, -0.135, 0, 0.84, 0.27, 0.84, Math.PI / 2)));
    for (const f of [1, -1]) {
      gemIcon(k, M(bm, T(0, 0.02, f * 0.137, f > 0 ? 0 : Math.PI)), 1.15);
      for (let i = 0; i < 12; i++) {
        const an = (i / 12) * Math.PI * 2 + Math.PI / 12;
        b.add('glow', sphereG(0), i % 2 ? C.bulb : 0xfff4d6, M(bm, T(Math.cos(an) * 0.905, Math.sin(an) * 0.905, f * 0.13, 0, 0.045, 0.045, 0.045)));
      }
    }
    // Little pedestal for the spinning gem.
    b.add('metal', cylG(12, 0.7), NAVY, M(bm, T(0, 0.86, 0, 0, 0.16, 0.2, 0.16)));
    b.add('gloss', cylG(12), GOLD, M(bm, T(0, 1.06, 0, 0, 0.18, 0.04, 0.18)));
  }

  // ── Bulb strings: across the front, and from the badge down to the post tops ──
  const W3 = (lx: number, ly: number, lz: number): THREE.Vector3 => new THREE.Vector3(lx, ly, lz).applyMatrix4(m);
  bulbString(k, W3(-2.0, 2.34, 1.69), W3(2.0, 2.34, 1.69), 12, 0.16);
  bulbString(k, W3(-0.62, 4.62, -0.55), W3(-1.8, 3.32, 1.0), 6, 0.12);
  bulbString(k, W3(0.62, 4.62, -0.55), W3(1.8, 3.32, 1.0), 6, 0.12);

  // ── Giant toy rocket leaning on the left wall ──
  {
    const rm = M(m, T(-2.2, 0.16, 0.2, 0, 1, 1, 1, 0, -0.14));
    b.add('gloss', cylG(12), 0xf4f1ea, M(rm, T(0, 0.3, 0, 0, 0.23, 1.1, 0.23)), { aoY: y + 0.1, aoH: 0.8, ao: 0.3 });
    b.add('gloss', coneG(12), 0xc8433a, M(rm, T(0, 1.4, 0, 0, 0.23, 0.5, 0.23)));
    b.add('gloss', cylG(12, 1, true), NAVY, M(rm, T(0, 0.55, 0, 0, 0.235, 0.16, 0.235)));
    b.add('gloss', cylG(12, 1, true), 0xc8433a, M(rm, T(0, 1.25, 0, 0, 0.235, 0.08, 0.235)));
    b.add('metal', cylG(12, 0.75), 0x4a5058, M(rm, T(0, 0.12, 0, 0, 0.16, 0.2, 0.16)));
    // Porthole facing out of the kiosk's left side.
    const pm = M(rm, T(-0.225, 1.0, 0, -Math.PI / 2));
    b.add('metal', cylG(12), 0xc9ced3, M(pm, T(0, 0, -0.02, 0, 0.11, 0.03, 0.11, Math.PI / 2)));
    b.add('glass', cylG(12), 0x7fc4e8, M(pm, T(0, 0, -0.01, 0, 0.08, 0.03, 0.08, Math.PI / 2)));
    for (let i = 0; i < 3; i++) {
      const an = (i / 3) * Math.PI * 2 - Math.PI / 2;
      b.add('gloss', finG(), 0xc8433a, M(rm, T(Math.sin(an) * 0.2, 0.42, Math.cos(an) * 0.2, an - Math.PI / 2)));
    }
  }

  // ── Around the stall: paint buckets, crates at the back, a welcome mat in front ──
  const [bx0, bz0] = L(2.25, 0.35);
  const by = k.h(bx0, bz0);
  const bucketM = T(bx0, by, bz0, a.yaw);
  paintCan(k, bucketM, 0, 0, 0, 2.6, 0xf2c14e, 0.3);
  paintCan(k, bucketM, 0.02, 0.46, -0.04, 2.2, 0xe86a9a, 2.0);
  paintCan(k, bucketM, 0.1, 0, 0.62, 2.3, 0x2a9d8f, 1.0);
  k.col.cyl(bx0, by, bz0, 0.45, 0.34);
  const [cx0, cz0] = L(1.2, -1.75);
  crate(k, cx0, cz0, 0.85, a.yaw + 0.2);
  crate(k, cx0, cz0, 0.6, a.yaw + 0.5, k.h(cx0, cz0) + 0.85);
  // Round mat where the player stands (flat paint, nothing to trip on).
  const [mx, mz] = L(0, SHACK.standZ - 0.4);
  groundDisc(k, mx, mz, 0, 1.0, 0.1, () => TEAL, 1, 32);
  groundDisc(k, mx, mz, 1.0, 1.22, 0.1, () => CREAM, 1, 32);

  // ── Collider: one box for the whole stall (counter front stays a clean wall), the rocket ──
  k.col.box(m, 0, SHACK.height / 2, (SHACK.zBack + SHACK.zFront) / 2, SHACK.hx, SHACK.height / 2, (SHACK.zFront - SHACK.zBack) / 2);
  const [rx, rz] = L(-2.05, 0.2);
  k.col.cyl(rx, y, rz, 0.95, 0.3);

  return [{ x: a.x, z: a.z, r: 3.2 }];
}

export interface GearShackLive {
  group: THREE.Group;
  update(dt: number): void;
  setQuality(q: Quality): void;
}

/** The animated bits: the gold gem spinning on the badge and two pinwheels on the post tops. */
export function createGearShackLive(mats: Materials, h: HeightFn): GearShackLive {
  const a = ANCHORS.gearShack;
  const group = new THREE.Group();
  group.name = 'gearShack';
  group.position.set(a.x, h(a.x, a.z), a.z);
  group.rotation.y = a.yaw;

  const gem = new THREE.Mesh(gemGeometry(), mats.get('gloss'));
  const gemBase = new THREE.Vector3(-Math.sin(0.07) * 1.5, 4.0 + Math.cos(0.07) * 1.5, -0.55);
  gem.position.copy(gemBase);
  gem.scale.setScalar(0.42);
  gem.castShadow = true;
  group.add(gem);

  // Pinwheel: four folded blades, alternating cream and teal (bright/dark in both channels).
  const blades: THREE.BufferGeometry[] = [];
  const cc = new THREE.Color();
  for (let i = 0; i < 4; i++) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.3, 0.02, 0.06, 0.04, 0.3, 0, 0, 0, 0, 0.04, 0.3, 0, 0.3, 0.02, 0.06], 3));
    g.rotateZ((i * Math.PI) / 2);
    g.computeVertexNormals();
    cc.set(i % 2 ? TEAL : CREAM);
    const col: number[] = [];
    for (let v = 0; v < 6; v++) col.push(cc.r, cc.g, cc.b);
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    blades.push(g);
  }
  const pinGeo = mergeGeometries(blades, false);
  for (const g of blades) g.dispose();
  const pinMat = mats.get('cloth');
  const wheels: THREE.Mesh[] = [];
  if (pinGeo) {
    const n = pinGeo.attributes.position.count;
    pinGeo.setAttribute('aWave', new THREE.BufferAttribute(new Float32Array(n), 1));
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(pinGeo, pinMat);
      w.position.set(s * 1.8, 3.38, 1.13);
      w.scale.setScalar(1.15);
      w.castShadow = true;
      group.add(w);
      wheels.push(w);
    }
  }

  let t = 0;
  return {
    group,
    update(dt) {
      t += dt;
      gem.rotation.y = t * 1.3;
      gem.position.y = gemBase.y + Math.sin(t * 2.1) * 0.07;
      wheels.forEach((w, i) => (w.rotation.z = -t * (3.2 + i * 0.7)));
    },
    setQuality(q) {
      const shadows = q !== 'low';
      gem.castShadow = shadows;
      for (const w of wheels) w.castShadow = shadows;
    },
  };
}
