/**
 * The island plan: anchors, roads, flat pads, canyon, bay. Pure data (no three.js objects) so
 * terrain generation and tests can share it. Coordinates in metres; north is −Z.
 */
import type { AnchorName } from '../types';

export const SEED = 20261110;
export const GRID = 200; // cells per side
export const SIZE = 400; // metres
export const CELL = SIZE / GRID;

/** Village plateau height. */
export const VILLAGE_Y = 18;
/** Northern ridge plateau height (canyon rim). */
export const RIDGE_Y = 32;
/** Bridge deck top. */
export const DECK_Y = 33.5;

export const CANYON = { z: -106, x0: -132, x1: 46, floorHalf: 7, topHalf: 15, floorWest: -3, floorEast: 3.5 } as const;
export const BAY = { x: -120, z: -55, inner: 30, outer: 52, depth: -6 } as const;
export const BRIDGE = { x: 0, z0: -82, z1: -130, width: 6.5 } as const;

export interface AnchorDef {
  x: number;
  z: number;
  radius: number;
  yaw: number;
  /** Fixed y (e.g. bridge deck, floating platform); otherwise the terrain height. */
  y?: number;
  /** Must stand on flat dry land (tests). */
  onLand: boolean;
}

export const ANCHORS: Record<AnchorName, AnchorDef> = {
  // Spawn faces east, towards the fingerpost and the attraction beacons (park, garage, rocket pads, rings).
  spawn: { x: 0, z: 9, radius: 4, yaw: 1.75, onLand: true },
  garage: { x: 34, z: 20, radius: 8, yaw: Math.PI, onLand: true },
  trampoline: { x: 58, z: -24, radius: 12, yaw: -Math.PI / 2, onLand: true },
  bouncePads: { x: 84, z: -12, radius: 10, yaw: -Math.PI / 2, onLand: true },
  balloon: { x: 84, z: 64, radius: 12, yaw: Math.PI * 0.75, onLand: true },
  landingRings: { x: 124, z: 22, radius: 18, yaw: -Math.PI / 2, onLand: true },
  // yaw faces back along the deck (the approach); the jump itself goes west (−X) off the platform.
  bungee: { x: -1.5, z: CANYON.z, radius: 3, yaw: 0, y: DECK_Y, onLand: false },
  bungeeLanding: { x: -18, z: CANYON.z, radius: 5, yaw: Math.PI / 2, onLand: true },
  lakePlatform: { x: -118, z: -50, radius: 4, yaw: Math.PI / 4, y: 0.75, onLand: false },
  lighthouse: { x: -62, z: -134, radius: 8, yaw: -Math.PI / 4, onLand: true },
  ranch: { x: -74, z: 44, radius: 16, yaw: Math.PI / 2 + 0.6, onLand: true },
  sillyZone: { x: 8, z: 98, radius: 16, yaw: Math.PI, onLand: true },
  // Just south of Bouncy Park; yaw points the flight north over the park to the landing net.
  launchPads: { x: 80, z: 24, radius: 12, yaw: Math.atan2(3, -58), onLand: true },
  // Gem shop kiosk set back on the east edge of the fountain plaza, between the park road and the east
  // road, ahead-left of the spawn view. Every walking line from spawn to the roads stays ≥ 2.5 m clear
  // of it (tests). +Z of the yaw is the counter side: it faces the plaza centre.
  gearShack: { x: 14, z: 2, radius: 3, yaw: Math.atan2(-14, -4), onLand: true },

  // ── Carnival Island attractions (built by their own streams; positions are where each was built
  // and tested). `radius` is the clear circle; the flat pad and the scatter-free footprint of each
  // site are in PADS below and in sites.ts.
  // Carnival games row: the strip behind the east-side village houses; booths face west (+Z of yaw).
  carnivalRow: { x: 21, z: -42, radius: 17, yaw: -Math.PI / 2, onLand: true },
  // Scoops ice-cream parlour between the plaza and Bouncy Park; its front faces the plaza and spawn.
  iceCream: { x: 24, z: -2, radius: 7, yaw: -1.22, onLand: true },
  // Bubble Ball pitch (long axis = world X) and the Dino Sumo ring on the meadow south of the garage.
  // Radii shrunk from the requested 13 / 7 so the two circles do not overlap (the radius is only the
  // keep-clear circle; the pitch is ±11.6 × ±6.6 m, the ring r 6 m).
  bubbleArena: { x: 35, z: 57.5, radius: 12.5, yaw: 0, onLand: true },
  dinoRing: { x: 16, z: 58.5, radius: 6.4, yaw: 0, onLand: true },
  // Buggy race start/finish line on the east road (yaw = race direction, east).
  raceStart: { x: 29.5, z: 11.2, radius: 6, yaw: Math.PI / 2, onLand: true },
  // Foam Lava course: position = middle of the start/finish line, yaw = the direction the course runs.
  foamCourse: { x: -25.5, z: -18.5, radius: 5, yaw: Math.PI, onLand: true },
  // Grass airstrip (40 × 14 m runway along Z, take-off south). Radius 20, not 22, so the clear
  // circle stays off the far side of the south road.
  airstrip: { x: -12, z: 46, radius: 20, yaw: 0, onLand: true },
  // Dragon roost on the ridge west of the bridge, looking south over the canyon. Radius 6 keeps the
  // circle off the north path.
  dragonRoost: { x: -34, z: -130, radius: 6, yaw: Math.atan2(34, 130), onLand: true },
};

