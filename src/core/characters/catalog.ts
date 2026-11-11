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
import { nativeSkillFor, type PowerId } from '../skills-powers';

export type CharacterId = 'robot' | 'frog' | 'panda' | 'bee' | 'flamingo' | 'rex' | 'fox' | 'pup' | 'alpaca' | 'trike';
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

/**
 * Big cartoon eyes (see ./face.ts). Positions are character space at the rest pose (metres,
 * after `scale`): the LEFT eye (+X); the right one is mirrored.
 */
export interface FaceDef {
  /** Bone the face follows. */
  readonly bone: string;
  readonly eyeAt: readonly [number, number, number];
  /** Eyeball radius, metres. */
  readonly eyeR: number;
  /** Outward turn of each eye (radians) and upward tilt. */
  readonly eyeYaw?: number;
  readonly eyePitch?: number;
  /** Lid colour (matches the skin around the eyes). */
  readonly lid: string;
  readonly sclera?: string;
  /** Iris outer and inner colour (keep dark: the iris reads by brightness). */
  readonly iris?: string;
  readonly irisLight?: string;
  /** Iris size multiplier (1 = 34° radius). */
  readonly irisSize?: number;
  /** Left cheek blush centre (mirrored), radius and outward turn. */
  readonly blushAt?: readonly [number, number, number];
  readonly blushR?: number;
  readonly blushYaw?: number;
  readonly blushColor?: string;
  /** Positions were measured on the first idle frame (not the rest pose). */
  readonly inIdle?: boolean;
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
  /**
   * The classic skill the player runs right now: the hero's chosen power when that is a classic
   * skill, else its signature (extra powers run beside it, see src/core/skills-powers.ts).
   */
  readonly skill: CharacterSkill;
  /** Signature skill (shown first; the default pick). */
  readonly signature: CharacterSkill;
  /** Two more powers free from the start (see skills-powers.ts for the pool). */
  readonly freePowers: readonly [PowerId, PowerId];
  /** Two colours for UI cards (light, dark): picked to differ in brightness in R and G alone. */
  readonly cardColors: readonly [string, string];
  /** Seated pose tweaks (only characters that need them). */
  readonly seat?: SeatPose;
  /** Cartoon eyes and blush. */
  readonly face?: FaceDef;
  /** Springy bone chains (ears, tails, antennae): roots of each chain. */
  readonly springs?: readonly string[];
  /** Smooth the normals of a faceted source (rounder look). */
  readonly smooth?: boolean;
  /** Warm shading tweaks (see ./warm.ts). */
  readonly warm?: { readonly fill?: number; readonly rim?: number };
  /** Footsteps per walk/run clip cycle (2 for most; drives the step bounce). */
  readonly steps?: number;
  /** Signature emote id shown in the UI ('dance', 'hop', 'spin', 'wave'…). */
  readonly emoteName?: string;
}

/** The four space-suit characters share a skeleton; one scale keeps their proportions. */
const ASTRO_SCALE = 0.6;

/** Four-legged friends from the animal pack (procedural Dance/Wave/Cheer/Fall/Flop/Sit added). */
function animalAnims(): Record<PlayerAnim, ClipRef> {
  return {
    idle: { clip: 'Idle', loop: true },
    walk: { clip: 'Walk', loop: true, rate: 1.3 },
    run: { clip: 'Gallop', loop: true },
    jump: { clip: 'Gallop_Jump', loop: false },
    fall: { clip: 'Fall', loop: true },
    flop: { clip: 'Flop', loop: false },
    dance: { clip: 'Dance', loop: true },
    wave: { clip: 'Wave', loop: true },
    cheer: { clip: 'Cheer', loop: false },
    sit: { clip: 'Sit', loop: false },
  };
}

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

/** A catalog entry whose `skill` follows the hero's chosen power. */
function hero(d: Omit<CharacterDef, 'skill'>): CharacterDef {
  const def = { ...d } as CharacterDef;
  Object.defineProperty(def, 'skill', { get: () => nativeSkillFor(def), enumerable: true });
  return def;
}

