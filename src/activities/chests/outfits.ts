/**
 * The six chest rewards. Ids contain 'hat', 'cape', 'glass' or 'paint' so the UI picks the icon.
 * Chest `i` gives `OUTFITS[i]`.
 */
import type { OutfitDef } from '../../types';

export const OUTFITS: readonly OutfitDef[] = [
  { id: 'hat-explorer', slot: 'head', name: 'Explorer hat', icon: 'hat' },
  { id: 'cape-hero', slot: 'back', name: 'Hero cape', icon: 'cape' },
  { id: 'paint-flame', slot: 'carColor', name: 'Flame paint', icon: 'paint' },
  { id: 'glasses-star', slot: 'face', name: 'Star glasses', icon: 'glasses' },
  { id: 'hat-party', slot: 'head', name: 'Party hat', icon: 'hat' },
  { id: 'paint-sky', slot: 'carColor', name: 'Sky paint', icon: 'paint' },
];

/**
 * Buggy paint colours. Chosen so they differ in brightness in BOTH the red and the green channel
 * against the ground (flame is bright in R, sky is bright in G), never by hue alone.
 */
export const PAINT_COLORS: Readonly<Record<string, number>> = {
  'paint-flame': 0xff5a14,
  'paint-sky': 0x2aa8ff,
};

/** Used to restore cars on a new session when the vehicle does not publish `userData.defaultColor`. */
export const CAR_FALLBACK_COLOR = 0xe8e2d4;

export function outfitForChest(index: number): OutfitDef {
  return OUTFITS[index % OUTFITS.length];
}
