/**
 * The goofy wardrobe: 38 procedural items (hats, face stuff, back stuff). Pure data + builders.
 * Prices ramp gently: six are free from the first second, the rubber-duck hat is the first-minute
 * gift (see ../gift.ts), several cost 3–8 gems (one or two minutes of play), the dream items 45–85.
 */
import type { EquipSlot, IconName, ShopItem } from '../../../types';
import type { Wearable } from './kit';
import * as B from './backs';
import * as F from './faces';
import * as H from './hats';

export interface GoofyDef {
  id: string;
  slot: Extract<EquipSlot, 'head' | 'face' | 'back'>;
  name: string;
  icon: IconName;
  price: number;
  build: () => Wearable;
}

const hat = (id: string, name: string, price: number, build: () => Wearable): GoofyDef => ({ id, slot: 'head', name, icon: 'hat', price, build });
const face = (id: string, name: string, price: number, build: () => Wearable): GoofyDef => ({ id, slot: 'face', name, icon: 'glasses', price, build });
const back = (id: string, name: string, price: number, build: () => Wearable, icon: IconName = 'backpack'): GoofyDef => ({ id, slot: 'back', name, icon, price, build });

export const GOOFY: readonly GoofyDef[] = [
  // Free from the first second.
  hat('hat-cone', 'Traffic cone', 0, H.buildConeHat),
  hat('hat-chef', 'Chef hat', 0, H.buildChefHat),
  face('face-googly', 'Googly eyes', 0, F.buildGooglyEyes),
  face('face-moustache', 'Curly moustache', 0, F.buildMoustache),
  face('face-clown', 'Clown nose', 0, F.buildClownNose),
  back('back-balloons', 'Balloon bunch', 0, B.buildBalloonBunch, 'balloon'),
  // The first-minute gift (also for sale, cheap).
  hat('hat-duck', 'Rubber duck', 3, H.buildDuckHat),
  // A minute or two of play.
  hat('hat-pizza', 'Pizza slice', 4, H.buildPizzaHat),
  face('face-bigglasses', 'Giant glasses', 5, F.buildBigGlasses),
  hat('hat-shark', 'Shark fin', 5, H.buildSharkFin),
  face('face-disguise', 'Silly disguise', 6, F.buildDisguise),
  hat('hat-pompom', 'Pom-pom beanie', 6, H.buildPomBeanie),
  back('back-windup', 'Wind-up key', 8, B.buildWindUpKey),
  hat('hat-flowerpot', 'Flower pot', 8, H.buildFlowerPot),
  // A few minutes.
  face('face-hearts', 'Heart shades', 10, F.buildHeartShades),
  hat('hat-unicorn', 'Unicorn horn', 12, H.buildUnicornHorn),
  back('back-flag', 'Flag', 12, B.buildFlag),
  hat('hat-antlers', 'Antlers', 14, H.buildAntlers),
  hat('hat-tophat', 'Magic top hat', 15, H.buildTopHat),
  face('face-snorkel', 'Snorkel mask', 15, F.buildSnorkel),
  hat('hat-cake', 'Birthday cake', 16, H.buildCakeHat),
  back('back-plush', 'Teddy pack', 18, B.buildPlushPack),
  face('face-mask', 'Hero mask', 18, F.buildHeroMask),
  hat('hat-viking', 'Viking helmet', 20, H.buildVikingHelmet),
  back('back-turtle', 'Turtle shell', 22, B.buildTurtleShell),
  hat('hat-dino', 'Dino hood', 25, H.buildDinoHood),
  face('face-beard', 'Fluffy beard', 25, F.buildBeard),
  hat('hat-jester', 'Jester hat', 28, H.buildJesterHat),
  back('back-soda', 'Soda jetpack', 30, B.buildSodaJetpack),
  back('back-surf', 'Surfboard', 30, B.buildSurfboard),
  // Dream items.
  hat('hat-tricorn', 'Pirate hat', 35, H.buildTricorn),
  hat('hat-octopus', 'Octopus pal', 40, H.buildOctopusHat),
  hat('hat-sombrero', 'Giant sombrero', 45, H.buildSombrero),
  back('back-snail', 'Snail shell', 45, B.buildSnailShell),
  hat('hat-fishbowl', 'Fishbowl', 50, H.buildFishbowl),
  face('face-visor', 'Robot visor', 50, F.buildVisor),
  back('back-butterfly', 'Butterfly wings', 60, B.buildButterflyWings, 'cape'),
  back('back-dragon', 'Dragon wings', 85, B.buildDragonWings, 'dragon'),
];

const byId = new Map(GOOFY.map((g) => [g.id, g]));

/** Shop entries (category 'outfit'). */
export const GOOFY_ITEMS: readonly ShopItem[] = GOOFY.map(({ id, slot, name, icon, price }) => ({ id, slot, name, icon, price, category: 'outfit' }));

/** Build a goofy item by id, or null if the id is not one. */
export function buildGoofy(id: string): Wearable | null {
  return byId.get(id)?.build() ?? null;
}

/** The first-minute gift. */
export const GIFT_ITEM = 'hat-duck';
