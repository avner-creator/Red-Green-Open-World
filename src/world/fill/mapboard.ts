/**
 * The island map on the plaza: a big framed board with the island drawn in cream on a dark sea, the
 * roads in dark brown, the main attractions as BIG pictogram badges and a "you are here" dot. The
 * map is turned so that "up" on the board is the way the reader is looking (forward-up), so a child
 * can match left and right on the map to the world. Wordless; cream-on-navy and dark-on-cream read
 * by brightness in the red-only and green-only channels. Geometry + pictogram decals only.
 *
 * QA7 m6: at 640x360 the old 20-odd small badges were unreadable from spawn, and up close the hero
 * covered the centre. Now: only the main attractions (MAP_ICONS), each badge ≥ 22 px tall at 640x360
 * from the spawn camera (tests/world/mapboard.test.ts), each on a thick cream ring (an outline that
 * reads on the sea and on the land in both channels); a yellow "you are here" dot with a dark ring;
 * the face starts higher, and no badge sits in the low middle of the face, where the hero stands
 * between the camera and the board up close.
 *
 * QA8 m6: the spawn camera's eye is ~3.5 m above the plaza, so anything that high sits on the
 * horizon line, right under the HUD's compass bar (at 640x360 its bottom is at ~56 px), however
 * far the board stands; and up close the hero's head and ears covered the low middle. The plaza
 * has no room for a wider board, so the face now starts at the paving and ends at 3.04 m (≥ 62 px
 * from spawn), with the badges in a 3 + 3 + 2 grid ordered as on the map (farthest ahead on top,
 * each row left to right as seen from the board): the bottom row's two sit at the face's edges,
 * its middle is free ("you are here": the reader, at the bottom of a forward-up map).
 * tests/e2e/ui-wayfinding.spec.ts measures the real screen: the live spawn camera with the HUD on,
 * and (pixel diff, hero shown / hidden) the hero standing 4.5 m in front.
 *
 * Up close no layout clears every hero and hat (12 px of clearance would need a 4.5 m face), so the
 * board registers itself as a reading spot (src/core/camera-read.ts): a hero standing in front of it
 * gets a raised camera that looks over their head at the face.
 */
import * as THREE from 'three';
import { M, T } from '../batch';
import { C, type Kit } from '../props';
import { boxG, cylG, rbox, sphereG } from '../shapes';
import type { Decals } from '../decals';
import type { IconId } from '../pictograms';
import type { ProcessedRoad } from '../terrain';
import { coastRadius } from '../terrain';
import { ANCHORS } from '../layout';
import type { AnchorName } from '../../types';
import { registerReadingSpot } from '../../core/camera-read';

/**
 * Where the board stands and the point it faces (QA6 m10): on the plaza ahead-left of spawn, facing
 * the spawn camera, so a child sees it at once (default view, 640x360: between the HUD corners,
 * left of the hero, below the compass bar) and can read its pictures; off the plaza chest's line.
 * It stands beside the spawn's forward run lane, not in it, and off the walk from spawn to the park
 * road (tests/world/spawn-lane.test.ts: at (6.6, 5.9) and 3.6 m wide its right post blocked the
 * first run/dash from spawn). The plaza is full there (spawn circle, plaza gem, Gear Shack): at
 * 3.34 m wide (QA7 m6: bigger badges) it just clears the Gear Shack's circle (posts at ±(W/2 + 0.33)).
 */
export const MAP_BOARD = { x: 8.25, z: 3.75, faceX: -4.5, faceZ: 10 } as const;
/** Board face (m) and its footprint radius for the fill guard. */
const W = 3.5;
const H = 3.04;
/** Footprint radius: the face's half-width plus the posts. */
export const BOARD_R = W / 2 + 0.33;
export const MAP_FACE = { w: W, h: H } as const;
/** Face bottom above the ground (m): a little raised, with the face 3.5 m wide, so the hero's ears (about 1.1 m either side, 0.85 m up, 4.5 m away) stay off the bottom-row badge centres in any idle pose (flaky QA: sillyZone). */
const FACE_BOTTOM = 0.15;
/** Face centre height (m). Its top (3.19 m) stays below the spawn camera's eye line (~3.5 m). */
const YC = FACE_BOTTOM + H / 2;
/** Badge (decal) size and its cream ring (m). */
export const MAP_BADGE = 0.96;
export const MAP_RING = MAP_BADGE / 2 + 0.04;
const RING = MAP_RING;
/**
 * The low middle of the face (board-local, m from the centre; y up): where a hero standing in front
 * hides the board up close (4.5 m away the hero's head and ears cover it up to ~0.7–1.0 m). No
 * badge centre goes there; the "you are here" dot does (it is the reader: unimportant to see).
 */
export const MAP_HERO_ZONE = { halfW: 0.75, top: 1.05 - YC } as const;
/** Badge grid: column and row spacing (board-local m; rims may touch, badges never overlap). */
const COL = 0.98;
const ROW = 0.98;
/** Top row centre: its rims' tops at the face top (3.04 m above the ground). */
const ROW_TOP = H / 2 - RING - 0.04;
/** Badges per row, top to bottom: the bottom row has its middle free (the hero stands there). */
const ROWS = [3, 3, 2] as const;
/** The bottom row's two badges sit at the face edges (u), as far from the hero as they fit. */
const EDGE_COL = W / 2 - RING;

