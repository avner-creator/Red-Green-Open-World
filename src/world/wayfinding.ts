/**
 * Wayfinding: the plaza fingerpost, junction fingerposts, painted ground arrows and road chevrons,
 * "how to play" picture boards at each attraction, and the tether stakes of the beacon balloons.
 * Everything here is static (batched + one pictogram decal mesh) and wordless. Pure: no WebGL, so
 * unit tests can build it and check arm directions and placements.
 */
import * as THREE from 'three';
import { M, T } from './batch';
import { C, type Kit } from './props';
import { cylG, rbox, sphereG, torusG, coneG } from './shapes';
import { LAUNCH_NET } from './layout';
import { PLAZA } from './village';
import type { ProcessedRoad } from './terrain';
import type { Keepout } from './scatter';
import { Decals } from './decals';
import { tallPennant } from './outer/common';
import type { IconId } from './pictograms';
import { ATTRACTIONS, GLASSES_WAY, wayTarget, type Attraction, type GlassesWay, type WayTarget } from './attractions';

export { ATTRACTIONS, GLASSES_WAY, type Attraction, type WayTarget } from './attractions';

export interface FingerpostDef {
  x: number;
  z: number;
  scale: number;
  targets: WayTarget[];
  /**
   * Plaza post only: arms grouped into rows (bottom → top) so six arms fit in 1.3 m, and the arms
   * that point (nearly) straight away from the spawn camera, which get an icon disc hanging from
   * their tip that faces back along the arm.
   */
  rows?: WayTarget[][];
  hang?: WayTarget[];
  /** Candy-striped post (the Carnival Island post next to the plaza post). */
  stripe?: boolean;
}

/**
 * Fingerposts: plaza (big, every attraction) and smaller ones at road junctions. The plaza post
 * stands ~9 m ahead of the spawn point, 2.5 m left of the line of sight, so the spawn camera sees
 * its arms broadside (big icon discs on both faces) between 2.2 and 3.5 m up, below the HUD, and
 * the player's path east stays clear.
 */
/** The toys trail-head flag (beside the toys fingerpost). */
export const TOYS_FLAG = { x: -8.4, z: 71.2 } as const;

