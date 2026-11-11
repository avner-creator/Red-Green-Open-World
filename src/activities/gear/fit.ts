/**
 * Per-character gear fit, on top of the catalog's attach points (`src/core/characters/catalog.ts`).
 * The attach points already place and size head/face/back items for each hero; these few
 * corrections come from the fit grid (`RG_SHOTS=1`, test-results/gear/characters/).
 * Pure data + a lookup (no three.js).
 */
import type { WornSlot } from './look';

export interface GearFit {
  /** Offset in the attach point's space (metres before the anchor's scale). */
  pos?: readonly [number, number, number];
  /** Euler XYZ, radians. */
  rot?: readonly [number, number, number];
  scale?: number;
}

type Rule = { slot: WornSlot; prefix?: string; ids?: readonly string[]; fit: GearFit };

/** Goofy back items that lie on a back like a pack (on Stomp: flat along the spine). */
const LIE_FLAT = ['back-turtle', 'back-snail', 'back-surf', 'back-plush'];

const RULES: Readonly<Record<string, readonly Rule[]>> = {
  // Bolt's eyes sit higher than the old robot's: lift the glasses onto them.
  robot: [{ slot: 'face', fit: { pos: [0, 0.2, 0.02] } }],
  // Stomp's back point lies along the spine, its +Y toward the tail. Capes drape over it as they
  // are; packs are flipped so they stand out of the back (straps down, top toward the head).
  // Goofy back items: shells and packs lie flat like the packs; the rest (wings, balloons, flag,
  // wind-up key, soda jets) stand up on the spine.
  rex: [
    { slot: 'back', prefix: 'pack-', fit: { rot: [Math.PI, 0, 0], pos: [0, 0, 0.05] } },
    { slot: 'back', ids: LIE_FLAT, fit: { rot: [Math.PI, 0, 0], pos: [0, 0, 0.05] } },
    { slot: 'back', prefix: 'back-', fit: { rot: [Math.PI / 2, 0, 0], pos: [0, 0.1, 0.0] } },
  ],
};

/** The fit correction for this item on this hero (null = the attach point alone). */
export function gearFit(characterId: string, slot: WornSlot, itemId: string): GearFit | null {
  for (const r of RULES[characterId] ?? []) {
    if (r.slot === slot && (!r.prefix || itemId.startsWith(r.prefix)) && (!r.ids || r.ids.includes(itemId))) return r.fit;
  }
  return null;
}