/** Where the rocket-pad flight lands (flat, clear spot inside Bouncy Park for the landing net). */
export const LAUNCH_NET = { x: 83, z: -34, radius: 5 } as const;

export type RoadKind = 'street' | 'road' | 'path';
export interface RoadDef {
  id: string;
  kind: RoadKind;
  width: number;
  /** Village lane: asphalt with stone kerbs, centre dashes, lamps and verge planting. */
  kerb?: boolean;
  /** Kerbed lanes only: landmark trees/rocks back from the verge (default true). */
  landmarks?: boolean;
  /** [x, z] or [x, z, fixedHeight]. */
  points: readonly (readonly [number, number] | readonly [number, number, number])[];
}

export const ROADS: readonly RoadDef[] = [
  { id: 'main', kind: 'street', width: 8, points: [[0, -10], [0, -58, VILLAGE_Y]] },
  {
    id: 'ridge', kind: 'road', width: 7, kerb: true, landmarks: false,
    points: [[0, -58, VILLAGE_Y], [22, -64], [46, -70], [62, -76], [60, -82], [40, -82, DECK_Y - 0.6], [16, -80, DECK_Y], [4, -80, DECK_Y], [0, -84, DECK_Y]],
  },
  { id: 'north', kind: 'path', width: 5, points: [[0, -128, DECK_Y], [0, -136, DECK_Y - 0.6], [-20, -140], [-42, -138], [-56, -134]] },
  { id: 'park', kind: 'road', width: 7, kerb: true, points: [[14, -8], [28, -14], [42, -18]] },
  { id: 'east', kind: 'road', width: 7, kerb: true, points: [[12, 8], [26, 11], [46, 12], [60, 24], [67, 40], [72, 50], [96, 44], [106, 36]] },
  { id: 'south', kind: 'road', width: 7, kerb: true, landmarks: false, points: [[0, 16], [2, 40], [5, 60], [7, 74]] },
  { id: 'loop', kind: 'road', width: 7, points: [[7, 74], [28, 80], [46, 82], [60, 78], [66, 70], [68, 58], [72, 50]] },
  { id: 'west', kind: 'road', width: 7, kerb: true, landmarks: false, points: [[-14, 6], [-34, 16], [-52, 30], [-60, 40]] },
  { id: 'rocket', kind: 'path', width: 4.5, points: [[61.6, 28.5], [70.5, 26]] },
  { id: 'parklink', kind: 'path', width: 4.5, points: [[73, 2.5], [76.5, 14.5]] },
  { id: 'beach', kind: 'path', width: 4.5, points: [[-86, 34], [-96, 16], [-100, 0], [-102, -10]] },
  // Footpaths from the nearest road to each Carnival Island attraction (forward = towards it).
  { id: 'carnivalPath', kind: 'path', width: 3.2, points: [[21.2, -11.6], [20.7, -25]] },
  { id: 'foamPath', kind: 'path', width: 3.2, points: [[-19.4, -11.6], [-25.2, -12.3]] },
  { id: 'arenaPath', kind: 'path', width: 3.2, points: [[3.2, 46.5], [16, 47.2], [28.5, 46.3]] },
  { id: 'airPath', kind: 'path', width: 3.2, points: [[1.6, 40], [-5.6, 40.6]] },
  { id: 'roostPath', kind: 'path', width: 3.2, points: [[-26, -139.4], [-26.3, -129.5], [-29.6, -125.2]] },
];

