/** Village building lots (pure data + derived dimensions shared by the builder and gem spots). */
import { VILLAGE_Y } from './layout';

export type RoofKind = 'gable' | 'hip' | 'flat';

export interface Lot {
  id: string;
  x: number;
  z: number;
  /** Facing angle: front faces (sin yaw, 0, cos yaw). */
  yaw: number;
  /** Width along the front, depth front-to-back. */
  w: number;
  d: number;
  floors: number;
  roof: RoofKind;
  wall: number;
  roofColor: number;
  trim: number;
  /** Shop front with a striped awning in this colour. */
  awning?: number;
}

const L = Math.PI / 2;
const R = -Math.PI / 2;

export const LOTS: readonly Lot[] = [
  { id: 'bakery', x: -12.5, z: -26, yaw: L, w: 9, d: 8, floors: 2, roof: 'gable', wall: 0xf1e4cb, roofColor: 0xa4472f, trim: 0x6b4630, awning: 0xc83c3c },
  { id: 'bluehouse', x: -12.5, z: -37.5, yaw: L, w: 8, d: 8, floors: 1, roof: 'hip', wall: 0xcfe0e8, roofColor: 0x46546a, trim: 0xf6f3ea },
  { id: 'tower', x: -13, z: -49.5, yaw: L, w: 10, d: 9, floors: 2, roof: 'gable', wall: 0xf3d2b2, roofColor: 0x3d5a46, trim: 0xf6f3ea },
  { id: 'toyshop', x: 12.5, z: -25, yaw: R, w: 8, d: 8, floors: 1, roof: 'gable', wall: 0xf5f1e6, roofColor: 0x34557f, trim: 0x2f3b52, awning: 0x2f7fa8 },
  { id: 'flat', x: 13, z: -36.5, yaw: R, w: 10, d: 9, floors: 2, roof: 'flat', wall: 0xe8d4a6, roofColor: 0x8c8277, trim: 0x7a4b32 },
  { id: 'greenhouse', x: 12.5, z: -48, yaw: R, w: 9, d: 8, floors: 2, roof: 'hip', wall: 0xd9e5c6, roofColor: 0x6e4a35, trim: 0xf6f3ea },
  { id: 'hall', x: -25, z: -4, yaw: L, w: 11, d: 9, floors: 2, roof: 'gable', wall: 0xf4dcc2, roofColor: 0x8e3a2c, trim: 0xf6f3ea },
  { id: 'cafe', x: -20, z: 22, yaw: Math.atan2(20, -24), w: 9, d: 8, floors: 1, roof: 'gable', wall: 0xece6f2, roofColor: 0x5b4870, trim: 0x3b3040, awning: 0xe0a030 },
];

export const FLOOR_H = 3.1;
export const PLINTH_H = 0.5;

export interface LotDims {
  baseY: number;
  wallTop: number;
  /** Rise of the roof above wallTop (0 for flat). */
  rise: number;
  /** Highest walkable roof point (ridge or flat roof surface). */
  roofTop: number;
}

export function lotDims(l: Lot): LotDims {
  const baseY = VILLAGE_Y;
  const wallTop = baseY + PLINTH_H + l.floors * FLOOR_H;
  const rise = l.roof === 'flat' ? 0 : l.roof === 'gable' ? (l.d / 2 + 0.5) * 0.58 : (Math.min(l.w, l.d) / 2 + 0.5) * 0.62;
  return { baseY, wallTop, rise, roofTop: wallTop + (l.roof === 'flat' ? 0.15 : rise) };
}
