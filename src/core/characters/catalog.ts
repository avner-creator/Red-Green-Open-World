/**
 * Playable characters. Data only: the player controller and the character-select UI read this.
 *
 * Every model is CC0 (see ASSETS.md), cleaned by `tools/characters/build.mjs`: weapons and
 * fighting/hurt clips are removed, colours are tuned so each reads in the R-only and the G-only
 * channel (brightness contrast, not hue), procedural clips fill gaps (dance, wave, fall…), and the
 * files are meshopt + WebP compressed. Load them with `loadCharacter` (./load.ts), which sets the
 * meshopt decoder.
 *
 * Units: metres. Character space = feet at the origin, +Y up, facing +Z, after `scale`.
 */
import type { PlayerAnim, SkillId } from '../../types';

export type CharacterId = 'robot' | 'frog' | 'panda' | 'bee' | 'flamingo' | 'rex';
export type CharacterSkill = SkillId;
export type AttachPart = 'head' | 'back' | 'face';

export interface ClipRef {
  /** Animation clip name inside the GLB. */
  readonly clip: string;
  readonly loop: boolean;
  /** Playback-speed multiplier (default 1). */
  readonly rate?: number;
  /** Start this far into the clip, 0..1 (e.g. hold the airborne part of a jump). */
  readonly startAt?: number;
}

export interface AttachPoint {
  /** Bone (node) name the anchor follows. */
  readonly bone: string;
  /** Anchor position in character space at the rest pose, metres. */
  readonly offset: readonly [number, number, number];
  /** Anchor rotation in character space, radians (XYZ Euler). E.g. the dinosaur's back faces up. */
  readonly rotation?: readonly [number, number, number];
  /** Uniform scale for outfits on this anchor (1 = outfit sized for the default robot). */
  readonly scale?: number;
}

/**
 * Optional seated adjustments (buggy, riding): extra bone rotations layered on the `sit` clip and
 * a model offset, so long bodies (the dinosaur's tail) stay out of the roll cage and the camera view.
 */
export interface SeatPose {
  /** Extra local rotation per bone, radians (XYZ Euler), multiplied onto the clip's pose. */
  readonly bones?: Readonly<Record<string, readonly [number, number, number]>>;
  /** Model offset while seated, metres in character space (+Y up, +Z forward). */
  readonly offset?: readonly [number, number, number];
}

export interface CharacterDef {
  readonly id: CharacterId;
  /** Short display name (2–8 letters, shown big on the select carousel). */
  readonly name: string;
  /** One fun line. No health wording. */
  readonly backstory: string;
  /** File under public/, relative to the site base: load it as `${import.meta.env.BASE_URL}${modelUrl}` (loadCharacter does). */
  readonly modelUrl: string;
  /** Uniform scale applied to the GLB scene to get the size below. */
  readonly scale: number;
  /** Standing height after `scale`, metres (top of head/ears). */
  readonly height: number;
  /** Nose-to-tail length, metres (only the dinosaur is much longer than the 0.7 m capsule). */
  readonly length: number;
  /** PlayerAnim → clip. Every PlayerAnim is mapped; none uses a fighting or hurt clip. */
  readonly anims: Readonly<Record<PlayerAnim, ClipRef>>;
  /** Signature emote (character select, celebrations). */
  readonly emote: ClipRef;
  readonly attach: Readonly<Record<AttachPart, AttachPoint>>;
  /** Price in gems; 0 = free from the start. */
  readonly price: number;
  readonly skill: CharacterSkill;
  /** Two colours for UI cards (light, dark): picked to differ in brightness in R and G alone. */
  readonly cardColors: readonly [string, string];
  /** Seated pose tweaks (only characters that need them). */
  readonly seat?: SeatPose;
}

/** The four space-suit characters share a skeleton; one scale keeps their proportions. */
const ASTRO_SCALE = 0.6;

const ASTRO_ANIMS: Record<PlayerAnim, ClipRef> = {
  idle: { clip: 'Idle', loop: true },
  walk: { clip: 'Walk', loop: true },
  run: { clip: 'Run', loop: true },
  jump: { clip: 'Jump', loop: false },
  fall: { clip: 'Jump_Idle', loop: true },
  flop: { clip: 'Flop', loop: false },
  dance: { clip: 'Dance', loop: true },
  wave: { clip: 'Wave', loop: true },
  cheer: { clip: 'Yes', loop: false },
  sit: { clip: 'Sit', loop: false },
};

/**
 * Attach points for the space-suit characters (same skeleton; heads differ). Placed from the
 * rest-pose head boxes printed by `tools/characters/measure.mjs`, checked in the anchor
 * screenshots. Their heads are bigger than the robot's, so outfits are scaled up a little.
 */
function astroAttach(headY: number, headZ: number, faceY: number, faceZ: number): Record<AttachPart, AttachPoint> {
  return {
    head: { bone: 'Head', offset: [0, headY, headZ], scale: 1.25 },
    face: { bone: 'Head', offset: [0, faceY, faceZ], scale: 1.25 },
    back: { bone: 'Torso', offset: [0, 0.95, -0.3], scale: 1.1 },
  };
}