export const FINGERPOSTS: readonly FingerpostDef[] = [
  {
    x: 8.4, z: 4.9, scale: 1,
    targets: ['garage', 'trampoline', 'bouncePads', 'launchPads', 'landingRings', 'balloon', 'ranch', 'bungee', 'sillyZone', 'lakePlatform', 'lighthouse'],
    // Arms that share a row point at least ~50° apart so they never overlap.
    rows: [['balloon', 'bouncePads', 'trampoline'], ['garage', 'sillyZone', 'lakePlatform', 'bungee'], ['launchPads', 'ranch', 'lighthouse'], ['landingRings']],
    hang: ['bouncePads', 'trampoline', 'ranch'],
  },
  // Carnival Island post: on the plaza's south-east rim, right of the spawn camera's line of sight and
  // clear of the plaza chest
  // (the plaza post is left of it), so both read from the spawn view. Arms in three rows; the race arm
  // points straight away from the camera, so it also carries a hanging disc.
  {
    x: 8, z: 14.8, scale: 1, stripe: true,
    targets: ['raceStart', 'foamCourse', 'dinoRing', 'iceCream', 'bubbleArena', 'dragonRoost', 'carnivalRow', 'airstrip'],
    rows: [['raceStart', 'foamCourse', 'dinoRing'], ['iceCream', 'bubbleArena', 'dragonRoost'], ['carnivalRow', 'airstrip']],
    hang: ['raceStart'],
  },
  // Glasses-play post: on the plaza's west rim where the west road leaves (towards the two nearest
  // glasses sites), a few steps behind and left of spawn. Six arms in two rows (≥ 60° apart in a row);
  // the two arms pointing straight down the west road carry hanging discs.
  {
    x: -10, z: 12.5, scale: 1,
    targets: ['toys', 'glowflies', 'lineup', 'oddone', 'gates', 'dotsigns'],
    rows: [['toys', 'glowflies', 'lineup'], ['oddone', 'gates', 'dotsigns']],
    hang: ['toys'],
  },
  { x: 49, z: 5, scale: 0.85, targets: ['trampoline', 'garage', 'launchPads', 'balloon', 'raceStart', 'funfair'] },
  { x: 57.5, z: 32, scale: 0.85, targets: ['launchPads', 'balloon', 'landingRings', 'garage'] },
  { x: 63.5, z: 47.5, scale: 0.85, targets: ['balloon', 'landingRings', 'launchPads', 'cove'] },
  { x: 1.5, z: 78.5, scale: 0.85, targets: ['balloon', 'landingRings', 'sillyZone', 'dinoRing', 'bubbleArena', 'rainbow', 'farm'] },
  // Carnival Island junctions: where each footpath leaves its road.
  { x: 16.2, z: -16.4, scale: 0.85, targets: ['carnivalRow', 'trampoline', 'iceCream'] },
  { x: 10.6, z: 42, scale: 0.85, targets: ['dinoRing', 'bubbleArena', 'airstrip', 'balloon'] },
  // North end of the village street (outer roads + Carnival Island paths share this junction).
  { x: -6.5, z: -61, scale: 0.85, targets: ['bungee', 'lighthouse', 'dragonRoost', 'carnivalRow', 'foamCourse'] },
  // The bridge's far end, the roost path, the ranch approach.
  { x: 6.5, z: -138, scale: 0.85, targets: ['lighthouse', 'bungee', 'lookout'] },
  { x: 4.6, z: -133, scale: 0.85, targets: ['dragonRoost'] },
  // Glasses booths hidden behind a crest or cliff: an arm with their pictogram where the child arrives.
  { x: -8, z: 69.5, scale: 1, stripe: true, targets: ['toys'] },
  { x: 65.2, z: -80.6, scale: 0.85, targets: ['lineup'] },
  // Where the roost footpath leaves the north road (QA round 3: make the way up to the roost obvious).
  { x: -22, z: -135.8, scale: 0.85, targets: ['dragonRoost', 'lighthouse', 'bungee'] },
  { x: -44, z: 30, scale: 0.85, targets: ['ranch', 'lakePlatform', 'farm', 'huts'] },
];

/** Roads that get painted chevrons, all pointing forward along the road (towards attractions). */
const CHEVRON_ROADS = [
  'park', 'east', 'south', 'loop', 'rocket', 'parklink', 'west', 'ridge', 'north', 'beach',
  'carnivalPath', 'foamPath', 'arenaPath', 'airPath', 'roostPath',
];

