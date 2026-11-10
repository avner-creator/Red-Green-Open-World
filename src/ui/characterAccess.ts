/**
 * Who owns which character, and whether one can be bought. The select screen only talks to this
 * small interface; the economy code plugs the real wallet in with `setCharacterAccess`.
 */
import { CHARACTERS } from '../core/characters/catalog';

export interface CharacterAccess {
  /** Can this character be played right now? */
  owns(id: string): boolean;
  /** Is it locked, and is there enough in the wallet to buy it? */
  canAfford(id: string): boolean;
  /** Buy it (spends gems). Returns true when it is now owned. */
  buy(id: string): boolean;
  /** Gems in the wallet. */
  wallet(): number;
}

/** Owns only the free characters, cannot buy, wallet 0. */
export const defaultCharacterAccess: CharacterAccess = {
  owns: (id) => CHARACTERS.some((c) => c.id === id && c.price <= 0),
  canAfford: () => false,
  buy: () => false,
  wallet: () => 0,
};

let current: CharacterAccess = defaultCharacterAccess;

export function setCharacterAccess(a: CharacterAccess): void {
  current = a;
}

export function getCharacterAccess(): CharacterAccess {
  return current;
}