export const CHARACTERS: readonly CharacterDef[] = [
  {
    id: 'robot',
    name: 'Bolt',
    backstory: 'Built from spare toaster parts, Bolt jumps twice because once is never enough.',
    modelUrl: 'assets/characters/robot.glb',
    scale: 0.383,
    height: 1.7,
    length: 0.6,
    anims: {
      idle: { clip: 'Idle', loop: true },
      walk: { clip: 'Walking', loop: true },
      run: { clip: 'Running', loop: true },
      jump: { clip: 'Jump', loop: false },
      fall: { clip: 'Jump', loop: false, startAt: 0.45 },
      flop: { clip: 'Flop', loop: false },
      dance: { clip: 'Dance', loop: true },
      wave: { clip: 'Wave', loop: true },
      cheer: { clip: 'ThumbsUp', loop: false },
      sit: { clip: 'Sitting', loop: false },
    },
    emote: { clip: 'Dance', loop: true },
    attach: {
      head: { bone: 'Head', offset: [0, 1.62, 0] },
      face: { bone: 'Head', offset: [0, 1.25, 0.56] },
      back: { bone: 'Torso', offset: [0, 0.75, -0.26] },
    },
    price: 0,
    skill: 'doubleJump',
    cardColors: ['#f2efe6', '#2b3038'],
  },
  {
    id: 'frog',
    name: 'Hopper',
    backstory: 'Hopper once bounced so high he had to wear a space suit to come back down.',
    modelUrl: 'assets/characters/frog.glb',
    scale: ASTRO_SCALE,
    height: 1.64,
    length: 1.16,
    anims: ASTRO_ANIMS,
    emote: { clip: 'Hop', loop: true },
    attach: astroAttach(1.58, 0.15, 1.45, 0.45),
    price: 0,
    skill: 'superBounce',
    cardColors: ['#e9f7d4', '#1f3a1c'],
  },
  {
    id: 'panda',
    name: 'Mochi',
    backstory: 'Mochi is the fastest snack-fetcher in the galaxy. Blink and you miss her.',
    modelUrl: 'assets/characters/panda.glb',
    scale: ASTRO_SCALE,
    height: 1.83,
    length: 0.96,
    anims: ASTRO_ANIMS,
    emote: { clip: 'Dance', loop: true },
    attach: astroAttach(1.68, 0, 1.42, 0.4),
    price: 25,
    skill: 'dash',
    cardColors: ['#fbe9d6', '#3a1d10'],
  },
  {
    id: 'bee',
    name: 'Bumble',
    backstory: 'Bumble’s wings are tiny, but she floats down like a dandelion seed anyway.',
    modelUrl: 'assets/characters/bee.glb',
    scale: ASTRO_SCALE,
    height: 1.56,
    length: 0.8,
    anims: ASTRO_ANIMS,
    emote: { clip: 'Wave', loop: true },
    attach: astroAttach(1.55, 0, 1.36, 0.3),
    price: 40,
    skill: 'glide',
    cardColors: ['#fff3b8', '#26200a'],
  },
  {
    id: 'flamingo',
    name: 'Rosa',
    backstory: 'Rosa stands on one leg so the other one is always ready for a second jump.',
    modelUrl: 'assets/characters/flamingo.glb',
    scale: ASTRO_SCALE,
    height: 1.73,
    length: 0.87,
    anims: ASTRO_ANIMS,
    emote: { clip: 'Spin', loop: true },
    attach: astroAttach(1.7, 0.08, 1.5, 0.3),
    price: 60,
    skill: 'doubleJump',
    cardColors: ['#ffe3ee', '#3b1426'],
  },
  {
    id: 'rex',
    name: 'Stomp',
    backstory: 'Stomp is a very polite dinosaur who makes the ground wobble when he lands.',
    modelUrl: 'assets/characters/rex.glb',
    scale: 0.11,
    height: 1.67,
    length: 3.53,
    anims: {
      idle: { clip: 'Idle', loop: true },
      walk: { clip: 'Walk', loop: true },
      run: { clip: 'Run', loop: true },
      jump: { clip: 'Jump', loop: false },
      fall: { clip: 'Fall', loop: true },
      flop: { clip: 'Flop', loop: false },
      dance: { clip: 'Dance', loop: true },
      wave: { clip: 'Wave', loop: true },
      cheer: { clip: 'Jump', loop: false },
      sit: { clip: 'Sit', loop: false },
    },
    emote: { clip: 'Dance', loop: true },
    attach: {
      head: { bone: 'Head', offset: [0, 1.64, 1.3] },
      face: { bone: 'Head', offset: [0, 1.5, 1.62] },
      // A dinosaur's "back" is on top: backpacks and capes lie along the spine.
      back: { bone: 'Torso', offset: [0, 1.3, 0.3], rotation: [-Math.PI / 2, 0, 0], scale: 1.2 },
    },
    price: 100,
    skill: 'groundPound',
    cardColors: ['#eef5c8', '#1d2a12'],
    // Seated, the tail would curl up through the roll cage and hide his head from the chase
    // camera: lay it down along the rear deck instead.
    seat: {
      bones: { Tail1: [-0.5, 0, 0], Tail2: [-0.15, 0, 0], Tail3: [-0.1, 0, 0], Neck: [0.45, 0, 0] },
    },
  },
];

export const CHARACTER_IDS: readonly CharacterId[] = CHARACTERS.map((c) => c.id);

export function getCharacter(id: CharacterId): CharacterDef {
  const c = CHARACTERS.find((x) => x.id === id);
  if (!c) throw new Error(`unknown character ${id}`);
  return c;
}

export const DEFAULT_CHARACTER: CharacterId = 'robot';
