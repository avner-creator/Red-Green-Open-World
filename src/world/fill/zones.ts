/**
 * Island fill: new themed zones in the empty corners (Fun Fair, Windmill Farm, Sandcastle Cove, Star
 * Lookout, Rainbow Point, Beach Huts, Picnic Grove), gateway arches that announce every zone, trails
 * from the roads to every zone and mini-game site, colour route lines with ground pictograms from the
 * plaza, festoon lights along the roads, bumpable toys, the plaza island map, and a few fixes from
 * playtests. Everything is both-eye, static (toys and spinners move in the vertex shader) and
 * merged into the shared batcher. Nothing here points at a weak-eye object: trails and signs lead to
 * zones and attraction sites only. Pure: no WebGL, so tests can build it and check placements.
 */
import * as THREE from 'three';
import { T } from '../batch';
import { C, hayBale, lamp, type Kit } from '../props';
import { cylG, rbox } from '../shapes';
import type { Decals } from '../decals';
import type { IconId } from '../pictograms';
import type { ProcessedRoad } from '../terrain';
import type { Keepout, ManualTree } from '../scatter';
import { GLASSES_WAY } from '../attractions';
import { ANCHORS } from '../layout';
import { PLAZA } from '../village';
import type { Guard } from './guard';
import { beachBall, duck, mushroom, pinwheel, springFlower, CAPS, TOY_R, type ToyDef, type ToyKind } from './toys';
import {
  barn, beachHut, bigWheel, carousel, festoon, kitePole, lookout, picnicTable, pumpkin, rainbow, sandcastle, scarecrow, telescope, tent,
  umbrella, windmill, wishingWell, zoneArch,
} from './landmarks';
import { mapBoard, MAP_BOARD } from './mapboard';
import { buildFixes } from './fixes';

const CREAM = 0xf1ead8;

export interface Zone {
  id: string;
  icon: IconId;
  /** Arch / route colour (dark enough for cream to read on it in both channels). */
  color: number;
  /** Landmark position (map board, compass-free wayfinding). */
  x: number;
  z: number;
}

/** The new zones (landmark positions). */
export const FILL_ZONES: readonly Zone[] = [
  { id: 'funfair', icon: 'iWheel', color: 0xb8306e, x: 128, z: -64 },
  { id: 'farm', icon: 'iWindmill', color: 0xa4372a, x: -86, z: 106 },
  { id: 'cove', icon: 'iCastle', color: 0x2a6fa8, x: 96, z: 114 },
  { id: 'lookout', icon: 'iLookout', color: 0x2f4f9a, x: 48, z: -132 },
  { id: 'rainbow', icon: 'iRainbow', color: 0x7a3fb0, x: 10, z: 138 },
  { id: 'huts', icon: 'iCastle', color: 0x1f7a8a, x: -138, z: 54 },
  { id: 'picnic', icon: 'iPicnic', color: 0x3d7a2a, x: -48, z: -56 },
];

/** A trail: waypoints from a road (or a pad edge) to a zone or site; `icon` = where it leads. */
export interface TrailDef {
  id: string;
  icon: IconId;
  color: number;
  pts: readonly (readonly [number, number])[];
  /** Arch over the trail at this waypoint index (zone gateway). */
  arch?: number;
}