export const CHARACTERS: readonly CharacterDef[] = [
  hero({
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
    signature: 'doubleJump',
    freePowers: ['rocketBoots', 'dash'],
    emoteName: 'dance',
    cardColors: ['#f2efe6', '#2b3038'],
    face: { bone: 'Head', eyeAt: [0.17, 1.33, 0.5], eyeR: 0.11, eyeYaw: 0.12, lid: '#d9d4c8', iris: '#16324a', irisLight: '#3f86b8', irisSize: 1.05 },
  }),
  hero({
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
    signature: 'superBounce',
    freePowers: ['bounceBall', 'doubleJump'],
    emoteName: 'hop',
    cardColors: ['#e9f7d4', '#1f3a1c'],
    face: { bone: 'Head', eyeAt: [0.27, 1.49, 0.25], eyeR: 0.125, eyeYaw: 0.5, eyePitch: 0.1, lid: '#3f9a2c', iris: '#3a2414', blushAt: [0.25, 1.36, 0.3], blushR: 0.05, blushYaw: 0.7 },
  }),
  hero({
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
    price: 0,
    signature: 'dash',
    freePowers: ['rainbowSlide', 'glide'],
    emoteName: 'dance',
    cardColors: ['#fbe9d6', '#3a1d10'],
    face: { bone: 'Head', eyeAt: [0.2, 1.47, 0.34], eyeR: 0.085, eyeYaw: 0.35, lid: '#e0662a', iris: '#2a160c', blushAt: [0.18, 1.38, 0.36], blushR: 0.045 },
  }),
  hero({
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
    price: 0,
    signature: 'glide',
    freePowers: ['bubbleShield', 'doubleJump'],
    emoteName: 'wave',
    cardColors: ['#fff3b8', '#26200a'],
    face: { bone: 'Head', eyeAt: [0.18, 1.34, 0.28], eyeR: 0.085, eyeYaw: 0.5, lid: '#2a2a2a', iris: '#2a160c', sclera: '#fffdf5', blushAt: [0.16, 1.24, 0.3], blushR: 0.045 },
  }),
  hero({
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
    price: 15,
    signature: 'doubleJump',
    freePowers: ['glide', 'rainbowSlide'],
    emoteName: 'spin',
    cardColors: ['#ffe3ee', '#3b1426'],
    face: { bone: 'Head', eyeAt: [0.17, 1.6, 0.12], eyeR: 0.065, eyeYaw: 1.0, lid: '#f08ab0', iris: '#2a160c' },
  }),
  hero({
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
    price: 40,
    signature: 'groundPound',
    freePowers: ['giant', 'superBounce'],
    emoteName: 'dance',
    cardColors: ['#eef5c8', '#1d2a12'],
    face: { bone: 'Head', eyeAt: [0.15, 1.62, 1.35], eyeR: 0.1, eyeYaw: 0.35, lid: '#bfe868', iris: '#2a160c', blushAt: [0.24, 1.42, 1.45], blushR: 0.06, blushYaw: 1.1 },
    smooth: true,
    springs: ['Tail1'],
    // Seated, the tail would curl up through the roll cage and hide his head from the chase
    // camera: lay it down along the rear deck instead.
    seat: {
      bones: { Tail1: [-0.5, 0, 0], Tail2: [-0.15, 0, 0], Tail3: [-0.1, 0, 0], Neck: [0.45, 0, 0] },
    },
  }),
  hero({
    id: 'pup',
    name: 'Biscuit',
    backstory: 'Biscuit can sniff out treasure three hills away, and always shares the snacks.',
    modelUrl: 'assets/characters/pup.glb',
    scale: 0.42,
    height: 1.3,
    length: 1.66,
    anims: animalAnims(),
    emote: { clip: 'Wave', loop: true },
    attach: {
      head: { bone: 'Head', offset: [0, 1.22, 0.72], scale: 0.9 },
      face: { bone: 'Head', offset: [0, 1.05, 0.98], scale: 0.85 },
      back: { bone: 'Torso', offset: [0, 0.98, 0.0], rotation: [-Math.PI / 2, 0, 0], scale: 0.95 },
    },
    price: 0,
    signature: 'superBounce',
    freePowers: ['bubbleShield', 'dash'],
    emoteName: 'wag',
    cardColors: ['#fff0dc', '#3d2410'],
    face: { bone: 'Head', inIdle: true, eyeAt: [0.14, 1.15, 0.9], eyeR: 0.085, eyeYaw: 0.35, lid: '#f2b066', iris: '#2a160c' },
    springs: ['Tail1', 'Ear1.L', 'Ear1.R'],
    smooth: true,
    steps: 2,
  }),
  hero({
    id: 'fox',
    name: 'Ziggy',
    backstory: 'Ziggy zooms so fast that her fluffy tail arrives a second later.',
    modelUrl: 'assets/characters/fox.glb',
    scale: 0.5,
    height: 1.4,
    length: 2.9,
    anims: animalAnims(),
    emote: { clip: 'Dance', loop: true },
    attach: {
      head: { bone: 'Head', offset: [0, 1.25, 0.95], scale: 0.9 },
      face: { bone: 'Head', offset: [0, 1.08, 1.2], scale: 0.85 },
      back: { bone: 'Torso', offset: [0, 0.95, 0.1], rotation: [-Math.PI / 2, 0, 0], scale: 0.95 },
    },
    price: 20,
    signature: 'dash',
    freePowers: ['rainbowSlide', 'doubleJump'],
    emoteName: 'dance',
    cardColors: ['#ffe2c8', '#4a1f08'],
    face: { bone: 'Head', inIdle: true, eyeAt: [0.14, 1.2, 1.16], eyeR: 0.09, eyeYaw: 0.45, lid: '#f07a32', iris: '#2a160c' },
    springs: ['Tail1', 'Ear1.L', 'Ear1.R'],
    smooth: true,
  }),
  hero({
    id: 'alpaca',
    name: 'Fluff',
    backstory: 'Fluff’s wool is so springy that clouds ask her for bouncing tips.',
    modelUrl: 'assets/characters/alpaca.glb',
    scale: 0.37,
    height: 2.0,
    length: 1.6,
    anims: animalAnims(),
    emote: { clip: 'Dance', loop: true },
    attach: {
      head: { bone: 'Head', offset: [0, 2.0, 0.62], scale: 0.85 },
      face: { bone: 'Head', offset: [0, 1.8, 0.85], scale: 0.8 },
      back: { bone: 'Torso', offset: [0, 1.15, -0.1], rotation: [-Math.PI / 2, 0, 0], scale: 1.0 },
    },
    price: 30,
    signature: 'glide',
    freePowers: ['giant', 'bounceBall'],
    emoteName: 'dance',
    cardColors: ['#fbe6f6', '#3e1d36'],
    face: { bone: 'Head', inIdle: true, eyeAt: [0.14, 1.84, 0.79], eyeR: 0.085, eyeYaw: 0.5, lid: '#fff4fb', iris: '#2a160c' },
    springs: ['Tail1', 'Ear1.L', 'Ear1.R'],
    smooth: true,
  }),
  hero({
    id: 'trike',
    name: 'Trixie',
    backstory: 'Trixie has three horns and zero grumps. Her stomp makes the flowers dance.',
    modelUrl: 'assets/characters/trike.glb',
    scale: 0.16,
    height: 1.5,
    length: 3.25,
    anims: {
      idle: { clip: 'Idle', loop: true },
      walk: { clip: 'Walk', loop: true },
      run: { clip: 'Run', loop: true },
      jump: { clip: 'Jump', loop: false },
      fall: { clip: 'Fall', loop: true },
      flop: { clip: 'Flop', loop: false },
      dance: { clip: 'Dance', loop: true },
      wave: { clip: 'Wave', loop: true },
      cheer: { clip: 'Cheer', loop: false },
      sit: { clip: 'Sit', loop: false },
    },
    emote: { clip: 'Dance', loop: true },
    attach: {
      head: { bone: 'Head', offset: [0, 1.35, 0.9], scale: 1.0 },
      face: { bone: 'Head', offset: [0, 1.0, 1.35], scale: 0.9 },
      back: { bone: 'Torso', offset: [0, 1.25, -0.2], rotation: [-Math.PI / 2, 0, 0], scale: 1.1 },
    },
    price: 50,
    signature: 'groundPound',
    freePowers: ['rocketBoots', 'bubbleShield'],
    emoteName: 'dance',
    cardColors: ['#dcf6ef', '#20283f'],
    face: { bone: 'Head', inIdle: true, eyeAt: [0.22, 1.0, 1.15], eyeR: 0.1, eyeYaw: 0.5, lid: '#86d8c6', iris: '#2a160c' },
    smooth: true,
    springs: ['Tail1'],
  }),
];

export const CHARACTER_IDS: readonly CharacterId[] = CHARACTERS.map((c) => c.id);

export function getCharacter(id: CharacterId): CharacterDef {
  const c = CHARACTERS.find((x) => x.id === id);
  if (!c) throw new Error(`unknown character ${id}`);
  return c;
}

/** First-run hero for a new profile (owner's pick: Hopper the frog). Saved picks are kept. */
export const DEFAULT_CHARACTER: CharacterId = 'frog';
