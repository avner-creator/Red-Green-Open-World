/**
 * Wayfinding: the plaza fingerpost, junction fingerposts, painted ground arrows and road chevrons,
 * "how to play" picture boards at each attraction, and the tether stakes of the beacon balloons.
 * Everything here is static (batched + one pictogram decal mesh) and wordless. Pure: no WebGL, so
 * unit tests can build it and check arm directions and placements.
 */
import * as THREE from 'three';
import type { AnchorName } from '../types';
import { M, T } from './batch';
import { C, type Kit } from './props';
import { cylG, rbox, sphereG, torusG, coneG } from './shapes';
import { ANCHORS, LAUNCH_NET } from './layout';
import { PLAZA } from './village';
import type { ProcessedRoad } from './terrain';
import type { Keepout } from './scatter';
import { Decals } from './decals';
import type { IconId, PanelId } from './pictograms';

export interface Attraction {
  anchor: AnchorName;
  icon: IconId;
  /** Dark arm/board colour (signs) and bright balloon colour (beacon). */
  arm: number;
  balloon: number;
  panels: PanelId[];
  /** Beacon tether stake (x, z) and balloon height above it. */
  beacon: { x: number; z: number; h: number };
  /** How-to board: centre and the point it faces. */
  board: { x: number; z: number; faceX: number; faceZ: number };
}

export const ATTRACTIONS: readonly Attraction[] = [
  {
    anchor: 'trampoline', icon: 'iTrampoline', arm: 0x8a2c22, balloon: 0xe0513a, panels: ['tramp1', 'tramp2', 'tramp3'],
    beacon: { x: 62, z: -37.5, h: 12 }, board: { x: 37.5, z: -25.5, faceX: 28, faceZ: -14 },
  },
  {
    anchor: 'bouncePads', icon: 'iBounce', arm: 0x1c6660, balloon: 0x22a89a, panels: ['bounce1', 'bounce2'],
    beacon: { x: 97, z: -14, h: 12 }, board: { x: 66, z: -3, faceX: 66, faceZ: 10 },
  },
  {
    anchor: 'garage', icon: 'iCar', arm: 0x20437a, balloon: 0x2f72d8, panels: ['car1', 'car2', 'car3'],
    beacon: { x: 50, z: 40, h: 9 }, board: { x: 22.5, z: 18, faceX: 22.5, faceZ: 4 },
  },
  {
    anchor: 'launchPads', icon: 'iRocket', arm: 0x86285a, balloon: 0xe04a86, panels: ['rocket1', 'rocket2', 'rocket3'],
    beacon: { x: 93, z: 31, h: 12 }, board: { x: 64.5, z: 20.5, faceX: 57, faceZ: 28 },
  },
  {
    anchor: 'balloon', icon: 'iBalloon', arm: 0x553082, balloon: 0x8d55d6, panels: ['balloon1', 'balloon2', 'balloon3'],
    beacon: { x: 96, z: 81, h: 18 }, board: { x: 90.5, z: 50.8, faceX: 86, faceZ: 40 },
  },
  {
    anchor: 'landingRings', icon: 'iTarget', arm: 0x7a5410, balloon: 0xf0b030, panels: [],
    beacon: { x: 148, z: 6, h: 22 }, board: { x: NaN, z: NaN, faceX: 0, faceZ: 0 },
  },
];

const byAnchor = (a: AnchorName): Attraction => {
  const r = ATTRACTIONS.find((q) => q.anchor === a);
  if (!r) throw new Error(a);
  return r;
};

/** Fingerposts: plaza (big, every attraction) and smaller ones at road junctions. */
export const FINGERPOSTS: readonly { x: number; z: number; scale: number; targets: AnchorName[] }[] = [
  { x: 12, z: 2, scale: 1, targets: ['garage', 'trampoline', 'bouncePads', 'launchPads', 'landingRings', 'balloon'] },
  { x: 49, z: 5, scale: 0.85, targets: ['trampoline', 'garage', 'launchPads', 'balloon'] },
  { x: 57.5, z: 32, scale: 0.85, targets: ['launchPads', 'balloon', 'landingRings', 'garage'] },
  { x: 63.5, z: 47.5, scale: 0.85, targets: ['balloon', 'landingRings', 'launchPads'] },
  { x: 1.5, z: 78.5, scale: 0.85, targets: ['balloon', 'landingRings'] },
];