export const TRAILS: readonly TrailDef[] = [
  { id: 'funfair', icon: 'iWheel', color: 0xb8306e, pts: [[100, -27], [108, -38], [114, -47], [119, -53]], arch: 2 },
  { id: 'farm', icon: 'iWindmill', color: 0xa4372a, pts: [[-68, 63], [-72, 74], [-77, 85], [-82, 95]], arch: 2 },
  { id: 'farm2', icon: 'iWindmill', color: 0xa4372a, pts: [[3, 73], [-10, 80], [-24, 86], [-44, 93], [-64, 100], [-76, 104]] },
  { id: 'cove', icon: 'iCastle', color: 0x2a6fa8, pts: [[64, 82], [72, 92], [80, 100], [88, 106]], arch: 2 },
  { id: 'lookout', icon: 'iLookout', color: 0x2f4f9a, pts: [[6, -134], [18, -133], [30, -132], [40, -131]], arch: 2 },
  { id: 'rainbow', icon: 'iRainbow', color: 0x7a3fb0, pts: [[9, 118], [10, 124], [10, 129], [10, 131]], arch: 3 },
  { id: 'huts', icon: 'iCastle', color: 0x1f7a8a, pts: [[-105, 50], [-116, 52], [-126, 53]], arch: 1 },
  { id: 'picnic', icon: 'iPicnic', color: 0x3d7a2a, pts: [[-26, -11.2], [-36, -11], [-40.5, -18], [-42, -34], [-45, -46]], arch: 3 },
  // Attractions far from a road: a trail from the nearest road end.
  { id: 'rings', icon: 'iTarget', color: 0x7a5410, pts: [[103, 38], [108, 31], [112, 27]] },
  { id: 'lake', icon: 'iLake', color: 0x14506e, pts: [[-102, -11], [-104, -24], [-108, -36], [-112, -44]] },
  { id: 'silly', icon: 'iSilly', color: 0x7a1f6a, pts: [[7.5, 77.5], [8, 82]] },
];

/** Zone arches over the roads where they enter an existing zone. */
const ROAD_ARCHES: readonly { x: number; z: number; yaw: number; span: number; color: number; icon: IconId }[] = [
  { x: 36.5, z: -16.4, yaw: Math.atan2(14, -4), span: 9.4, color: 0x8a2c22, icon: 'iTrampoline' },
  { x: 66.3, z: 38.5, yaw: Math.atan2(7, 16), span: 11, color: 0x553082, icon: 'iBalloon' },
  { x: 20.5, z: 78, yaw: Math.atan2(21, 6), span: 11, color: 0x7a1f6a, icon: 'iSilly' },
  { x: -40, z: 20.7, yaw: Math.atan2(-18, 14), span: 9.4, color: 0x6b3f1e, icon: 'iHorse' },
  { x: 30, z: -66.2, yaw: Math.atan2(24, -6), span: 9.4, color: 0x232c6e, icon: 'iLighthouse' },
  { x: 0, z: -20, yaw: Math.PI, span: 11.2, color: 0x8a2440, icon: 'iCarnival' },
];

/** Route lines from the plaza: road ids in order, colour, and the pictograms painted along them. */
const ROUTES: readonly { roads: readonly string[]; color: number; icons: readonly IconId[] }[] = [
  { roads: ['park'], color: 0xe0513a, icons: ['iTrampoline', 'iBounce', 'iWheel'] },
  { roads: ['east'], color: 0x2f72d8, icons: ['iCar', 'iRocket', 'iBalloon', 'iTarget', 'iCastle'] },
  { roads: ['south', 'loop'], color: 0x7cc243, icons: ['iDino', 'iBubble', 'iPlane', 'iSilly', 'iRainbow', 'iCastle'] },
  { roads: ['west'], color: 0xe08a2e, icons: ['iHorse', 'iLake', 'iWindmill'] },
  { roads: ['main', 'ridge'], color: 0x9a5ad8, icons: ['iCarnival', 'iFoam', 'iBungee', 'iLighthouse', 'iDragon', 'iLookout'] },
];

/** Roads with festoon lights (both sides alternate per road). */
const FESTOON_ROADS = ['park', 'east', 'south', 'loop', 'west', 'carnivalPath', 'arenaPath', 'airPath', 'foamPath', 'ridge', 'north', 'beach', 'rocket', 'roostPath'];
const LIGHTS = [0xffe2b0, 0xffb0c0, 0xb8e0ff, 0xfff2a0];

