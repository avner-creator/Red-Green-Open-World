/**
 * The gear catalog: things to buy and wear. Prices are in gems (5..100). A child can reach several
 * items in the first minutes (5..20) and aspire to a few big ones (60..100).
 * The six chest rewards are listed as `chestOnly` items with the same ids as `OUTFITS`.
 */
import type { EquipSlot, ShopItem } from '../../types';
import { OUTFITS, PAINT_COLORS } from '../chests/outfits';

const outfit = (id: string, slot: EquipSlot, name: string, icon: ShopItem['icon'], price: number): ShopItem => ({
  id, slot, name, icon, price, category: 'outfit',
});

/** Buggy paints: they differ in brightness in BOTH the red and the green channel, not by hue alone. */
export const GEAR_PAINTS: Readonly<Record<string, number>> = {
  'paint-snow': 0xf2f6ff,
  'paint-night': 0x161a2e,
  'paint-ruby': 0xc4122e,
  'paint-lime': 0x8fe03a,
};

const css = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;

export const SHOP_GEAR: readonly ShopItem[] = [
  // Hats
  outfit('hat-propeller', 'head', 'Propeller cap', 'hat', 12),
  outfit('hat-wizard', 'head', 'Wizard hat', 'hat', 45),
  outfit('hat-crown', 'head', 'Royal crown', 'hat', 80),
  // Capes
  outfit('cape-star', 'back', 'Star cape', 'cape', 30),
  outfit('cape-flame', 'back', 'Flame cape', 'cape', 70),
  // Backpacks
  outfit('pack-explorer', 'back', 'Explorer pack', 'backpack', 18),
  outfit('pack-rocket', 'back', 'Rocket pack', 'backpack', 90),
  // Glasses
  outfit('glasses-shades', 'face', 'Cool shades', 'glasses', 8),
  outfit('glasses-goggles', 'face', 'Flight goggles', 'glasses', 25),
  // Buggy paints
  { id: 'paint-snow', category: 'paint', slot: 'carColor', name: 'Snow paint', icon: 'paint', price: 10, swatch: css(GEAR_PAINTS['paint-snow']) },
  { id: 'paint-night', category: 'paint', slot: 'carColor', name: 'Night paint', icon: 'paint', price: 15, swatch: css(GEAR_PAINTS['paint-night']) },
  { id: 'paint-lime', category: 'paint', slot: 'carColor', name: 'Lime paint', icon: 'paint', price: 35, swatch: css(GEAR_PAINTS['paint-lime']) },
  { id: 'paint-ruby', category: 'paint', slot: 'carColor', name: 'Ruby paint', icon: 'paint', price: 55, swatch: css(GEAR_PAINTS['paint-ruby']) },
  // Trails
  { id: 'trail-sparkle', category: 'trail', slot: 'trail', name: 'Sparkle trail', icon: 'trail', price: 20, swatch: '#ffd21f' },
  { id: 'trail-bubbles', category: 'trail', slot: 'trail', name: 'Bubble trail', icon: 'trail', price: 35, swatch: '#8fe8ff' },
  { id: 'trail-rainbow', category: 'trail', slot: 'trail', name: 'Rainbow trail', icon: 'trail', price: 75, swatch: '#ff4a8a' },
  // Emotes
  { id: 'emote-wave', category: 'emote', slot: 'emote', name: 'Wave', icon: 'emote', price: 0 },
  { id: 'emote-cheer', category: 'emote', slot: 'emote', name: 'Cheer', icon: 'emote', price: 5 },
  { id: 'emote-dance', category: 'emote', slot: 'emote', name: 'Dance', icon: 'emote', price: 20 },
];

/** The six chest rewards, same ids as `OUTFITS`. Never sold; the shop shows them with a chest badge. */
export const CHEST_GEAR: readonly ShopItem[] = OUTFITS.map(
  (o): ShopItem => ({
    id: o.id,
    category: o.slot === 'carColor' ? 'paint' : 'outfit',
    slot: o.slot,
    name: o.name,
    icon: o.icon,
    price: 0,
    chestOnly: true,
    ...(PAINT_COLORS[o.id] !== undefined ? { swatch: css(PAINT_COLORS[o.id]) } : {}),
  }),
);

export const GEAR_CATALOG: readonly ShopItem[] = [...SHOP_GEAR, ...CHEST_GEAR];

/** Buggy paint colour for an item id (shop paints and chest paints), or null if it is not a paint. */
export function paintColor(id: string | null): number | null {
  if (!id) return null;
  return GEAR_PAINTS[id] ?? PAINT_COLORS[id] ?? null;
}

export type TrailKind = 'sparkle' | 'bubbles' | 'rainbow';

export function trailKind(id: string | null): TrailKind | null {
  switch (id) {
    case 'trail-sparkle':
      return 'sparkle';
    case 'trail-bubbles':
      return 'bubbles';
    case 'trail-rainbow':
      return 'rainbow';
    default:
      return null;
  }
}

export type EmoteKind = 'wave' | 'dance' | 'cheer';

export function emoteKind(id: string | null): EmoteKind | null {
  switch (id) {
    case 'emote-wave':
      return 'wave';
    case 'emote-dance':
      return 'dance';
    case 'emote-cheer':
      return 'cheer';
    default:
      return null;
  }
}