/** Roads that get painted chevrons, all pointing forward along the road (towards attractions). */
const CHEVRON_ROADS = ['park', 'east', 'south', 'loop', 'rocket', 'parklink'];

export interface ArmInfo {
  x: number;
  z: number;
  /** Direction the arm points (atan2(dx, dz), same convention as anchor yaw). */
  yaw: number;
  target: AnchorName;
}

export interface Placed {
  kind: 'board' | 'beacon' | 'post';
  name: string;
  x: number;
  z: number;
  /** Footprint radius (for boards: half the depth; see `hw`). */
  r: number;
  /** Boards: facing yaw and half width along the board. */
  yaw?: number;
  hw?: number;
}

export interface BeaconDef {
  anchor: AnchorName;
  icon: IconId;
  color: number;
  /** Top of the tether stake (rope start). */
  base: THREE.Vector3;
  /** Balloon centre height above the base. */
  h: number;
}

export interface Wayfinding {
  decals: Decals;
  arms: ArmInfo[];
  placed: Placed[];
  beacons: BeaconDef[];
  keepouts: Keepout[];
}

const CREAM = 0xf1ead8;
const SLATE = 0x2c3038;

/** Flat-ish triangular prism, tip at +X (length 1), base height 1 along Y, depth 1 along Z, centred. */
let tipGeo: THREE.BufferGeometry | null = null;
function tipG(): THREE.BufferGeometry {
  if (tipGeo) return tipGeo;
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.lineTo(1, 0);
  s.lineTo(0, 0.5);
  s.closePath();
  tipGeo = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
  return tipGeo;
}

/** A flat shape lying on the ground (XZ), pointing +Z. */
function flatShape(pts: readonly [number, number][]): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], -pts[0][1]);
  for (const [x, y] of pts.slice(1)) s.lineTo(x, -y);
  s.closePath();
  // Shape y = −forward, so after rotateX(−π/2) forward is +Z.
  return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2);
}

const ARROW_PTS: [number, number][] = [[-0.32, -0.5], [0.32, -0.5], [0.32, 0.05], [0.7, 0.05], [0, 0.5], [-0.7, 0.05], [-0.32, 0.05]];
const CHEVRON_PTS: [number, number][] = [[-0.9, -0.45], [0, 0.4], [0.9, -0.45], [0.9, 0.0], [0, 0.85], [-0.9, 0.0]];

function distLabel(d: number): number {
  return d < 45 ? 1 : d < 80 ? 2 : d < 115 ? 3 : 4;
}

