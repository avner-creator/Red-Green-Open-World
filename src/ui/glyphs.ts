/** Key caps, gamepad glyphs and id -> icon mappings. */
import type { IconName, StuntKind } from '../types';
import { padLabel } from './controlMap';
import { h } from './dom';

/** Gamepad labels for prompts; derived from the one control table (controlMap.ts). */
export const GAMEPAD_GLYPH = { use: padLabel('use'), jump: padLabel('jump'), sprint: padLabel('sprint') };

export const STUNT_ICON: Record<StuntKind, IconName> = {
  bigBounce: 'trampoline',
  longGlide: 'parachute',
  bullseye: 'star',
  bigAir: 'balloon',
  bungee: 'bungee',
  launch: 'rocket',
  carnival: 'tent',
  scoops: 'cone',
  race: 'flag',
  sky: 'plane',
  bumper: 'bubble',
  foam: 'bubble',
};

/** Icon for a stunt kind; a kind this build does not know yet gets the star (never undefined). */
export function stuntIcon(kind: string): IconName {
  return (STUNT_ICON as Record<string, IconName | undefined>)[kind] ?? 'star';
}

/** Best guess of an outfit's icon from its id (the UI only receives ids). */
export function outfitIcon(id: string): IconName {
  const s = id.toLowerCase();
  if (/cape|back|wing|pack/.test(s)) return 'cape';
  if (/hat|cap|helmet|crown|head/.test(s)) return 'hat';
  if (/glass|face|mask|shade/.test(s)) return 'glasses';
  if (/car|horse|color|paint/.test(s)) return 'paint';
  return 'star';
}

export function cap(label: string, extra = ''): HTMLElement {
  return h('span', `cap ${extra}`.trim(), {}, label);
}

export function padButton(label: string, extra = ''): HTMLElement {
  return h('span', `gp ${label.length > 1 ? 'pill2' : ''} ${extra}`.trim(), {}, label);
}

/** "Use" prompt key: E on keyboard, X on gamepad. */
export function useKey(gamepad: boolean): HTMLElement {
  return gamepad ? padButton(GAMEPAD_GLYPH.use) : cap('E');
}
