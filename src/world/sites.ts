/**
 * Carnival Island attraction sites: what the world keeps clear around each attraction (flat pads are
 * in `layout.ts` PADS), the flight/race corridors kept free of trees, and a little carnival dressing
 * at each site entrance (striped gates, strings of lights on poles, ticket-booth silhouettes,
 * chequered flags). The attractions themselves are built by their own modules on these anchors.
 * Pure: no WebGL, so tests can build it and check the footprints.
 */
import * as THREE from 'three';
import type { AnchorName } from '../types';
import { M, T } from './batch';
import { C, bunting, type Kit } from './props';
import { boxG, coneG, cylG, rbox, sphereG, torusG } from './shapes';
import type { Keepout } from './scatter';
import type { Decals } from './decals';
import type { IconId } from './pictograms';

/** A zone in world x/z: circle (r) or axis-aligned rectangle (hx, hz). */
export interface Zone {
  x: number;
  z: number;
  r?: number;
  hx?: number;
  hz?: number;
}

export interface SiteDef {
  anchor: AnchorName;
  /**
   * Ground the attraction builds on (decks, boardwalk, runway, floors): flat, and kept free of trees,
   * rocks and bushes; grass too where the attraction lays its own floor (`floor`).
   */
  footprint: (Zone & { floor: boolean })[];
  /** Flight / approach corridors: no trees, bushes or rocks (grass stays). */
  corridors: Zone[];
}

/** Every Carnival Island site with its footprint and corridors (all from the streams' notes). */
export const SITES: readonly SiteDef[] = [
  {
    // Boardwalk x 17.4…28.1 (booths face west), z −58.2 (prize shelf) … −25.1 (entrance arch).
    anchor: 'carnivalRow',
    footprint: [{ x: 23.95, z: -41.8, hx: 6.05, hz: 17.6, floor: true }],
    corridors: [{ x: 21, z: -42, r: 17 }],
  },
  {
    // Raised floor 10 × 9.4 m with steps; terrace to local z +5.4 (towards the plaza).
    anchor: 'iceCream',
    footprint: [{ x: 24, z: -2, r: 7.2, floor: true }],
    corridors: [],
  },
  {
    // Inflatable pitch ±11.6 × ±6.6 m on a deck; booth ≈ (28.5, 48.2) on its north side.
    anchor: 'bubbleArena',
    footprint: [
      { x: 35, z: 57.5, hx: 12.3, hz: 7.3, floor: true },
      { x: 29.5, z: 47.8, hx: 4, hz: 2.6, floor: false },
    ],
    corridors: [{ x: 29.25, z: 56.75, hx: 18.75, hz: 12.75 }],
  },
  {
    // Ring r 6 m on a deck; booth ≈ (16, 49.9) north of it.
    anchor: 'dinoRing',
    footprint: [
      { x: 16, z: 58.5, r: 6.4, floor: true },
      { x: 16, z: 50.2, hx: 3, hz: 1.8, floor: false },
    ],
    corridors: [],
  },
  {
    // Start grid on the east road, gantry pillars at ±5 m, race booth ≈ (33, 2.6), podium ≈ (45, 2).
    anchor: 'raceStart',
    footprint: [
      { x: 29.5, z: 11.2, r: 6, floor: false },
      { x: 33, z: 3.2, hx: 3.2, hz: 2.4, floor: false },
      { x: 45, z: 3.6, hx: 3.5, hz: 2.0, floor: false },
    ],
    corridors: [{ x: 36.5, z: 8.5, hx: 12, hz: 8.5 }],
  },
  {
    // Course frame x −7…+7, z −6…+45 from the start line, running north: world x −32.5…−18.5,
    // z −63.5…−12.5 (foam pit, floats, blowers, chute, booth, arch).
    anchor: 'foamCourse',
    footprint: [{ x: -25.5, z: -38.25, hx: 7.5, hz: 25.75, floor: true }],
    corridors: [],
  },
  {
    // Mown runway 40 × 14 m along Z (the airstrip draws it), windsock 3 m east of it.
    anchor: 'airstrip',
    footprint: [{ x: -12, z: 46, hx: 7.5, hz: 20.5, floor: true }],
    corridors: [
      // The strip itself and its verges.
      { x: -12, z: 46, hx: 11, hz: 23 },
      // Climb-out and approach to the south (take-off direction), over the slope to the Silly Zone.
      { x: -12, z: 86, hx: 11, hz: 18 },
    ],
  },
  {
    // Perch rock + nest; the rider stands on the south side, the sign behind (north).
    anchor: 'dragonRoost',
    footprint: [{ x: -34, z: -130, r: 6, floor: false }],
    // Launch and landing: everything around the perch and the glide out south over the canyon.
    corridors: [
      { x: -34, z: -130, r: 16 },
      { x: -32, z: -116, hx: 9, hz: 10 },
    ],
  },
];