function fingerpost(k: Kit, d: Decals, x: number, z: number, targets: readonly AnchorName[], s: number, arms: ArmInfo[]): void {
  const y = k.h(x, z);
  const list = targets
    .map((t) => {
      const a = ANCHORS[t];
      return { t, yaw: Math.atan2(a.x - x, a.z - z), dist: Math.hypot(a.x - x, a.z - z) };
    })
    .sort((p, q) => p.yaw - q.yaw);
  const L = 2.5 * s;
  const H = 0.5 * s;
  const gap = 0.6 * s;
  // Lowest arm just above head height; the top arm stays inside the on-foot camera's view.
  const lowest = 1.55;
  const top = lowest + (list.length - 1) * gap + H / 2 + 0.3 * s;
  // Stone plinth, timber post, gold finial.
  k.b.add('matte', rbox(1.0 * s, 0.45, 1.0 * s, 0.06), C.stone, T(x, y - 0.05, z), { aoY: y, aoH: 0.3, ao: 0.35 });
  k.b.add('paint', rbox(0.34 * s, top, 0.34 * s, 0.04), C.woodDark, T(x, y + 0.35, z), { aoY: y + 0.35, aoH: 0.6, ao: 0.3 });
  k.b.add('paint', coneG(4), C.woodDark, T(x, y + 0.35 + top, z, Math.PI / 4, 0.26 * s, 0.22 * s, 0.26 * s));
  k.b.add('gloss', sphereG(2), 0xf2c14e, T(x, y + 0.35 + top + 0.32 * s, z, 0, 0.2 * s, 0.2 * s, 0.2 * s));
  k.col.cyl(x, y, z, (top + 0.4) / 2, 0.5 * s);
  list.forEach((a, i) => {
    const ay = y + 0.35 + lowest + (list.length - 1 - i) * gap;
    const att = byAnchor(a.t);
    // Local frame: +X along the arm, ±Z are the two faces.
    const am = T(x, ay, z, a.yaw - Math.PI / 2);
    const x0 = 0.12 * s;
    const len = L - 0.5 * s;
    k.b.add('paint', rbox(len, H, 0.1 * s, 0.03), CREAM, M(am, T(x0 + len / 2, -H / 2, 0)));
    k.b.add('paint', rbox(len - 0.1 * s, H - 0.12 * s, 0.17 * s, 0.03), att.arm, M(am, T(x0 + len / 2 - 0.05 * s, -H / 2 + 0.06 * s, 0)));
    k.b.add('paint', tipG(), CREAM, M(am, T(x0 + len - 0.02, 0, 0, 0, 0.62 * s, H * 1.45, 0.1 * s)));
    k.b.add('paint', tipG(), att.arm, M(am, T(x0 + len - 0.1 * s, 0, 0, 0, 0.56 * s, H * 1.18, 0.17 * s)));
    // Side icons (both faces) and distance bars.
    const iconX = x0 + 1.05 * s;
    d.add(att.icon, M(am, T(iconX, 0, 0.087 * s)), H * 0.9, H * 0.9, true, 0.174 * s);
    const n = distLabel(a.dist);
    for (let j = 0; j < n; j++) k.b.add('paint', boxG2(), CREAM, M(am, T(x0 + 0.26 * s + j * 0.15 * s, 0, 0, 0, 0.08 * s, H * 0.52, 0.2 * s)));
    // Roundel across the arm (faces along it): legible when the arm points towards or away from you.
    const rx = x0 + (i % 2 ? 1.5 : 2.02) * s;
    const R = 0.37 * s;
    k.b.add('paint', cylG(28), CREAM, M(am, T(rx - 0.05 * s, 0, 0, 0, R, 0.1 * s, R, 0, -Math.PI / 2)));
    d.add(att.icon, M(am, T(rx + 0.056 * s, 0, 0, Math.PI / 2)), R * 1.86, R * 1.86, true, 0.112 * s);
    arms.push({ x, z, yaw: a.yaw, target: a.t });
  });
}

/** Unit box centred on its origin (the cached `boxG` sits on its base). */
let boxC: THREE.BufferGeometry | null = null;
function boxG2(): THREE.BufferGeometry {
  return (boxC ??= new THREE.BoxGeometry(1, 1, 1));
}

function howToBoard(k: Kit, d: Decals, att: Attraction): Placed {
  const { x, z, faceX, faceZ } = att.board;
  const y = k.h(x, z);
  const yaw = Math.atan2(faceX - x, faceZ - z);
  const m = T(x, y, z, yaw);
  const n = att.panels.length;
  const P = 1.45;
  const G = 0.34;
  const W = n * P + (n - 1) * G + 0.44;
  const Hb = P + 0.4;
  const yb = 1.0;
  const b = k.b;
  // Posts (with caps), cream frame, dark wooden board, slate roof.
  for (const s of [-1, 1]) {
    const px = s * (W / 2 + 0.07);
    b.add('paint', rbox(0.24, yb + Hb + 0.35, 0.24, 0.04), C.woodDark, M(m, T(px, -0.1, 0)), { aoY: y, aoH: 0.5, ao: 0.35 });
    b.add('matte', rbox(0.5, 0.3, 0.5, 0.05), C.stone, M(m, T(px, -0.1, 0)), { aoY: y, aoH: 0.3, ao: 0.3 });
  }
  b.add('paint', rbox(W + 0.16, Hb + 0.16, 0.1, 0.03), CREAM, M(m, T(0, yb - 0.08, 0)));
  b.add('paint', rbox(W, Hb, 0.14, 0.03), 0x5a3b26, M(m, T(0, yb, 0)));
  const roofY = yb + Hb + 0.12;
  for (const s of [-1, 1]) b.add('paint', boxG2(), SLATE, M(m, T(0, roofY + 0.12, s * 0.2, 0, W + 0.5, 0.09, 0.5, -s * 0.42)));
  b.add('metal', boxG2(), 0x1f2228, M(m, T(0, roofY + 0.22, 0, 0, W + 0.52, 0.07, 0.1)));
  // Panels: front reads left→right; the back shows the same steps, also left→right from behind.
  const yc = yb + Hb / 2;
  for (let i = 0; i < n; i++) {
    const px = -W / 2 + 0.22 + P / 2 + i * (P + G);
    d.add(att.panels[i], M(m, T(px, yc, 0.074)), P);
    d.add(att.panels[i], M(m, T(-px, yc, -0.074, Math.PI)), P);
    if (i < n - 1) {
      const ax = px + P / 2 + G / 2;
      for (const f of [1, -1]) b.add('paint', tipG(), 0xf2c14e, M(m, T(f * ax - f * 0.09, yc, f * 0.08, f > 0 ? 0 : Math.PI, 0.2, 0.34, 0.04)));
    }
  }
  // Header roundel with the attraction's icon.
  const hy = roofY + 0.95;
  b.add('paint', rbox(0.14, 0.7, 0.14, 0.03), C.woodDark, M(m, T(0, roofY + 0.1, 0)));
  b.add('paint', cylG(32), CREAM, M(m, T(0, hy, -0.06, 0, 0.66, 0.12, 0.66, Math.PI / 2)));
  d.add(att.icon, M(m, T(0, hy, 0.065)), 1.22, 1.22, true, 0.13);
  k.col.box(m, 0, (roofY + 0.3) / 2, 0, W / 2 + 0.1, (roofY + 0.3) / 2, 0.25);
  return { kind: 'board', name: att.anchor, x, z, r: 0.35, yaw, hw: W / 2 + 0.15 };
}

