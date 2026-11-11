/**
 * Where the island's life lives. Pure data (tests check it against the layout: on land, off the
 * roads, outside every attraction's clear radius).
 */
import type { AnchorName } from '../../types';
import { ANCHORS } from '../layout';

export type FolkModel = 'panda' | 'frog' | 'bee' | 'flamingo';

export interface FolkDef {
  id: string;
  model: FolkModel;
  /** Multiplier on the model's texture colours (keeps brightness: light pastel tints). */
  tint: number;
  /** Hat band colour. */
  hat: number;
  x: number;
  z: number;
  /** Facing when nobody is around (radians, 0 = +Z). */
  yaw: number;
  /** Shown on Low quality too (the others are dropped on Low). */
  low: boolean;
}

const face = (x: number, z: number, tx: number, tz: number): number => Math.atan2(tx - x, tz - z);

/** 6 townsfolk: two in the plaza, one on main street, two at Bouncy Park, one at the ranch gate. */
export const FOLK: readonly FolkDef[] = [
  { id: 'plaza-east', model: 'panda', tint: 0xffd6e6, hat: 0xd8324a, x: 7.5, z: 13.6, yaw: face(7.5, 13.6, 0, 9), low: true },
  { id: 'plaza-cafe', model: 'frog', tint: 0xfff2c4, hat: 0x2a6fd0, x: -10.5, z: 12.2, yaw: face(-10.5, 12.2, 0, -2), low: true },
  { id: 'main-street', model: 'bee', tint: 0xd8ecff, hat: 0x2e9a48, x: -5.4, z: -26.8, yaw: Math.PI / 2, low: false },
  { id: 'park-kiosk', model: 'panda', tint: 0xd9f5d0, hat: 0xf0a020, x: 91.6, z: -33, yaw: face(91.6, -33, 72, -20), low: true },
  { id: 'park-bench', model: 'frog', tint: 0xf3d9ff, hat: 0xd8324a, x: 52.6, z: -37.4, yaw: face(52.6, -37.4, 58, -24), low: false },
  { id: 'ranch-gate', model: 'bee', tint: 0xffe0c8, hat: 0x6a3cc0, x: -53, z: 50.5, yaw: face(-53, 50.5, -40, 44), low: true },
];

/** Places townsfolk point to when you stand idle near them (attractions only: never gems or keys). */
export const ATTRACTIONS: readonly AnchorName[] = [
  'trampoline', 'bouncePads', 'balloon', 'landingRings', 'bungee', 'lighthouse', 'ranch', 'sillyZone', 'launchPads', 'garage',
];

/**
 * The spot a townsperson at (fx, fz) points at for an attraction: the near edge of its clear circle,
 * never its centre (a gem may float over the middle of a ride).
 */
export function pointTarget(fx: number, fz: number, a: { x: number; z: number; radius: number }): [number, number] {
  const dx = fx - a.x;
  const dz = fz - a.z;
  const l = Math.hypot(dx, dz) || 1;
  const r = a.radius * 0.8;
  return [a.x + (dx / l) * r, a.z + (dz / l) * r];
}

export interface FlockDef {
  /** Landing spots: the first is home; the flock picks the clearest one after a scare. */
  spots: readonly (readonly [number, number])[];
  birds: number;
  color: number;
}

/** Little ground birds (sparrows and pigeons). */
export const FLOCKS: readonly FlockDef[] = [
  { spots: [[6.5, -11], [-8, -12], [-9, 6]], birds: 7, color: 0x9a8a78 },
  { spots: [[66, -6], [72, -38], [44, -12]], birds: 6, color: 0x8b6a4a },
  { spots: [[-66, 26], [-60, 62], [-48, 40]], birds: 6, color: 0x7d6650 },
  { spots: [[40, 34], [26, 38], [52, 30]], birds: 5, color: 0xa08e7a },
  // Island-fill zones.
  { spots: [[-74, 96], [-90, 112], [-70, 108]], birds: 6, color: 0x8b6a4a },
  { spots: [[110, -58], [124, -76], [104, -48]], birds: 5, color: 0x9a8a78 },
  { spots: [[2, 132], [18, 128], [-6, 126]], birds: 5, color: 0xa08e7a },
];

/** Seagulls: circles (centre, radius range, height above ground range). */
export const GULLS: readonly { x: number; z: number; r0: number; r1: number; h0: number; h1: number; n: number }[] = [
  { x: ANCHORS.lighthouse.x, z: ANCHORS.lighthouse.z, r0: 9, r1: 24, h0: 18, h1: 34, n: 7 },
  { x: -118, z: -56, r0: 14, r1: 30, h0: 10, h1: 18, n: 4 },
  { x: -96, z: 6, r0: 10, r1: 20, h0: 9, h1: 15, n: 3 },
];

/** The ranch: sheep graze in the paddock; chickens peck by the barn. */
export const SHEEP: readonly (readonly [number, number])[] = [
  [-60, 34], [-62.5, 36], [-59, 37.5], [-60, 54], [-62.5, 52], [-88, 34],
  // Windmill Farm meadow.
  [-80, 121], [-77, 123], [-83, 120], [-75, 119.5],
];
export const CHICKENS: readonly (readonly [number, number])[] = [
  [-97, 61], [-95.5, 60], [-98.5, 62.5], [-96, 63], [-99, 60],
  // By the Windmill Farm barn.
  [-61, 104], [-59.5, 103], [-62.5, 105.5], [-60, 106],
];
/** Paddock inside the ranch fence (sheep stay in it unless dodging). */
export const PEN = { x: -74, z: 44, hx: 17, hz: 13 } as const;
export const COOP = { x: -97, z: 61.5, r: 4 } as const;
/** Every paddock and coop (the ranch's first, then Windmill Farm's). */
export const PENS: readonly { x: number; z: number; hx: number; hz: number }[] = [PEN, { x: -79, z: 121, hx: 8, hz: 5 }];
export const COOPS: readonly { x: number; z: number; r: number }[] = [COOP, { x: -60.5, z: 104.5, r: 4 }];

/** Ducks paddle an oval in the bay (clear of the lake platform); fish jump inside a circle. */
export const DUCKS = { x: -110, z: -66, rx: 8, rz: 5.5, n: 5, speed: 0.55 } as const;
export const FISH = { x: -124, z: -58, r: 20, avoidX: ANCHORS.lakePlatform.x, avoidZ: ANCHORS.lakePlatform.z, avoidR: 7, n: 3 } as const;

/** Areas searched for flower patches (butterflies) and fireflies' meadows. */
export const BUTTERFLY_AREAS: readonly (readonly [number, number, number])[] = [
  [0, -2, 0], // the plaza flower ring (fixed patch)
  [70, -30, 30],
  [-74, 66, 30],
  [84, 66, 26],
  [-40, 20, 30],
  [-86, 100, 18],
  [10, 132, 14],
  [92, 108, 14],
];
export const FIREFLY_ZONES: readonly (readonly [number, number, number])[] = [
  [0, -2, 9],
  [70, -32, 14],
  [-74, 64, 16],
  [-100, -32, 12],
  [84, 60, 14],
  [-30, 30, 14],
];
