import { describe, expect, it } from 'vitest';
import type { ShopItem } from '../../src/types';
import {
  cardState, comboFraction, deltaText, missingGems, missionFraction, missionText, popKindFor, rollToward, shopCategories, wardrobeGroups,
} from '../../src/ui/econ';
import { ALL_ICON_NAMES, iconSvg } from '../../src/ui/icons';

const item = (id: string, category: ShopItem['category'], slot: ShopItem['slot'], price: number, chestOnly = false): ShopItem => ({
  id, category, slot, name: id, icon: 'hat', price, chestOnly,
});

describe('economy ui helpers', () => {
  it('formats wallet deltas with a real minus sign', () => {
    expect(deltaText(5)).toBe('+5');
    expect(deltaText(-3)).toBe('−3');
    expect(deltaText(0)).toBe('0');
  });

  it('rolls a counter toward its target without overshooting', () => {
    let v = 0;
    let frames = 0;
    while (v !== 100 && frames < 200) {
      const next = rollToward(v, 100, 1 / 60);
      expect(next).toBeGreaterThan(v);
      expect(next).toBeLessThanOrEqual(100);
      v = next;
      frames++;
    }
    expect(v).toBe(100);
    expect(frames).toBeLessThan(60);
    expect(rollToward(10, 7, 1 / 60)).toBeLessThan(10);
    expect(rollToward(7, 7, 1 / 60)).toBe(7);
  });

  it('combo ring and mission fractions are clamped', () => {
    expect(comboFraction(1.5, 3)).toBe(0.5);
    expect(comboFraction(9, 3)).toBe(1);
    expect(comboFraction(-1, 3)).toBe(0);
    expect(comboFraction(1, 0)).toBe(0);
    expect(missionFraction(15, 10)).toBe(1);
    expect(missionFraction(5, 0)).toBe(0);
  });

  it('mission text shows progress/target, metres for heights', () => {
    expect(missionText('collectGems', 3.7, 10)).toBe('3/10');
    expect(missionText('collectGems', 14, 10)).toBe('10/10');
    expect(missionText('bounceHeight', 12.4, 30)).toBe('12/30m');
  });

  it('card states: equipped, owned, buy, poor, chest', () => {
    const hat = item('hat', 'outfit', 'head', 10);
    expect(cardState(hat, true, 'hat', 0)).toBe('equipped');
    expect(cardState(hat, true, null, 0)).toBe('owned');
    expect(cardState(hat, false, null, 10)).toBe('buy');
    expect(cardState(hat, false, null, 9)).toBe('poor');
    expect(cardState(item('c', 'outfit', 'face', 0, true), false, null, 99)).toBe('chest');
    expect(missingGems(10, 4)).toBe(6);
    expect(missingGems(10, 40)).toBe(0);
  });

  it('only categories with items get a tab, in a fixed order', () => {
    const cat = [item('t', 'trail', 'trail', 5), item('h', 'outfit', 'head', 5), item('e', 'emote', 'emote', 0)];
    expect(shopCategories(cat)).toEqual(['outfit', 'trail', 'emote']);
    expect(shopCategories([])).toEqual([]);
  });

  it('wardrobe groups owned items by slot', () => {
    const cat = [item('h1', 'outfit', 'head', 5), item('h2', 'outfit', 'head', 5), item('p', 'paint', 'carColor', 5), item('t', 'trail', 'trail', 5)];
    const owned = new Set(['h2', 'p', 'h1']);
    const g = wardrobeGroups(cat, (id) => owned.has(id));
    expect(g.map((x) => x.slot)).toEqual(['head', 'carColor']);
    expect(g[0]!.items.map((i) => i.id)).toEqual(['h1', 'h2']);
  });

  it('pop kinds follow the wallet reason', () => {
    expect(popKindFor('gem', 1, false)).toBe('gem');
    expect(popKindFor('gem', 5, true)).toBe('mega');
    expect(popKindFor('mission', 5, false)).toBe('bonus');
    expect(popKindFor('jackpot', 15, false)).toBe('jackpot');
    expect(popKindFor('ticket', -5, false)).toBe('ticket');
    expect(popKindFor('shop', -12, false)).toBe('shop');
    expect(popKindFor('test', -3, false)).toBe('plain');
  });

  it('every economy icon is a real drawing', () => {
    for (const n of ['megaGem', 'combo', 'shop', 'ticket', 'mission', 'trail', 'emote', 'backpack', 'character', 'jackpot', 'wallet'] as const) {
      expect(ALL_ICON_NAMES).toContain(n);
      expect(iconSvg(n).length).toBeGreaterThan(200);
    }
  });
});