function beaconStake(k: Kit, att: Attraction): BeaconDef {
  const { x, z, h } = att.beacon;
  const y = k.h(x, z);
  k.b.add('matte', rbox(1.0, 0.55, 1.0, 0.08), C.stoneDark, T(x, y - 0.05, z, 0.4), { aoY: y, aoH: 0.3, ao: 0.4 });
  k.b.add('metal', rbox(0.16, 0.5, 0.16, 0.03), C.iron, T(x, y + 0.45, z));
  k.b.add('metal', torusG(0.05, 16, Math.PI * 2, 0.16), C.iron, T(x, y + 1.0, z, 0, 1, 1, 1, Math.PI / 2));
  k.col.box(T(x, y, z, 0.4), 0, 0.3, 0, 0.5, 0.35, 0.5);
  return { anchor: att.anchor, icon: att.icon, color: att.balloon, base: new THREE.Vector3(x, y + 1.0, z), h };
}

/** Painted arrows on the plaza paving towards each road that leads to attractions, plus a ground icon. */
function plazaArrows(k: Kit, d: Decals): void {
  const exits: { at: [number, number]; icon: IconId }[] = [
    { at: [14, -8], icon: 'iTrampoline' },
    { at: [12, 8], icon: 'iCar' },
    { at: [0, 16], icon: 'iBalloon' },
  ];
  const arrow = flatShape(ARROW_PTS);
  for (const e of exits) {
    const dx = e.at[0] - PLAZA.x;
    const dz = e.at[1] - PLAZA.z;
    const l = Math.hypot(dx, dz);
    const ux = dx / l;
    const uz = dz / l;
    const yaw = Math.atan2(ux, uz);
    const ax = PLAZA.x + ux * 17;
    const az = PLAZA.z + uz * 17;
    const y = k.h(ax, az);
    k.b.add('road', arrow, CREAM, T(ax, y + 0.1, az, yaw, 2.6, 1, 3.9));
    k.b.add('road', arrow, SLATE, T(ax, y + 0.11, az, yaw, 2.1, 1, 3.2));
    const ix = PLAZA.x + ux * 13.3;
    const iz = PLAZA.z + uz * 13.3;
    // Lying flat, its top towards the road.
    d.add(e.icon, T(ix, k.h(ix, iz) + 0.12, iz, yaw + Math.PI, 1, 1, 1, -Math.PI / 2), 2.3);
  }
  arrow.dispose();
}