/** The main attractions on the map (QA7 m6: 8–10, big; the far bungee and dragon roost have their own signs). */
export const MAP_ICONS: readonly { anchor: AnchorName; icon: IconId }[] = [
  { anchor: 'trampoline', icon: 'iTrampoline' },
  { anchor: 'balloon', icon: 'iBalloon' },
  { anchor: 'launchPads', icon: 'iRocket' },
  { anchor: 'garage', icon: 'iCar' },
  { anchor: 'ranch', icon: 'iHorse' },
  { anchor: 'sillyZone', icon: 'iSilly' },
  { anchor: 'carnivalRow', icon: 'iCarnival' },
  { anchor: 'airstrip', icon: 'iPlane' },
];

const NAVY = 0x1b2a48;
const LAND = 0xeee2c0;
const ROAD = 0x6a5440;
const CREAM = 0xf4efe6;
const YELLOW = 0xf2c14e;

export interface BoardLayout {
  /** Board yaw (its face looks along (sin yaw, cos yaw)). */
  yaw: number;
  /** Metres of map per metre of world. */
  sc: number;
  /** Face centre height above the ground (m). */
  yc: number;
  /** Board-local badge centres (u right, v up from the face centre, m) and the "you are here" spot. */
  icons: { anchor: AnchorName; icon: IconId; u: number; v: number }[];
  here: { u: number; v: number };
}

/**
 * Pure layout (no geometry): the main attractions in two rows of four, ordered as on the map (the
 * four farthest ahead on the top row; each row left to right as seen from the board), "you are
 * here" in the low middle. Deterministic.
 */
export function boardLayout(x: number = MAP_BOARD.x, z: number = MAP_BOARD.z): BoardLayout {
  const yaw = Math.atan2(MAP_BOARD.faceX - x, MAP_BOARD.faceZ - z);
  const span = 330; // metres shown across the island's widest part
  const sc = (Math.min(W, H) - 0.25) / span;
  const fwd = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
  const rgt = { x: Math.cos(yaw), z: -Math.sin(yaw) };
  const uv = (wx: number, wz: number): { u: number; v: number } => ({ u: (wx * rgt.x + wz * rgt.z) * sc, v: (wx * fwd.x + wz * fwd.z) * sc });
  const onMap = MAP_ICONS.map((m) => ({ ...m, ...uv(ANCHORS[m.anchor].x, ANCHORS[m.anchor].z) }));
  // Farthest ahead on the top row; each row left to right as seen from the board.
  const byV = [...onMap].sort((a, b) => b.v - a.v);
  const icons: BoardLayout['icons'] = [];
  let k = 0;
  ROWS.forEach((n, ri) => {
    const row = byV.slice(k, k + n).sort((a, b) => a.u - b.u);
    k += n;
    // Three across: left, middle, right. Two (the bottom row): left and right, the middle free.
    const cols = n === 3 ? [-1, 0, 1] : [-EDGE_COL / COL, EDGE_COL / COL];
    row.forEach((m, ci) => icons.push({ anchor: m.anchor, icon: m.icon, u: cols[ci] * COL, v: ROW_TOP - ri * ROW }));
  });
  // "You are here" in the free bottom middle: the reader, at the bottom of a forward-up map.
  const here = { u: 0, v: ROW_TOP - 2 * ROW };
  return { yaw, sc, yc: YC, icons, here };
}

