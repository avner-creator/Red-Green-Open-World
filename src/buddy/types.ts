/** Local types of the buddy (Pip). Kept out of src/types.ts on purpose. */
import type { PictoName } from '../ui/wayIcons';

/** Small extra pictograms only Pip uses (drawn in src/ui/buddy/picto.ts). */
export type BuddyExtraIcon = 'paw' | 'wave' | 'question' | 'pip' | 'nose' | 'party';

export type BuddyPicto = PictoName | BuddyExtraIcon;

/** Attractions Pip knows by name (they all have a world anchor). */
export type Attraction =
  | 'trampoline' | 'balloon' | 'launchPads' | 'garage' | 'gearShack' | 'bungee' | 'ranch' | 'sillyZone' | 'bouncePads'
  | 'carnivalRow' | 'iceCream' | 'bubbleArena' | 'dinoRing' | 'raceStart' | 'foamCourse' | 'airstrip' | 'dragonRoost';