function distToPolyline(pts: readonly { x: number; z: number }[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
    best = Math.min(best, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
  }
  return best;
}

/** Distance from (x, z) to the nearest road edge (negative = on the road). */
export function roadEdgeDistance(roads: readonly ProcessedRoad[], x: number, z: number): number {
  let best = Infinity;
  for (const r of roads) best = Math.min(best, distToPolyline(r.pts, x, z) - r.def.width / 2);
  return best;
}

/** Painted chevrons every ~20 m along roads to the attractions (forward = towards the attraction). */
function chevrons(k: Kit, roads: readonly ProcessedRoad[], blocked: (x: number, z: number) => boolean): void {
  const geo = flatShape(CHEVRON_PTS);
  for (const r of roads) {
    if (!CHEVRON_ROADS.includes(r.def.id)) continue;
    const others = roads.filter((o) => o !== r);
    const dark = !r.def.kerb;
    const col = dark ? 0x353a43 : 0xf3efe3;
    let acc = 0;
    let next = r.def.kind === 'path' ? 4 : 12;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i];
      const b = r.pts[i + 1];
      const seg = Math.hypot(b.x - a.x, b.z - a.z);
      while (acc + seg >= next) {
        const t = (next - acc) / seg;
        next += 20;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r + 2) continue;
        if (others.some((o) => distToPolyline(o.pts, x, z) < o.def.width / 2 + 2.5)) continue;
        if (blocked(x, z)) continue;
        const ux = (b.x - a.x) / seg;
        const uz = (b.z - a.z) / seg;
        const yaw = Math.atan2(ux, uz);
        const y0 = k.h(x - ux, z - uz);
        const y1 = k.h(x + ux, z + uz);
        const pitch = -Math.atan2(y1 - y0, 2);
        // Follow the cross slope too (local +X is to the right of travel).
        const roll = Math.atan2(k.h(x + uz, z - ux) - k.h(x - uz, z + ux), 2);
        const sc = Math.min(1, r.def.width / 7);
        for (const off of [-0.55, 0.55]) {
          const cx = x + ux * off * sc;
          const cz = z + uz * off * sc;
          k.b.add('road', geo, col, T(cx, k.h(cx, cz) + 0.16, cz, yaw, sc, 1, sc, pitch, roll));
        }
      }
      acc += seg;
    }
  }
  geo.dispose();
}

/** Bouncy landing zone where the rocket-pad flight ends (the net itself is built by the activity). */
function landingZone(k: Kit): void {
  const { x, z, radius } = LAUNCH_NET;
  const y = k.h(x, z) + 0.06;
  const rings: [number, number, number][] = [[radius + 0.6, radius + 1.1, CREAM], [radius - 0.2, radius + 0.6, 0x2f6f73], [0, radius - 0.2, 0xeee2c6]];
  for (const [r0, r1, c] of rings) {
    const g = r0 === 0 ? new THREE.CircleGeometry(r1, 40) : new THREE.RingGeometry(r0, r1, 56, 1);
    g.rotateX(-Math.PI / 2);
    k.b.add('rubber', g, c, T(x, y, z));
    g.dispose();
  }
}

export function buildWayfinding(k: Kit, roads: readonly ProcessedRoad[], blocked: (x: number, z: number) => boolean): Wayfinding {
  const decals = new Decals();
  const arms: ArmInfo[] = [];
  const placed: Placed[] = [];
  const beacons: BeaconDef[] = [];
  const keepouts: Keepout[] = [];
  for (const p of FINGERPOSTS) {
    fingerpost(k, decals, p.x, p.z, p.targets, p.scale, arms);
    placed.push({ kind: 'post', name: `post ${p.x},${p.z}`, x: p.x, z: p.z, r: 0.6 * p.scale });
    keepouts.push({ x: p.x, z: p.z, r: 1.6 });
  }
  for (const att of ATTRACTIONS) {
    if (att.panels.length) {
      const pl = howToBoard(k, decals, att);
      placed.push(pl);
      keepouts.push({ x: pl.x, z: pl.z, r: (pl.hw ?? 0) + 1.2 });
    }
    beacons.push(beaconStake(k, att));
    placed.push({ kind: 'beacon', name: att.anchor, x: att.beacon.x, z: att.beacon.z, r: 0.75 });
    keepouts.push({ x: att.beacon.x, z: att.beacon.z, r: 2.2 });
  }
  plazaArrows(k, decals);
  chevrons(k, roads, blocked);
  landingZone(k);
  keepouts.push({ x: LAUNCH_NET.x, z: LAUNCH_NET.z, r: LAUNCH_NET.radius + 1.5, mown: true });
  return { decals, arms, placed, beacons, keepouts };
}