export const SITE_ANCHORS: readonly AnchorName[] = SITES.map((s) => s.anchor);

/**
 * The buggy race's grass cut from the south road back to the east road (part of its lap, not a road):
 * kerbs, lamps and props keep off it.
 */
export const RACE_CUT: readonly (readonly [number, number])[] = [[3, 27], [9.5, 17.5], [17.5, 11.2], [26, 11]];

/** Distance from (x, z) to the race's grass cut line. */
export function raceCutDistance(x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < RACE_CUT.length - 1; i++) {
    const [ax, az] = RACE_CUT[i];
    const [bx, bz] = RACE_CUT[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

/** Is (x, z) inside a zone (with an extra margin)? */
export function inZone(z0: Zone, x: number, z: number, margin = 0): boolean {
  if (z0.r !== undefined) return Math.hypot(x - z0.x, z - z0.z) < z0.r + margin;
  return Math.abs(x - z0.x) < (z0.hx ?? 0) + margin && Math.abs(z - z0.z) < (z0.hz ?? 0) + margin;
}

/** Scatter keepouts for every site: floors keep grass out too, corridors only trees, rocks, bushes. */
export function siteKeepouts(): Keepout[] {
  const out: Keepout[] = [];
  for (const s of SITES) {
    for (const f of s.footprint) out.push({ x: f.x, z: f.z, r: f.r, hx: f.hx, hz: f.hz, paved: f.floor });
    for (const c of s.corridors) out.push({ x: c.x, z: c.z, r: c.r, hx: c.hx, hz: c.hz });
  }
  return out;
}

/** True where a site keeps trees, bushes and rocks out (footprints and corridors). */
export function inSiteClearZone(x: number, z: number, margin = 0): boolean {
  return SITES.some((s) => s.footprint.some((f) => inZone(f, x, z, margin)) || s.corridors.some((c) => inZone(c, x, z, margin)));
}

// ───────────────────────────── entrance dressing ─────────────────────────────

const CREAM = 0xf4efe6;
const NAVY = 0x24476a;
const RED = 0xc8433a;
const GOLD = 0xf2c14e;
const BULB = 0xfff0c4;
const WIRE = 0x2b2b2e;

/** Where each site's dressing goes (all outside every anchor's clear radius; tests check). */
export interface Dressing {
  anchor: AnchorName;
  /** Gate over the footpath: centre, the direction you walk through it, width between the pillars. */
  gate?: { x: number; z: number; yaw: number; w: number };
  /** Pairs of light poles with a string of bulbs between them. */
  lights?: [number, number, number, number][];
  /** Ticket-booth silhouette: position and the yaw its hatch faces. */
  booth?: { x: number; z: number; yaw: number };
  /** Chequered flags: position and yaw. */
  flags?: [number, number, number][];
}

export const DRESSING: readonly Dressing[] = [
  // Path mouth on the park road; the row's own arch (tent pictogram) stands at the far end.
  { anchor: 'carnivalRow', gate: { x: 20.94, z: -18.5, yaw: Math.PI, w: 5 } },
  // Light poles either side of the parlour's front, on the plaza's east rim.
  { anchor: 'iceCream', lights: [[16.8, -4.7, 19.6, 4.6]] },
  // Gate at the footpath mouth on the south road, a ticket booth beside it.
  { anchor: 'bubbleArena', gate: { x: 9.2, z: 46.9, yaw: Math.PI / 2 + 0.05, w: 5 }, booth: { x: 11.4, z: 51.4, yaw: -Math.PI / 2 + 0.3 } },
  { anchor: 'dinoRing', lights: [[12.5, 44, 20.5, 43.8]] },
  // Chequered flags on both verges before the grid.
  { anchor: 'raceStart', flags: [[22.2, 15.4, Math.PI / 2], [22.4, 5.6, Math.PI / 2]] },
  // Gate where the footpath leaves the plaza between the town hall and the bakery.
  { anchor: 'foamCourse', gate: { x: -17.3, z: -11.65, yaw: -Math.PI / 2, w: 4.4 } },
  // Across the south road from the airstrip path: ticket booth and a pair of light poles.
  { anchor: 'airstrip', booth: { x: 9.3, z: 37.6, yaw: -Math.PI / 2 }, lights: [[8.6, 35.2, 8.6, 31.2]] },
  // Light poles flanking the spur from the north path up to the roost.
  { anchor: 'dragonRoost', lights: [[-23.4, -135.8, -28.8, -135.8]] },
];

/** Icon shown on each site's gate roundel. */
export const SITE_ICON: Partial<Record<AnchorName, IconId>> = {
  carnivalRow: 'iCarnival',
  bubbleArena: 'iBubble',
  foamCourse: 'iFoam',
};

/** Footprint points of every dressing item (for tests): x, z, radius. */
export function dressingPoints(): { anchor: AnchorName; x: number; z: number; r: number }[] {
  const out: { anchor: AnchorName; x: number; z: number; r: number }[] = [];
  for (const d of DRESSING) {
    if (d.gate) {
      const { x, z, yaw, w } = d.gate;
      for (const s of [-1, 1]) out.push({ anchor: d.anchor, x: x + Math.cos(yaw) * s * (w / 2), z: z - Math.sin(yaw) * s * (w / 2), r: 0.35 });
    }
    for (const [ax, az, bx, bz] of d.lights ?? []) out.push({ anchor: d.anchor, x: ax, z: az, r: 0.3 }, { anchor: d.anchor, x: bx, z: bz, r: 0.3 });
    if (d.booth) out.push({ anchor: d.anchor, x: d.booth.x, z: d.booth.z, r: 1.2 });
    for (const [x, z] of d.flags ?? []) out.push({ anchor: d.anchor, x, z, r: 0.3 });
  }
  return out;
}

/** A pole with cream/navy candy stripes, a stone foot and a gold ball on top. */
function stripedPole(k: Kit, x: number, z: number, h: number, r = 0.13): number {
  const y = k.h(x, z);
  const n = Math.max(3, Math.round(h / 0.55));
  for (let i = 0; i < n; i++) k.b.add('paint', cylG(10), i % 2 ? NAVY : CREAM, T(x, y + (i * h) / n, z, 0, r, h / n, r));
  k.b.add('matte', cylG(10), C.stoneDark, T(x, y - 0.05, z, 0, r * 2.2, 0.35, r * 2.2), { aoY: y, aoH: 0.3, ao: 0.35 });
  k.b.add('gloss', sphereG(1), GOLD, T(x, y + h + 0.12, z, 0, r * 1.6, r * 1.6, r * 1.6));
  k.col.cyl(x, y, z, h / 2, r + 0.03);
  return y + h;
}

/** A sagging string of warm bulbs on a dark wire between two points (bulbs glow at dusk too). */
function bulbString(k: Kit, a: THREE.Vector3, c: THREE.Vector3, sag: number): void {
  const len = a.distanceTo(c);
  const n = Math.max(3, Math.round(len / 0.75));
  const yaw = Math.atan2(c.x - a.x, c.z - a.z);
  let prev = a.clone();
  const p = new THREE.Vector3();
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    p.copy(a).lerp(c, t);
    p.y -= sag * 4 * t * (1 - t);
    const d = p.distanceTo(prev);
    const mid = prev.clone().add(p).multiplyScalar(0.5);
    k.b.add('metal', boxG(), WIRE, T(mid.x, mid.y - 0.01, mid.z, yaw, 0.025, 0.025, d, -Math.asin((p.y - prev.y) / d)));
    if (i < n) {
      k.b.add('glow', sphereG(1), i % 3 === 0 ? 0xffd27a : BULB, T(p.x, p.y - 0.12, p.z, 0, 0.085, 0.11, 0.085));
      k.b.add('metal', cylG(6), WIRE, T(p.x, p.y - 0.05, p.z, 0, 0.03, 0.05, 0.03));
    }
    prev = p.clone();
  }
}

function lightPoles(k: Kit, ax: number, az: number, bx: number, bz: number): void {
  const H = 4.4;
  const ya = stripedPole(k, ax, az, H);
  const yb = stripedPole(k, bx, bz, H);
  const a = new THREE.Vector3(ax, ya - 0.15, az);
  const c = new THREE.Vector3(bx, yb - 0.15, bz);
  bulbString(k, a, c, Math.min(1.1, a.distanceTo(c) * 0.08));
  // A second, lower string of pennants (red / cream / navy / gold).
  bunting(k.b, a.clone().setY(a.y - 0.55), c.clone().setY(c.y - 0.55), [RED, CREAM, NAVY, GOLD], Math.min(1.3, a.distanceTo(c) * 0.1));
}

/** Striped arch over a footpath with the attraction's icon on a roundel and bulbs along the arc. */
function gate(k: Kit, d: Decals, g: NonNullable<Dressing['gate']>, icon: IconId | undefined): void {
  const { x, z, yaw, w } = g;
  const H = 3.6;
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const tops: THREE.Vector3[] = [];
  for (const s of [-1, 1]) {
    const px = x + rx * s * (w / 2);
    const pz = z + rz * s * (w / 2);
    tops.push(new THREE.Vector3(px, stripedPole(k, px, pz, H, 0.2), pz));
  }
  const y0 = (tops[0].y + tops[1].y) / 2;
  // Arc (half torus, stood up across the path) springing from the pillar tops.
  const am = T(x, y0, z, yaw);
  const up = (lx: number, ly: number, lz: number): THREE.Matrix4 => M(am, T(lx, ly, lz, 0, 1, 1, 1, Math.PI / 2));
  k.b.add('paint', torusG(0.16, 32, Math.PI, w / 2), RED, up(0, 0, 0));
  k.b.add('paint', torusG(0.07, 32, Math.PI, w / 2 + 0.24), CREAM, up(0, 0, 0));
  // Bulbs along the arc (front and back).
  for (let i = 1; i < 12; i++) {
    const a = (i / 12) * Math.PI;
    const lx = Math.cos(a) * (w / 2);
    const ly = Math.sin(a) * (w / 2);
    for (const f of [-1, 1]) k.b.add('glow', sphereG(0), BULB, M(am, T(lx, ly, f * 0.17, 0, 0.07, 0.07, 0.07)));
  }
  // Roundel with the icon on top of the arc, both faces.
  const ry = w / 2 + 0.78;
  k.b.add('paint', cylG(28), CREAM, M(am, T(0, ry, -0.1, 0, 0.62, 0.2, 0.62, Math.PI / 2)));
  k.b.add('paint', torusG(0.06, 28, Math.PI * 2, 0.64), GOLD, up(0, ry, 0));
  if (icon) d.add(icon, M(am, T(0, ry, 0.105)), 1.12, 1.12, true, 0.21);
}

/** A little ticket booth: striped walls, open hatch, striped awning, pointed red roof. */
function ticketBooth(k: Kit, b: NonNullable<Dressing['booth']>): void {
  const y = k.h(b.x, b.z);
  const m = T(b.x, y, b.z, b.yaw);
  k.b.add('matte', rbox(1.9, 0.25, 1.7, 0.04), C.stoneDark, M(m, T(0, -0.05, 0)), { aoY: y, aoH: 0.3, ao: 0.35 });
  // Walls in vertical cream / red stripes.
  for (let i = 0; i < 5; i++) k.b.add('paint', boxG(), i % 2 ? RED : CREAM, M(m, T(-0.64 + i * 0.32, 0.15, 0, 0, 0.32, 2.05, 1.4)));
  // Hatch (dark) and counter.
  k.b.add('paint', boxG(), 0x231c19, M(m, T(0, 1.05, 0.705, 0, 1.0, 0.75, 0.02)));
  k.b.add('paint', rbox(1.3, 0.08, 0.4, 0.02), 0x9b6b43, M(m, T(0, 0.98, 0.82)));
  // Striped awning tilted out over the hatch.
  for (let i = 0; i < 5; i++) k.b.add('cloth', boxG(), i % 2 ? NAVY : CREAM, M(m, T(-0.68 + i * 0.34, 1.95, 0.95, 0, 0.34, 0.04, 0.7, 0.45)));
  // Roof: navy band and a red cone with a gold ball.
  k.b.add('paint', rbox(1.75, 0.18, 1.55, 0.03), NAVY, M(m, T(0, 2.2, 0)));
  k.b.add('paint', coneG(4), RED, M(m, T(0, 2.38, 0, Math.PI / 4, 1.25, 1.0, 1.15)));
  k.b.add('gloss', sphereG(1), GOLD, M(m, T(0, 3.45, 0, 0, 0.14, 0.14, 0.14)));
  k.col.box(m, 0, 1.2, 0, 0.85, 1.2, 0.78);
}

/** Pole with a chequered flag (black/white squares; reads in every channel). */
function chequerFlag(k: Kit, x: number, z: number, yaw: number): void {
  const H = 4.6;
  const y = k.h(x, z);
  k.b.add('metal', cylG(8), 0xe8e6e0, T(x, y, z, 0, 0.07, H, 0.07));
  k.b.add('matte', cylG(10), C.stoneDark, T(x, y - 0.05, z, 0, 0.24, 0.3, 0.24), { aoY: y, aoH: 0.3, ao: 0.35 });
  k.b.add('gloss', sphereG(1), GOLD, T(x, y + H + 0.08, z, 0, 0.12, 0.12, 0.12));
  const m = T(x, y + H - 0.15, z, yaw);
  const S = 0.32;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 3; j++) {
      k.b.add('cloth', boxG(), (i + j) % 2 ? 0x1a1b1f : 0xf6f4ee, M(m, T(0.1 + S / 2 + i * S, -(j + 1) * S, 0, 0, S, S, 0.03)));
    }
  }
  k.col.cyl(x, y, z, H / 2, 0.12);
}

/** Build every site's entrance dressing (batched; small parts cast no shadow). */
export function buildSiteDressing(k: Kit, d: Decals): Keepout[] {
  const keep: Keepout[] = [];
  for (const s of DRESSING) {
    if (s.gate) gate(k, d, s.gate, SITE_ICON[s.anchor]);
    for (const [ax, az, bx, bz] of s.lights ?? []) lightPoles(k, ax, az, bx, bz);
    if (s.booth) ticketBooth(k, s.booth);
    for (const [x, z, yaw] of s.flags ?? []) chequerFlag(k, x, z, yaw);
  }
  for (const p of dressingPoints()) keep.push({ x: p.x, z: p.z, r: p.r + 1 });
  return keep;
}
