/** The wardrobe's hero tab and the hero select read one roster: same heroes, same prices. */
import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../src/core/characters/catalog';
import { CHARACTER_ITEMS } from '../../src/activities/economy/characters';
import { tabItems, tabOf } from '../../src/ui/wardrobe/logic';

describe('hero roster: one source of truth', () => {
  it('every hero is a wardrobe "hero" item with the hero-select price', () => {
    expect(CHARACTER_ITEMS.map((i) => i.id)).toEqual(CHARACTERS.map((c) => c.id));
    for (const c of CHARACTERS) {
      const it = CHARACTER_ITEMS.find((i) => i.id === c.id)!;
      expect(tabOf(it), c.id).toBe('hero');
      expect(it.price, c.id).toBe(Math.max(0, c.price));
    }
    const shown = tabItems(CHARACTER_ITEMS, 'hero', () => false, () => null).map((i) => i.id);
    expect(new Set(shown)).toEqual(new Set(CHARACTERS.map((c) => c.id)));
  });

  it('includes the four new heroes and at least five free ones', () => {
    for (const id of ['pup', 'fox', 'alpaca', 'trike']) expect(CHARACTERS.some((c) => c.id === id), id).toBe(true);
    expect(CHARACTERS.filter((c) => c.price <= 0).length).toBeGreaterThanOrEqual(5);
  });
});