export function mapBoard(k: Kit, d: Decals, roads: readonly ProcessedRoad[], x: number = MAP_BOARD.x, z: number = MAP_BOARD.z): void {
  const y = k.h(x, z);
  const lay = boardLayout(x, z);
  const { yaw, sc } = lay;
  const yc = lay.yc;
  const m = T(x, y, z, yaw);
  registerReadingSpot({ id: 'mapboard', x: x + Math.sin(yaw) * 0.1, y: y + yc, z: z + Math.cos(yaw) * 0.1, nx: Math.sin(yaw), nz: Math.cos(yaw), w: W, h: H });
  // Frame, posts, roof.
  for (const s of [-1, 1]) {
    k.b.add('paint', rbox(0.3, yc + H / 2 + 0.6, 0.3, 0.05), C.woodDark, M(m, T(s * (W / 2 + 0.18), -0.1, 0)), { aoY: y, aoH: 0.5, ao: 0.35 });
    k.b.add('matte', rbox(0.6, 0.35, 0.6, 0.06), C.stone, M(m, T(s * (W / 2 + 0.18), -0.1, 0)), { aoY: y, aoH: 0.3, ao: 0.3 });
  }
  k.b.add('paint', rbox(W + 0.3, H + 0.3, 0.14, 0.04), 0xc8433a, M(m, T(0, yc - H / 2 - 0.15, -0.02)));
  k.b.add('paint', rbox(W + 0.12, H + 0.12, 0.16, 0.03), CREAM, M(m, T(0, yc - H / 2 - 0.06, -0.01)));
  k.b.add('paint', rbox(W, H, 0.18, 0.02), NAVY, M(m, T(0, yc - H / 2, 0)));
  for (const s of [-1, 1]) k.b.add('paint', boxG(), 0x2c3038, M(m, T(0, yc + H / 2 + 0.32, s * 0.25, 0, W + 0.8, 0.1, 0.62, s * 0.45)));
  k.b.add('gloss', sphereG(1), YELLOW, M(m, T(0, yc + H / 2 + 0.62, 0, 0, 0.2, 0.2, 0.2)));
  k.col.box(m, 0, (yc + H / 2 + 0.6) / 2, 0, W / 2 + 0.35, (yc + H / 2 + 0.6) / 2, 0.3);

  // Map frame: forward-up for a reader facing the board (looking along −normal).
  const fwd = new THREE.Vector2(-Math.sin(yaw), -Math.cos(yaw));
  const rgt = new THREE.Vector2(Math.cos(yaw), -Math.sin(yaw));
  const face = 0.095;
  const at = (u: number, v: number, lift: number): THREE.Matrix4 => M(m, T(u, yc + v, face + lift));
  // Island: a cream disc-ish shape from the coastline, a pale shore ring.
  const shape = (inset: number): THREE.ShapeGeometry => {
    const s = new THREE.Shape();
    const N = 72;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const r = coastRadius(Math.cos(a), Math.sin(a)) - inset;
      const wx = Math.cos(a) * r;
      const wz = Math.sin(a) * r;
      const u = (wx * rgt.x + wz * rgt.y) * sc;
      const v = (wx * fwd.x + wz * fwd.y) * sc;
      if (i === 0) s.moveTo(u, v);
      else s.lineTo(u, v);
    }
    return new THREE.ShapeGeometry(s);
  };
  const land = shape(0);
  k.b.add('paint', land, LAND, M(m, T(0, yc, face)));
  land.dispose();
  const sand = shape(-5);
  k.b.add('paint', sand, 0xb8d8e8, M(m, T(0, yc, face - 0.004)));
  sand.dispose();
  // Roads: dark strips (flat quads, one every ~6 m of road).
  {
    const pos: number[] = [];
    for (const r of roads) {
      const w = Math.max(0.035, r.def.width * sc * 1.4) / 2;
      const pts = r.pts.filter((_, i) => i % 6 === 0 || i === r.pts.length - 1);
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const ua = (a.x * rgt.x + a.z * rgt.y) * sc;
        const va = (a.x * fwd.x + a.z * fwd.y) * sc;
        const ub = (b.x * rgt.x + b.z * rgt.y) * sc;
        const vb = (b.x * fwd.x + b.z * fwd.y) * sc;
        const len = Math.hypot(ub - ua, vb - va);
        if (len < 1e-4) continue;
        const nu = (-(vb - va) / len) * w;
        const nv = ((ub - ua) / len) * w;
        const eu = ((ub - ua) / len) * w;
        const ev = ((vb - va) / len) * w;
        const q = [
          [ua - eu - nu, va - ev - nv], [ub + eu - nu, vb + ev - nv], [ub + eu + nu, vb + ev + nv], [ua - eu + nu, va - ev + nv],
        ];
        for (const j of [0, 1, 2, 0, 2, 3]) pos.push(q[j][0], q[j][1], 0);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    k.b.add('paint', g, ROAD, M(m, T(0, yc, face + 0.004)));
    g.dispose();
  }
  // Big badges, each on a thick cream ring with a thin dark rim (an outline on sea and land alike).
  const ringOuter = new THREE.CircleGeometry(RING + 0.04, 40);
  const ring = new THREE.CircleGeometry(RING, 40);
  for (const ic of lay.icons) {
    k.b.add('paint', ringOuter, NAVY, at(ic.u, ic.v, 0.012));
    k.b.add('paint', ring, CREAM, at(ic.u, ic.v, 0.018));
    d.add(ic.icon, at(ic.u, ic.v, 0.03), MAP_BADGE);
  }
  ringOuter.dispose();
  ring.dispose();
  // You are here: a big yellow dot in a dark ring, a pin sticking out with a yellow ball.
  const { u: hu, v: hv } = lay.here;
  const dotOuter = new THREE.CircleGeometry(0.22, 32);
  const dot = new THREE.CircleGeometry(0.16, 32);
  k.b.add('paint', dotOuter, NAVY, at(hu, hv, 0.012));
  k.b.add('paint', dot, YELLOW, at(hu, hv, 0.02));
  dotOuter.dispose();
  dot.dispose();
  k.b.add('gloss', cylG(10), YELLOW, at(hu, hv, 0.0).multiply(T(0, 0, 0, 0, 0.035, 0.22, 0.035, Math.PI / 2)));
  k.b.add('gloss', sphereG(1), YELLOW, at(hu, hv, 0.22).multiply(T(0, 0, 0, 0, 0.09, 0.09, 0.09)));
  // The back: a big "map" pictogram (the "you are here" badge) for anyone walking round it.
  d.add('iHere', M(m, T(0, yc, -0.11, Math.PI)), 1.6);
}
