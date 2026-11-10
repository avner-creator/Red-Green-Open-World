/** Key caps, gamepad glyphs and id -> icon mappings. */
import type { IconName, StuntKind } from '../types';
import { h } from './dom';

/** Gamepad button labels shown in prompts (standard mapping). Change here if core remaps. */
export const GAMEPAD_GLYPH = { use: 'X', jump: 'A', sprint: 'RB' } as const;

export const STUNT_ICON: Record<StuntKind, IconName> = {
  bigBounce: 'trampoline',
  longGlide: 'parachute',
  bullseye: 'star',
  bigAir: 'balloon',
  bungee: 'bungee',
  launch: 'rocket',
};

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