export interface Fill {
  toys: ToyDef[];
  keepouts: Keepout[];
  trees: ManualTree[];
  /** Everything placed (tests): kind, name, position and footprint radius. */
  placed: { kind: string; name: string; x: number; z: number; r: number }[];
  /** Candidates the guard refused (tests, debugging). */
  refused: { name: string; why: string }[];
}

/** Sample a polyline every `step` metres: points with their unit direction. */
function along(pts: readonly (readonly [number, number])[], step: number): { x: number; z: number; ux: number; uz: number }[] {
  const out: { x: number; z: number; ux: number; uz: number }[] = [];
  let acc = 0;
  let next = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const seg = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / seg;
    const uz = (bz - az) / seg;
    while (acc + seg >= next) {
      const t = (next - acc) / seg;
      out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, ux, uz });
      next += step;
    }
    acc += seg;
  }
  return out;
}

/** Catmull-Rom smoothing so trails curve gently through their waypoints. */
function smooth(pts: readonly (readonly [number, number])[], per = 6): [number, number][] {
  if (pts.length < 3) return pts.map((p) => [p[0], p[1]]);
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < per; j++) {
      const t = j / per;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number): number => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  const last = pts[pts.length - 1];
  out.push([last[0], last[1]]);
  return out;
}

/**
 * A flush gravel trail along the (smoothed) points: a sandy ribbon with darker edges laid on the
 * terrain (no collider), edge pebbles, and a ground pictogram every ~22 m pointing the way.
 */
