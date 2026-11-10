/**
 * Emote rules without three.js: what each emote does, when one may start, when it is cancelled.
 */
import type { InputState, PlayerAnim, PlayerMode, SfxName } from '../../types';
import type { EmoteKind } from './catalog';

export const EMOTE_SECONDS = 2;

export interface EmoteSpec {
  anim: PlayerAnim;
  sfx: SfxName;
  sfxPitch: number;
  sfxVolume: number;
  /** Confetti pieces in the puff. */
  puff: number;
}

export const EMOTES: Readonly<Record<EmoteKind, EmoteSpec>> = {
  wave: { anim: 'wave', sfx: 'gem', sfxPitch: 1.35, sfxVolume: 0.7, puff: 18 },
  dance: { anim: 'dance', sfx: 'star', sfxPitch: 0.95, sfxVolume: 0.8, puff: 36 },
  cheer: { anim: 'cheer', sfx: 'fanfare', sfxPitch: 1.0, sfxVolume: 0.55, puff: 44 },
};

export interface EmoteContext {
  phase: string;
  mode: PlayerMode;
  grounded: boolean;
  hasVehicle: boolean;
  menuOpen: boolean;
  /** Key presses must not start an emote while a menu is open; the `emote:play` event may. */
  fromKey: boolean;
}

export function canStartEmote(c: EmoteContext): boolean {
  if (c.phase !== 'playing') return false;
  if (c.mode !== 'walk' || c.hasVehicle || !c.grounded) return false;
  if (c.fromKey && c.menuOpen) return false;
  return true;
}

/** Any move or jump input hands control back right away. */
export function emoteCancelled(input: Pick<InputState, 'moveX' | 'moveY' | 'jump' | 'jumpPressed'>): boolean {
  return Math.abs(input.moveX) > 0.25 || Math.abs(input.moveY) > 0.25 || input.jump || input.jumpPressed;
}

/**
 * Shop emotes a character has no good clip for (it plays its signature emote instead).
 * Rex's `cheer` is its plain Jump clip, which looks like a stuck take-off on the ground.
 */
const NO_CLIP: Readonly<Record<string, readonly EmoteKind[]>> = {
  rex: ['cheer'],
};

/** Animation to play for a shop emote on this character, or null to use its signature emote. */
export function emoteAnimFor(characterId: string, kind: EmoteKind): PlayerAnim | null {
  if (NO_CLIP[characterId]?.includes(kind)) return null;
  return EMOTES[kind].anim;
}