export interface PadDef {
  id: string;
  shape: 'circle' | 'rect';
  x: number;
  z: number;
  /** circle radius, or rect half extents */
  r?: number;
  hx?: number;
  hz?: number;
  y?: number;
  falloff: number;
  /** Keep scatter (trees, rocks) out. Default true. */
  clear?: boolean;
}

export const PADS: readonly PadDef[] = [
  { id: 'plaza', shape: 'circle', x: 0, z: -2, r: 26, y: VILLAGE_Y, falloff: 14 },
  { id: 'village', shape: 'rect', x: 0, z: -36, hx: 26, hz: 22, y: VILLAGE_Y, falloff: 10 },
  { id: 'park', shape: 'rect', x: 70, z: -20, hx: 32, hz: 23, y: VILLAGE_Y, falloff: 12 },
  { id: 'garage', shape: 'rect', x: 34, z: 26, hx: 13, hz: 11, y: VILLAGE_Y - 0.4, falloff: 10 },
  { id: 'balloon', shape: 'circle', x: 84, z: 64, r: 17, falloff: 12 },
  { id: 'rings', shape: 'circle', x: 124, z: 22, r: 24, falloff: 12 },
  { id: 'ranch', shape: 'rect', x: -78, z: 44, hx: 26, hz: 18, falloff: 12 },
  { id: 'silly', shape: 'circle', x: 8, z: 98, r: 19, falloff: 10 },
  { id: 'launch', shape: 'circle', x: 80, z: 24, r: 13, y: VILLAGE_Y, falloff: 8 },
  { id: 'lighthouse', shape: 'circle', x: -62, z: -134, r: 12, falloff: 8 },
  { id: 'bungeeLanding', shape: 'circle', x: -18, z: CANYON.z, r: 5, falloff: 3, clear: true },
  // Carnival Island sites: every attraction stands on flat ground.
  { id: 'carnivalRow', shape: 'rect', x: 23.5, z: -42, hx: 7.5, hz: 18, y: VILLAGE_Y, falloff: 8 },
  { id: 'iceCream', shape: 'circle', x: 24, z: -2, r: 7.5, y: VILLAGE_Y, falloff: 5 },
  // One meadow pad for both inflatable games (the meadow sloped ~2 m; the decks now sit 0.25 m up).
  { id: 'bumpers', shape: 'rect', x: 29.25, z: 56.75, hx: 18.75, hz: 12.75, y: 16.4, falloff: 12 },
  { id: 'foamCourse', shape: 'rect', x: -25.5, z: -38.75, hx: 7.5, hz: 26.5, y: VILLAGE_Y, falloff: 6 },
  { id: 'airstrip', shape: 'rect', x: -12, z: 46, hx: 8.5, hz: 21.5, y: 18, falloff: 8 },
  { id: 'dragonRoost', shape: 'circle', x: -34, z: -130, r: 7, falloff: 5 },
];