function trailRibbon(k: Kit, d: Decals, def: TrailDef, width = 2.4): [number, number][] {
  const pts = smooth(def.pts);
  const samples = along(pts, 0.9);
  const half = width / 2;
  const pos: number[] = [];
  const col: number[] = [];
  const cMid = new THREE.Color(0xd9c49a);
  const cEdge = new THREE.Color(0xa88e64);
  const ring = (s: { x: number; z: number; ux: number; uz: number }): number[][] => {
    const nx = -s.uz;
    const nz = s.ux;
    return [-half, -half + 0.28, half - 0.28, half].map((o) => {
      const x = s.x + nx * o;
      const z = s.z + nz * o;
      return [x, k.h(x, z) + 0.07, z];
    });
  };
  for (let i = 0; i < samples.length - 1; i++) {
    const a = ring(samples[i]);
    const b = ring(samples[i + 1]);
    for (let j = 0; j < 3; j++) {
      const c = j === 1 ? cMid : cEdge;
      for (const v of [a[j], b[j], b[j + 1], a[j], b[j + 1], a[j + 1]]) {
        pos.push(...v);
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  k.b.add('road', g, 0xffffff);
  g.dispose();
  // Pebbles along both edges and a ground icon roundel every ~22 m (top of the icon = the way on).
  along(pts, 1.6).forEach((s, i) => {
    const side = i % 2 ? 1 : -1;
    const x = s.x - s.uz * side * (half + 0.25);
    const z = s.z + s.ux * side * (half + 0.25);
    const y = k.h(x, z);
    k.b.add('matte', cylG(7), i % 3 ? C.stone : 0xbcb29f, T(x, y - 0.06, z, i, 0.2, 0.14, 0.16), { aoY: y, aoH: 0.1, ao: 0.2 });
  });
  along(pts, 22).forEach((s, i) => {
    if (i === 0) return;
    const yaw = Math.atan2(s.ux, s.uz);
    const y = k.h(s.x, s.z);
    k.b.add('road', cylG(20), CREAM, T(s.x, y + 0.05, s.z, 0, 0.62, 0.06, 0.62));
    d.add(def.icon, T(s.x, y + 0.12, s.z, yaw + Math.PI, 1, 1, 1, -Math.PI / 2), 1.05);
  });
  return pts;
}

/** Ground roundels with icons and a dashed colour line beside the centre of a road (route lines). */
function routeLine(k: Kit, d: Decals, pts: readonly { x: number; z: number }[], color: number, icons: readonly IconId[], from: number, free: (x: number, z: number) => boolean): void {
  const p2 = pts.map((p) => [p.x, p.z] as [number, number]);
  const cLine = new THREE.Color(color);
  const cRim = new THREE.Color(CREAM);
  const pos: number[] = [];
  const col: number[] = [];
  const dash = (s: { x: number; z: number; ux: number; uz: number }, w: number, len: number, off: number, c: THREE.Color, lift: number): void => {
    const nx = -s.uz;
    const nz = s.ux;
    const cx = s.x + nx * off;
    const cz = s.z + nz * off;
    const corners = [
      [-w / 2, -len / 2], [w / 2, -len / 2], [w / 2, len / 2], [-w / 2, len / 2],
    ].map(([a, b]) => {
      const x = cx + nx * a + s.ux * b;
      const z = cz + nz * a + s.uz * b;
      return [x, k.h(x, z) + lift, z];
    });
    for (const v of [corners[0], corners[2], corners[1], corners[0], corners[3], corners[2]]) {
      pos.push(...v);
      col.push(c.r, c.g, c.b);
    }
  };
  const samples = along(p2, 3);
  samples.forEach((s, i) => {
    if (i * 3 < from || !free(s.x, s.z)) return;
    dash(s, 0.62, 2.2, 1.9, cRim, 0.15);
    dash(s, 0.36, 1.9, 1.9, cLine, 0.17);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  k.b.add('road', g, 0xffffff);
  g.dispose();
  let n = 0;
  along(p2, 26).forEach((s, i) => {
    if (i * 26 < from || !free(s.x, s.z)) return;
    const yaw = Math.atan2(s.ux, s.uz);
    const x = s.x - s.uz * 1.9;
    const z = s.z + s.ux * 1.9;
    const y = k.h(x, z);
    k.b.add('road', cylG(24), CREAM, T(x, y + 0.13, z, 0, 0.85, 0.06, 0.85));
    k.b.add('road', cylG(24), color, T(x, y + 0.14, z, 0, 0.78, 0.06, 0.78));
    d.add(icons[n++ % icons.length], T(x, y + 0.22, z, yaw + Math.PI, 1, 1, 1, -Math.PI / 2), 1.3);
  });
}

/** A small trail-head post: one arm pointing along the trail with the destination icon. */
function trailPost(k: Kit, d: Decals, x: number, z: number, yaw: number, color: number, icon: IconId): void {
  const y = k.h(x, z);
  k.b.add('paint', rbox(0.22, 2.7, 0.22, 0.04), 0x6a4630, T(x, y, z), { aoY: y, aoH: 0.4, ao: 0.3 });
  const m = T(x, y + 2.2, z, yaw - Math.PI / 2);
  k.b.add('paint', rbox(1.6, 0.5, 0.1, 0.03), CREAM, m.clone().multiply(T(0.85, -0.25, 0)));
  k.b.add('paint', rbox(1.5, 0.4, 0.16, 0.03), color, m.clone().multiply(T(0.85, -0.2, 0)));
  k.b.add('paint', cylG(20), CREAM, m.clone().multiply(T(1.0, 0, 0, 0, 0.36, 0.2, 0.36, Math.PI / 2)));
  d.add(icon, m.clone().multiply(T(1.0, 0, 0.11)), 0.62, 0.62, true, 0.22);
  k.col.cyl(x, y, z, 1.35, 0.16);
}

export function buildFill(k: Kit, roads: readonly ProcessedRoad[], d: Decals, guard: Guard): Fill {
  const fill: Fill = { toys: [], keepouts: [], trees: [], placed: [], refused: [] };
  const place = (kind: string, name: string, x: number, z: number, r: number, opts?: Parameters<Guard['free']>[3]): boolean => {
    const why = guard.why(x, z, r, opts);
    if (why) {
      fill.refused.push({ name: `${kind} ${name}`, why });
      return false;
    }
    guard.take(x, z, r);
    fill.placed.push({ kind, name, x, z, r });
    fill.keepouts.push({ x, z, r: r + 0.6 });
    return true;
  };
  const toy = (kind: ToyKind, x: number, z: number, i: number, opts?: Parameters<Guard['free']>[3]): void => {
    if (!place('toy', kind, x, z, TOY_R[kind], opts)) return;
    const yaw = (i * 2.39) % (Math.PI * 2);
    const t =
      kind === 'mushroom' ? mushroom(k, x, z, 0.9 + (i % 3) * 0.12, CAPS[i % CAPS.length])
      : kind === 'duck' ? duck(k, x, z, yaw, 0.9 + (i % 2) * 0.25)
      : kind === 'pinwheel' ? pinwheel(k, x, z, yaw, i % 2 ? [0xe2483c, 0x3a72d8] : [0xd8409a, 0x2f8a4a])
      : kind === 'ball' ? beachBall(k, x, z, 0.9 + (i % 2) * 0.3)
      : springFlower(k, x, z, CAPS[(i + 1) % CAPS.length]);
    fill.toys.push(t);
  };
  const cluster = (cx: number, cz: number, kinds: readonly ToyKind[], radius: number, seed: number): void => {
    kinds.forEach((kind, i) => {
      const a = seed + (i / kinds.length) * Math.PI * 2;
      const r = radius * (0.75 + 0.25 * ((i * 7) % 3));
      toy(kind, cx + Math.cos(a) * r, cz + Math.sin(a) * r, seed + i);
    });
  };

  // ── Playtest fixes (Scoops' back, the bubble pitch steps, village hedges) ──
  buildFixes(k, d, guard);

  // ── Landmark zones ──
  const face = (x: number, z: number, tx: number, tz: number): number => Math.atan2(tx - x, tz - z);
  // Fun Fair: big wheel (seen from the plaza over Bouncy Park), carousel, striped tents.
  {
    const z0 = FILL_ZONES[0];
    const yaw = face(z0.x, z0.z, 0, 0);
    if (place('landmark', 'big wheel', z0.x, z0.z, 7.5)) bigWheel(k, d, z0.x, z0.z, yaw);
    if (place('landmark', 'carousel', 115, -71, 5.2)) carousel(k, 115, -71);
    for (const [tx, tz, r, c] of [[136, -48, 2.6, 0xc8433a], [130, -79, 2.4, 0x2f5d7c], [121, -83, 2.2, 0xe0a030]] as const) {
      if (place('landmark', 'tent', tx, tz, r + 0.4)) tent(k, tx, tz, r, c);
    }
    cluster(124, -46, ['mushroom', 'pinwheel', 'mushroom', 'spring', 'mushroom'], 4.2, 1);
    cluster(108, -74, ['duck', 'ball', 'pinwheel'], 3.5, 7);
  }
  // Windmill Farm: windmill, barn, pumpkin patch, scarecrow, hay.
  {
    const z0 = FILL_ZONES[1];
    if (place('landmark', 'windmill', z0.x, z0.z, 3.6)) windmill(k, d, z0.x, z0.z, face(z0.x, z0.z, -70, 80));
    if (place('landmark', 'barn', -66, 114, 5.2)) barn(k, -66, 114, face(-66, 114, -76, 100));
    let p = 0;
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 3; j++) {
        const x = -100 + i * 2.6 + (j % 2) * 1.2;
        const z = 94 + j * 2.6;
        if (guard.free(x, z, 0.5)) {
          pumpkin(k, x, z, 0.8 + ((i + j) % 3) * 0.2, p++);
          guard.take(x, z, 0.5);
        }
      }
    }
    if (place('landmark', 'scarecrow', -96, 102, 0.8)) scarecrow(k, -96, 102, face(-96, 102, -80, 96));
    for (const [hx, hz] of [[-74, 100], [-72.5, 102], [-92, 116]] as const) {
      if (place('hay', 'bale', hx, hz, 0.9)) hayBale(k, hx, hz, hx * 0.7);
    }
    cluster(-78, 92, ['mushroom', 'spring', 'mushroom', 'pinwheel'], 3.4, 3);
  }
  // Sandcastle Cove: castle, beach umbrellas, balls and a giant rubber duck.
  {
    const z0 = FILL_ZONES[2];
    if (place('landmark', 'sandcastle', z0.x, z0.z, 7.2)) sandcastle(k, d, z0.x, z0.z, face(z0.x, z0.z, 72, 92));
    for (const [ux, uz, c] of [[84, 118, 0xe2483c], [104, 98, 0x3a72d8], [90, 124, 0xf08a24]] as const) {
      if (place('prop', 'umbrella', ux, uz, 1.6)) umbrella(k, ux, uz, c);
    }
    cluster(86, 108, ['ball', 'duck', 'ball', 'spring'], 4, 5);
  }
  // Star Lookout: tower with the gold star, telescopes, picnic blanket tables.
  {
    const z0 = FILL_ZONES[3];
    if (place('landmark', 'lookout', z0.x, z0.z, 2.8)) lookout(k, d, z0.x, z0.z, face(z0.x, z0.z, 0, -128));
    for (const [tx, tz] of [[54, -126], [56, -136]] as const) if (place('prop', 'telescope', tx, tz, 0.5)) telescope(k, tx, tz, face(tx, tz, 80, -100));
    if (place('prop', 'picnic', 42, -138, 1.3)) picnicTable(k, 42, -138, 0.4, 0xc8433a);
    cluster(40, -124, ['mushroom', 'pinwheel', 'spring'], 3, 11);
  }
  // Rainbow Point: the big rainbow on the south cliff, a wishing well, toys.
  {
    const z0 = FILL_ZONES[4];
    if (place('landmark', 'rainbow', z0.x, z0.z, 3)) rainbow(k, d, z0.x, z0.z, Math.PI);
    if (place('prop', 'well', 18, 132, 1.2)) wishingWell(k, 18, 132);
    cluster(1, 139, ['mushroom', 'mushroom', 'spring', 'pinwheel'], 3.2, 13);
  }
  // Beach Huts on the west shore.
  {
    const z0 = FILL_ZONES[5];
    const yaw = face(z0.x, z0.z, -100, 50);
    for (let i = 0; i < 3; i++) {
      const hx = z0.x + Math.cos(yaw) * (i - 1) * 4.2;
      const hz = z0.z - Math.sin(yaw) * (i - 1) * 4.2;
      if (place('landmark', 'hut', hx, hz, 1.9)) beachHut(k, hx, hz, yaw, [0xe2483c, 0x3a72d8, 0xf08a24][i]);
    }
    if (place('prop', 'umbrella', -128, 60, 1.6)) umbrella(k, -128, 60, 0xd8409a);
    cluster(-130, 46, ['ball', 'duck', 'ball'], 3.4, 17);
  }
  // Picnic Grove by the bay: tables, kites, toys.
  {
    for (const [tx, tz, c] of [[-48, -52, 0xc8433a], [-52, -60, 0x2f5d7c], [-44, -62, 0xe0a030]] as const) {
      if (place('prop', 'picnic', tx, tz, 1.3)) picnicTable(k, tx, tz, face(tx, tz, -48, -57), c);
    }
    for (const [kx, kz, c] of [[-56, -50, 0xe2483c], [-40, -54, 0x3a72d8], [-54, -66, 0xf2c14e]] as const) {
      if (place('prop', 'kite', kx, kz, 0.6)) kitePole(k, kx, kz, c);
    }
    cluster(-46, -44, ['mushroom', 'spring', 'mushroom'], 3, 19);
  }

  // ── Trails (flush, no colliders) from the roads to every zone and to the far attractions ──
  for (const t of TRAILS) {
    const pts = trailRibbon(k, d, t);
    // Trail-head post beside the trail a few metres in, pointing along it (left side, then right).
    const head = along(pts, 3).slice(0, 5);
    const spots = head.flatMap((s) => [1, -1].map((side) => ({ x: s.x - s.uz * side * 2.3, z: s.z + s.ux * side * 2.3, yaw: Math.atan2(s.ux, s.uz) })));
    const post = spots.find((q) => guard.free(q.x, q.z, 0.5, { solid: false, inKeepouts: true }));
    if (post && place('post', t.id, post.x, post.z, 0.5, { solid: false, inKeepouts: true })) trailPost(k, d, post.x, post.z, post.yaw, t.color, t.icon);
    else fill.refused.push({ name: `post ${t.id}`, why: guard.why(spots[0].x, spots[0].z, 0.5, { solid: false, inKeepouts: true }) ?? '?' });
    // Lantern posts along the zone trails.
    if (t.arch !== undefined) festoon(k, pts.map(([x, z]) => ({ x, z })), 2.6, 11, (x, z) => place('light', t.id, x, z, 0.3), LIGHTS);
    if (t.arch !== undefined) {
      const [ax, az] = t.pts[t.arch];
      const last = t.arch >= t.pts.length - 1;
      const [px, pz] = t.pts[last ? t.arch - 1 : t.arch];
      const [bx, bz] = t.pts[last ? t.arch : t.arch + 1];
      const ay = Math.atan2(bx - px, bz - pz);
      const whys = [-1, 1].map((s) => guard.why(ax + Math.cos(ay) * s * 2.6, az - Math.sin(ay) * s * 2.6, 0.5, { inKeepouts: true }));
      if (whys.every((w) => w === null)) {
        for (const s of [-1, 1]) guard.take(ax + Math.cos(ay) * s * 2.6, az - Math.sin(ay) * s * 2.6, 0.5);
        zoneArch(k, d, ax, az, ay, 5.2, t.color, t.icon);
        fill.placed.push({ kind: 'arch', name: t.id, x: ax, z: az, r: 3 });
      } else fill.refused.push({ name: `arch ${t.id}`, why: whys.join(' / ') });
    }
    // Toys beside the trail every ~14 m, alternating sides.
    along(pts, 14).forEach((s, i) => {
      if (i === 0) return;
      const side = i % 2 ? 1 : -1;
      const kinds: ToyKind[] = ['mushroom', 'pinwheel', 'spring', 'mushroom', 'duck'];
      toy(kinds[(i + t.id.length) % kinds.length], s.x - s.uz * side * 3.4, s.z + s.ux * side * 3.4, i + t.id.length);
    });
    fill.keepouts.push(...along(pts, 2).map((s) => ({ x: s.x, z: s.z, r: 1.6, mown: true })));
  }

  // ── Glasses-play sites: a trail from the nearest road to each (the site circle stays clear) ──
  // (steppingStones in wayfinding.ts lays the stones; see attractions.ts TRAIL_SITES.)

  // ── Zone arches over the roads ──
  for (const a of ROAD_ARCHES) {
    const half = a.span / 2;
    const pil = [-1, 1].map((s) => [a.x + Math.cos(a.yaw) * s * half, a.z - Math.sin(a.yaw) * s * half] as const);
    const why = pil.map(([x, z]) => guard.why(x, z, 0.45, { onRoad: true, inKeepouts: true })).find((w) => w);
    if (why) {
      fill.refused.push({ name: `road arch ${a.icon}`, why });
      continue;
    }
    for (const [x, z] of pil) guard.take(x, z, 0.45);
    zoneArch(k, d, a.x, a.z, a.yaw, a.span, a.color, a.icon);
    fill.placed.push({ kind: 'arch', name: a.icon, x: a.x, z: a.z, r: half });
  }

  // ── Route lines and ground pictograms from the plaza ──
  for (const r of ROUTES) {
    const pts = r.roads.flatMap((id) => roads.find((q) => q.def.id === id)?.pts ?? []);
    routeLine(k, d, pts, r.color, r.icons, 6, () => true);
  }

  // ── Festoon lights along the roads ──
  FESTOON_ROADS.forEach((id, i) => {
    const road = roads.find((q) => q.def.id === id);
    if (!road) return;
    const off = road.def.width / 2 + (road.def.kind === 'path' ? 1.3 : 1.9);
    festoon(k, road.pts, off, 12, (x, z) => Math.hypot(x - PLAZA.x, z - PLAZA.z) > PLAZA.r + 4 && place('light', id, x, z, 0.35, { inKeepouts: true }), i % 2 ? LIGHTS : [...LIGHTS].reverse());
  });

  // ── Toys along the main roads (2 m beyond the edge, every ~30 m, alternating sides) ──
  for (const id of ['park', 'east', 'south', 'loop', 'west', 'ridge', 'north', 'beach']) {
    const road = roads.find((q) => q.def.id === id);
    if (!road) continue;
    const kinds: ToyKind[] = ['mushroom', 'pinwheel', 'mushroom', 'spring', 'duck', 'mushroom'];
    along(road.pts.map((p) => [p.x, p.z] as [number, number]), 30).forEach((s, i) => {
      if (i === 0) return;
      const side = i % 2 ? 1 : -1;
      const off = road.def.width / 2 + 3.2;
      toy(kinds[(i + id.length) % kinds.length], s.x - s.uz * side * off, s.z + s.ux * side * off, i * 3 + id.length);
    });
  }
  // A mushroom patch at each existing attraction's approach (outside its clear circle).
  for (const name of ['trampoline', 'balloon', 'ranch', 'sillyZone', 'landingRings', 'lighthouse', 'garage', 'bungeeLanding'] as const) {
    const a = ANCHORS[name];
    const ang = Math.atan2(-a.z, -a.x) + 0.6;
    const r = a.radius + 4.5;
    cluster(a.x + Math.cos(ang) * r, a.z + Math.sin(ang) * r, ['mushroom', 'spring', 'mushroom'], 2.6, name.length);
  }
  for (const g of GLASSES_WAY) {
    const ang = g.yaw + Math.PI / 2;
    const r = g.r + 11;
    cluster(g.x + Math.sin(ang) * r, g.z + Math.cos(ang) * r, ['pinwheel', 'mushroom'], 2, g.id.length);
  }

  // ── Island map on the plaza (pictograms, "you are here") ──
  // (The spot nearest MAP_BOARD that the guard allows: the plaza corner is busy.)
  let best: [number, number] | null = null;
  for (let dz = -3; dz <= 3; dz += 0.5) {
    for (let dx = -3; dx <= 3; dx += 0.5) {
      const x = MAP_BOARD.x + dx;
      const z = MAP_BOARD.z + dz;
      if (!guard.free(x, z, 2.2, { inKeepouts: true })) continue;
      if (!best || Math.hypot(dx, dz) < Math.hypot(best[0] - MAP_BOARD.x, best[1] - MAP_BOARD.z)) best = [x, z];
    }
  }
  if (best && place('board', 'map', best[0], best[1], 2.2, { inKeepouts: true })) mapBoard(k, d, roads, [...FILL_ZONES], best[0], best[1]);
  else fill.refused.push({ name: 'board map', why: guard.why(MAP_BOARD.x, MAP_BOARD.z, 2.2, { inKeepouts: true }) ?? '?' });
  // Lamps at the trail heads of the far zones so they glow at sunset.
  for (const t of TRAILS.slice(0, 7)) {
    const [x, z] = t.pts[t.pts.length - 1];
    const lx = x + 2.4;
    const lz = z + 1.2;
    if (place('lamp', t.id, lx, lz, 0.4)) lamp(k, lx, lz);
  }
  return fill;
}
