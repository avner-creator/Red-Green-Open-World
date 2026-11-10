import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../../src/core/characters/catalog';
import { defaultCharacterAccess, getCharacterAccess, setCharacterAccess } from '../../src/ui/characterAccess';
import type { CharacterAccess } from '../../src/ui/characterAccess';
import { canStart, cardState, indexOfCharacter, preselectId, priceProgress, stepIndex, wrapIndex } from '../../src/ui/characterLogic';

describe('default character access', () => {
  it('owns only free characters and cannot buy', () => {
    for (const c of CHARACTERS) {
      expect(defaultCharacterAccess.owns(c.id)).toBe(c.price <= 0);
      expect(defaultCharacterAccess.canAfford(c.id)).toBe(false);
      expect(defaultCharacterAccess.buy(c.id)).toBe(false);
    }
    expect(defaultCharacterAccess.wallet()).toBe(0);
    expect(defaultCharacterAccess.owns('nobody')).toBe(false);
  });
  it('can be replaced', () => {
    const fake: CharacterAccess = { owns: () => true, canAfford: () => true, buy: () => true, wallet: () => 9 };
    setCharacterAccess(fake);
    expect(getCharacterAccess()).toBe(fake);
    setCharacterAccess(defaultCharacterAccess);
  });
});

describe('card state', () => {
  const rich: CharacterAccess = { owns: (id) => id === 'robot', canAfford: (id) => id === 'panda', buy: () => true, wallet: () => 30 };
  it('owned, buy or locked', () => {
    expect(cardState(rich, 'robot')).toBe('owned');
    expect(cardState(rich, 'panda')).toBe('buy');
    expect(cardState(rich, 'rex')).toBe('locked');
  });
  it('only owned characters can start', () => {
    expect(canStart(rich, 'robot')).toBe(true);
    expect(canStart(rich, 'panda')).toBe(false);
  });
  it('price progress is clamped', () => {
    expect(priceProgress(10, 40)).toBe(0.25);
    expect(priceProgress(90, 40)).toBe(1);
    expect(priceProgress(-3, 40)).toBe(0);
    expect(priceProgress(0, 0)).toBe(1);
  });
});

describe('carousel index maths', () => {
  it('wraps both ways', () => {
    expect(wrapIndex(6, 6)).toBe(0);
    expect(wrapIndex(-1, 6)).toBe(5);
    expect(wrapIndex(-13, 6)).toBe(5);
    expect(wrapIndex(3, 0)).toBe(0);
    expect(stepIndex(5, 1, 6)).toBe(0);
    expect(stepIndex(0, -1, 6)).toBe(5);
    expect(stepIndex(2, 1, 6)).toBe(3);
  });
  it('finds a character, falling back to the default', () => {
    expect(indexOfCharacter('frog')).toBe(CHARACTERS.findIndex((c) => c.id === 'frog'));
    expect(indexOfCharacter('???')).toBe(0);
    expect(indexOfCharacter(null)).toBe(0);
  });
  it('preselects the remembered pick only while owned', () => {
    expect(preselectId(defaultCharacterAccess, 'frog')).toBe('frog');
    expect(preselectId(defaultCharacterAccess, 'rex')).toBe('robot');
    expect(preselectId(defaultCharacterAccess, null)).toBe('robot');
  });
});
