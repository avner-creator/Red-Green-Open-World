/**
 * The island-fill zones (pure data): id, pictogram, colour and landmark position. Shared by the fill
 * builder, the map board and the fingerposts (`wayTarget` in attractions.ts).
 */
import type { IconId } from '../pictograms';

export type FillZoneId = 'funfair' | 'farm' | 'cove' | 'lookout' | 'rainbow' | 'huts' | 'picnic';

export interface Zone {
  id: FillZoneId;
  icon: IconId;
  /** Arch / route / sign-arm colour (dark enough for cream to read on it in both channels). */
  color: number;
  /** Landmark position. */
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