export interface ArmInfo {
  x: number;
  z: number;
  /** Direction the arm points (atan2(dx, dz), same convention as anchor yaw). */
  yaw: number;
  target: WayTarget;
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
  anchor: WayTarget;
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

/** Height of the lowest arm's centre above the ground (well above the player's head). */
const ARM_LOW = 2.2;

function fingerpost(k: Kit, d: Decals, def: FingerpostDef, arms: ArmInfo[]): void {
  const { x, z, scale: s, targets } = def;
  const y = k.h(x, z);
  const list = targets
    .map((t) => {
      const a = wayTarget(t);
      return { t, yaw: Math.atan2(a.x - x, a.z - z), dist: Math.hypot(a.x - x, a.z - z) };
    })
    .sort((p, q) => p.yaw - q.yaw);
  // Row of each arm: explicit rows, else one arm per row with the smallest yaw on top.
  const rowOf = (t: WayTarget, i: number): number => (def.rows ? def.rows.findIndex((r) => r.includes(t)) : list.length - 1 - i);
  const rows = def.rows ? def.rows.length : list.length;
  const plaza = !!def.rows;
  const L = (plaza ? 2.9 : 2.5) * s;
  const H = (plaza ? 0.4 : 0.5) * s;
  const gap = (plaza ? 0.42 : 0.58) * s;
  const top = ARM_LOW + (rows - 1) * gap + H / 2 + 0.3 * s;
  const pw = (plaza ? 0.32 : 0.4) * s;
  // Stone plinth, timber post, gold finial.
  k.b.add('matte', rbox(1.0 * s, 0.45, 1.0 * s, 0.06), C.stone, T(x, y - 0.05, z), { aoY: y, aoH: 0.3, ao: 0.35 });
  if (def.stripe) {
    // Candy stripes: cream and red bands, a navy collar under the arms.
    const n = Math.round(top / 0.5);
    for (let i = 0; i < n; i++) k.b.add('paint', cylG(12), i % 2 ? 0xc8433a : CREAM, T(x, y + (i * top) / n, z, 0, pw * 0.62, top / n, pw * 0.62));
    k.b.add('paint', cylG(12), 0x24476a, T(x, y + ARM_LOW - 0.65 * s, z, 0, pw * 0.75, 0.3, pw * 0.75));
  } else k.b.add('paint', rbox(pw, top, pw, 0.05), C.woodDark, T(x, y, z), { aoY: y, aoH: 0.6, ao: 0.3 });
  k.b.add('paint', coneG(4), C.woodDark, T(x, y + top, z, Math.PI / 4, 0.22 * s, 0.22 * s, 0.22 * s));
  k.b.add('gloss', sphereG(2), 0xf2c14e, T(x, y + top + 0.3 * s, z, 0, 0.18 * s, 0.18 * s, 0.18 * s));
  k.col.cyl(x, y, z, (top + 0.4) / 2, 0.5 * s);
  list.forEach((a, i) => {
    const row = rowOf(a.t, i);
    const ay = y + ARM_LOW + row * gap;
    const att = wayTarget(a.t);
    // Local frame: +X along the arm, ±Z are the two faces.
    const am = T(x, ay, z, a.yaw - Math.PI / 2);
    const x0 = pw * 0.3;
    const len = L - 0.5 * s;
    k.b.add('paint', rbox(len, H, 0.1 * s, 0.03), CREAM, M(am, T(x0 + len / 2, -H / 2, 0)));
    k.b.add('paint', rbox(len - 0.1 * s, H - 0.12 * s, 0.17 * s, 0.03), att.arm, M(am, T(x0 + len / 2 - 0.05 * s, -H / 2 + 0.06 * s, 0)));
    k.b.add('paint', tipG(), CREAM, M(am, T(x0 + len - 0.02, 0, 0, 0, 0.62 * s, H * 1.45, 0.1 * s)));
    k.b.add('paint', tipG(), att.arm, M(am, T(x0 + len - 0.1 * s, 0, 0, 0, 0.56 * s, H * 1.18, 0.17 * s)));
    const n = distLabel(a.dist);
    for (let j = 0; j < n; j++) k.b.add('paint', boxG2(), CREAM, M(am, T(x0 + 0.26 * s + j * 0.15 * s, 0, 0, 0, 0.08 * s, H * 0.52, 0.2 * s)));
    if (plaza) {
      // Big icon discs on both faces (wider than the arm), staggered along the arm row by row.
      const R = 0.34 * s;
      const dx = x0 + (row % 2 ? 1.85 : 1.15) * s;
      k.b.add('paint', cylG(18), CREAM, M(am, T(dx, 0, -0.13 * s, 0, R, 0.26 * s, R, Math.PI / 2)));
      d.add(att.icon, M(am, T(dx, 0, 0.132 * s)), R * 1.8, R * 1.8, true, 0.264 * s);
    } else {
      d.add(att.icon, M(am, T(x0 + 1.05 * s, 0, 0.087 * s)), H * 0.9, H * 0.9, true, 0.174 * s);
    }
    // Disc across the arm (faces along it): legible when the arm points towards or away from you.
    // Junction posts carry it on the arm; on the plaza post it hangs below the tip, clear of the arm.
    const hang = def.hang?.includes(a.t) ?? false;
    if (!plaza || hang) {
      const R = (hang ? 0.48 : 0.4) * s;
      const rx = x0 + (hang ? len - 0.25 * s : (i % 2 ? 1.5 : 2.02) * s);
      const ry = hang ? -H / 2 - 0.07 * s - R : 0;
      if (hang) k.b.add('metal', boxG2(), C.iron, M(am, T(rx, -H / 2 - 0.05 * s, 0, 0, 0.05 * s, 0.12 * s, 0.05 * s)));
      k.b.add('paint', cylG(18), CREAM, M(am, T(rx - 0.05 * s, ry, 0, 0, R, 0.1 * s, R, 0, -Math.PI / 2)));
      d.add(att.icon, M(am, T(rx + 0.056 * s, ry, 0, Math.PI / 2)), R * 1.86, R * 1.86, true, 0.112 * s);
    }
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

function beaconStake(k: Kit, att: Pick<Attraction, 'icon' | 'balloon' | 'beacon'> & { anchor: WayTarget }): BeaconDef {
  const { x, z, h } = att.beacon;
  const y = k.h(x, z);
  k.b.add('matte', rbox(1.0, 0.55, 1.0, 0.08), C.stoneDark, T(x, y - 0.05, z, 0.4), { aoY: y, aoH: 0.3, ao: 0.4 });
  k.b.add('metal', rbox(0.16, 0.5, 0.16, 0.03), C.iron, T(x, y + 0.45, z));
  k.b.add('metal', torusG(0.05, 16, Math.PI * 2, 0.16), C.iron, T(x, y + 1.0, z, 0, 1, 1, 1, Math.PI / 2));
  k.col.box(T(x, y, z, 0.4), 0, 0.3, 0, 0.5, 0.35, 0.5);
  return { anchor: att.anchor, icon: att.icon, color: att.balloon, base: new THREE.Vector3(x, y + 1.0, z), h };
}

function glassesBeacon(k: Kit, g: GlassesWay): BeaconDef {
  return beaconStake(k, { anchor: g.id, icon: g.icon, balloon: g.balloon, beacon: g.beacon });
}

/**
 * Stepping-stone trail from the nearest road edge to the edge of a glasses site: flat stones in a
 * gentle zig-zag, flush with the ground (no colliders). Returns the stone spots (scatter keepouts).
 */
function steppingStones(k: Kit, roads: readonly ProcessedRoad[], g: GlassesWay): Keepout[] {
  // Nearest point on any road centreline, then the edge point towards the site.
  let best = { d: Infinity, x: 0, z: 0, w: 0 };
  for (const r of roads) {
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i];
      const b = r.pts[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((g.x - a.x) * dx + (g.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      const px = a.x + dx * t;
      const pz = a.z + dz * t;
      const d = Math.hypot(g.x - px, g.z - pz);
      if (d < best.d) best = { d, x: px, z: pz, w: r.def.width };
    }
  }
  return layStones(k, best.x, best.z, g.x, g.z, best.w / 2 + 0.7, best.d - g.r + 0.4);
}

/**
 * Extra stepping-stone paths from a given road point straight to a site's pad (where a child arrives
 * along a different road than the nearest one).
 */
const EXTRA_STONE_PATHS: readonly { id: string; from: readonly [number, number] }[] = [
  // Gates: from the loop road (the race lap) down to the pad.
  { id: 'gates', from: [46, 82] },
];

function extraStonePaths(k: Kit, roads: readonly ProcessedRoad[]): Keepout[] {
  const out: Keepout[] = [];
  for (const p of EXTRA_STONE_PATHS) {
    const g = GLASSES_WAY.find((q) => q.id === p.id);
    if (!g) continue;
    const [fx, fz] = p.from;
    // Start just past the road edge, stop at the pad's rim.
    const d = Math.hypot(g.x - fx, g.z - fz);
    const ux = (g.x - fx) / d;
    const uz = (g.z - fz) / d;
    let s0 = 0;
    while (s0 < d && roadEdgeDistance(roads, fx + ux * s0, fz + uz * s0) < 0.7) s0 += 0.25;
    out.push(...layStones(k, fx, fz, g.x, g.z, s0, d - g.r + 0.4));
  }
  return out;
}

/** Flat stones from (fx, fz) towards (tx, tz), between distances s0 and s1, in a gentle zig-zag. */
function layStones(k: Kit, fx: number, fz: number, tx: number, tz: number, s0: number, s1: number): Keepout[] {
  const best = { x: fx, z: fz, d: Math.hypot(tx - fx, tz - fz) };
  const g = { x: tx, z: tz };
  const ux = (g.x - best.x) / best.d;
  const uz = (g.z - best.z) / best.d;
  const out: Keepout[] = [];
  const n = Math.max(2, Math.round((s1 - s0) / 1.15));
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n;
    const side = (i % 2 ? 1 : -1) * 0.28;
    const x = best.x + ux * s - uz * side;
    const z = best.z + uz * s + ux * side;
    const y = k.h(x, z);
    const rr = 0.36 + ((i * 37) % 7) * 0.012;
    k.b.add('matte', cylG(10), i % 3 ? C.stone : 0xbcb29f, T(x, y - 0.05, z, i * 1.3, rr * 1.15, 0.1, rr), { aoY: y, aoH: 0.12, ao: 0.25 });
    out.push({ x, z, r: 0.8, mown: true });
  }
  return out;
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

/**
 * Zebra crossings where a stepping-stone trail leaves a road (odd one out on the west road): cream bars
 * on the dark asphalt (bright on dark in both colour channels), flush with the road surface.
 */
const CROSSINGS: readonly { road: string; site: string }[] = [{ road: 'west', site: 'oddone' }];

function crossings(k: Kit, roads: readonly ProcessedRoad[]): void {
  for (const c of CROSSINGS) {
    const r = roads.find((q) => q.def.id === c.road);
    const g = GLASSES_WAY.find((q) => q.id === c.site);
    if (!r || !g) continue;
    let best = { d: Infinity, x: 0, z: 0, ux: 0, uz: 1 };
    for (let i = 0; i < r.pts.length - 1; i++) {
      const a = r.pts[i];
      const b = r.pts[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l = Math.hypot(dx, dz) || 1;
      const t = Math.max(0, Math.min(1, ((g.x - a.x) * dx + (g.z - a.z) * dz) / (l * l)));
      const px = a.x + dx * t;
      const pz = a.z + dz * t;
      const d = Math.hypot(g.x - px, g.z - pz);
      if (d < best.d) best = { d, x: px, z: pz, ux: dx / l, uz: dz / l };
    }
    const { ux, uz } = best;
    const yaw = Math.atan2(ux, uz);
    const half = r.def.width / 2 - 0.45;
    for (let o = -half; o <= half + 1e-6; o += (2 * half) / 6) {
      const x = best.x + uz * o;
      const z = best.z - ux * o;
      const pitch = -Math.atan2(k.h(x + ux, z + uz) - k.h(x - ux, z - uz), 2);
      const roll = Math.atan2(k.h(x + uz * 0.3, z - ux * 0.3) - k.h(x - uz * 0.3, z + ux * 0.3), 0.6);
      k.b.add('road', rbox(0.5, 0.02, 2.8, 0.01), 0xf3efe3, T(x, k.h(x, z) + 0.15, z, yaw, 1, 1, 1, pitch, roll));
    }
  }
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
    fingerpost(k, decals, p, arms);
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
  // Glasses-play sites: a beacon behind each, the site circle kept clear of scatter, and stepping
  // stones from the road to the two nearest spawn.
  for (const g of GLASSES_WAY) {
    beacons.push(glassesBeacon(k, g));
    placed.push({ kind: 'beacon', name: g.id, x: g.beacon.x, z: g.beacon.z, r: 0.75 });
    keepouts.push({ x: g.beacon.x, z: g.beacon.z, r: 2.2 }, { x: g.x, z: g.z, r: g.r + 2.5 });
    if (g.trail) keepouts.push(...steppingStones(k, roads, g));
  }
  keepouts.push(...extraStonePaths(k, roads));
  // Toys: a tall flag at the trail head shows over the ground crest towards the booth.
  tallPennant(k, TOYS_FLAG.x, TOYS_FLAG.z, 6.5, 0x24476a, Math.atan2(-30.5 - TOYS_FLAG.x, 69.7 - TOYS_FLAG.z));
  placed.push({ kind: 'post', name: 'toys flag', x: TOYS_FLAG.x, z: TOYS_FLAG.z, r: 0.3 });
  plazaArrows(k, decals);
  chevrons(k, roads, blocked);
  crossings(k, roads);
  landingZone(k);
  keepouts.push({ x: LAUNCH_NET.x, z: LAUNCH_NET.z, r: LAUNCH_NET.radius + 1.5, mown: true });
  return { decals, arms, placed, beacons, keepouts };
}
