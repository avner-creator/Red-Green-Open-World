/** Local types of the buddy (Pip). Kept out of src/types.ts on purpose. */
import type { PictoName } from '../ui/wayIcons';

/** Small extra pictograms only Pip uses (drawn in src/ui/buddy/picto.ts). */
export type BuddyExtraIcon = 'paw' | 'wave' | 'question' | 'pip' | 'nose' | 'party';

/** Actions a bubble can show as a key cap / pad button / touch gesture for the active device. */
export type ActionGlyph = 'move' | 'look' | 'jump' | 'use' | 'skill' | 'close';

export type BuddyPicto = PictoName | BuddyExtraIcon;

/** The six magic-glasses mini-games (world ids from COMPASS_ATTRACTIONS / `world.anchors`). */
export const GLASSES_ATTRACTIONS = ['glowflies', 'oddone', 'lineup', 'toys', 'gates', 'dotsigns'] as const;
export type GlassesAttraction = (typeof GLASSES_ATTRACTIONS)[number];

/** Attractions Pip knows by name (they all have a world anchor). */
export type Attraction =
  | 'trampoline' | 'balloon' | 'launchPads' | 'garage' | 'gearShack' | 'bungee' | 'ranch' | 'sillyZone' | 'bouncePads'
  | 'carnivalRow' | 'iceCream' | 'bubbleArena' | 'dinoRing' | 'raceStart' | 'foamCourse' | 'airstrip' | 'dragonRoost'
  | GlassesAttraction;
