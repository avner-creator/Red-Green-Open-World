/** Pure helpers for the character select (index maths, start rules, remembered pick). */
import { CHARACTERS, DEFAULT_CHARACTER } from '../core/characters/catalog';
import { CHARACTER_KEY } from '../config';
import type { CharacterAccess } from './characterAccess';

export { CHARACTER_KEY };

/** Wrap an index into 0..n-1 (n <= 0 gives 0). */
export function wrapIndex(i: number, n: number): number {
  return n <= 0 ? 0 : ((i % n) + n) % n;
}

/** Move `dir` steps (+1 / -1) around the lineup. */
export function stepIndex(i: number, dir: number, n: number): number {
  return wrapIndex(i + dir, n);
}

/** Index of an id in the lineup (the default character's index when unknown). */
export function indexOfCharacter(id: string | null | undefined): number {
  const i = CHARACTERS.findIndex((c) => c.id === id);
  return i >= 0 ? i : Math.max(0, CHARACTERS.findIndex((c) => c.id === DEFAULT_CHARACTER));
}

export type CardState = 'owned' | 'buy' | 'locked';

/** What the action area of a card shows: Go, a Get button, or the "find more gems" nudge. */
export function cardState(a: CharacterAccess, id: string): CardState {
  if (a.owns(id)) return 'owned';
  return a.canAfford(id) ? 'buy' : 'locked';
}

/** Only owned characters can start a session. */
export function canStart(a: CharacterAccess, id: string): boolean {
  return a.owns(id);
}

/** Fraction (0..1) of a locked character's price that the wallet covers. */
export function priceProgress(wallet: number, price: number): number {
  return price <= 0 ? 1 : Math.max(0, Math.min(1, wallet / price));
}

/** Where the remembered pick lives. The economy plugs in the saved profile (`equipped.character`). */
export interface PickStore {
  load(): string | null;
  save(id: string): void;
}

/** The old standalone key (`rgow.character.v1`): used only until the profile store is plugged in, and for migration. */
export const legacyPickStore: PickStore = {
  load() {
    try {
      return localStorage.getItem(CHARACTER_KEY);
    } catch {
      return null;
    }
  },
  save(id) {
    try {
      localStorage.setItem(CHARACTER_KEY, id);
    } catch {
      /* private mode or blocked storage: the pick just isn't remembered */
    }
  },
};

/** Forget the old standalone key (after migrating it into the profile). */
export function clearLegacyPick(): void {
  try {
    localStorage.removeItem(CHARACTER_KEY);
  } catch {
    /* ignore */
  }
}

let pickStore: PickStore = legacyPickStore;

/** Plug in the source of truth for the remembered pick (null = back to the old key). */
export function setPickStore(store: PickStore | null): void {
  pickStore = store ?? legacyPickStore;
}

export function loadPick(): string | null {
  const v = pickStore.load();
  return v && CHARACTERS.some((c) => c.id === v) ? v : null;
}

export function savePick(id: string): void {
  pickStore.save(id);
}

/** The character to preselect: the remembered one while still owned, else the default. */
export function preselectId(a: CharacterAccess, stored: string | null): string {
  return stored && a.owns(stored) ? stored : DEFAULT_CHARACTER;
}
