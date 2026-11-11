import { describe, expect, it } from 'vitest';
import { createEconomyRules } from '../../src/activities/economy/rules';
import { GEAR_CATALOG } from '../../src/activities/gear/catalog';
import { cheapestUnowned } from '../../src/activities/gear/gift';
import { GOOFY_ITEMS } from '../../src/activities/gear/goofy';
import { PROFILE_KEY } from '../../src/config';
import { createEventBus } from '../../src/events';
import { createProfile } from '../../src/profile';
import type { ShopItem } from '../../src/types';
import { badgeIds, dressTabs, tabItems, tabOf } from '../../src/ui/wardrobe/logic';

const item = (id: string, slot: ShopItem['slot'], price: number, extra: Partial<ShopItem> = {}): ShopItem => ({ id, slot, price, name: id, icon: 'hat', category: 'outfit', ...extra });

describe('dressing room logic', () => {
  it('has a picture tab for every gear slot, hats first', () => {
    const tabs = dressTabs(GEAR_CATALOG);
    expect(tabs[0]).toBe('head');
    expect(tabs).toEqual(expect.arrayContaining(['head', 'face', 'back', 'trail', 'paint', 'emote']));
    for (const it of GEAR_CATALOG) expect(tabs).toContain(tabOf(it));
  });

  it('lists worn first, then owned, then the rest cheapest first, chest-only last', () => {
    const cat = [item('a', 'head', 30), item('b', 'head', 5), item('c', 'head', 0, { chestOnly: true }), item('d', 'head', 0), item('e', 'head', 12), item('f', 'face', 1)];
    const owned = new Set(['d', 'e']);
    const list = tabItems(cat, 'head', (id) => owned.has(id), () => 'e').map((i) => i.id);
    expect(list).toEqual(['e', 'd', 'b', 'a', 'c']);
  });

  it('the "new!" badge: newly affordable or newly unlocked, until seen', () => {
    const cat = [item('cheap', 'head', 5), item('dear', 'head', 50), item('free', 'face', 0), item('gift', 'head', 3), item('chest', 'back', 0, { chestOnly: true })];
    const owned = new Set(['free', 'gift', 'chest']);
    const owns = (id: string): boolean => owned.has(id);
    expect(badgeIds(cat, owns, 10, new Set()).sort()).toEqual(['cheap', 'chest', 'gift']);
    expect(badgeIds(cat, owns, 10, new Set(['cheap', 'gift', 'chest']))).toEqual([]);
    expect(badgeIds(cat, owns, 0, new Set(['gift', 'chest']))).toEqual([]);
  });

  it('Fun Pass gifts pick the cheapest wearable not owned yet', () => {
    const cat = [item('t', 'trail', 1), item('h', 'head', 9), item('f', 'face', 4), item('x', 'back', 2, { chestOnly: true })];
    expect(cheapestUnowned(cat, () => false)?.id).toBe('f');
    expect(cheapestUnowned(cat, (id) => id === 'f')?.id).toBe('h');
    expect(cheapestUnowned(cat, () => true)).toBeNull();
  });
});

describe('profile migration with the goofy catalog', () => {
  it('an old saved profile keeps its wallet, items and worn outfit; the new free items are added', () => {
    const old = JSON.stringify({
      version: 1, wallet: 42, lifetimeGems: 120, owned: ['emote-wave', 'hat-propeller', 'hat-explorer'],
      equipped: { head: 'hat-propeller', emote: 'emote-wave' }, sessions: 3, bestCombo: 4,
    });
    const mem = new Map<string, string>([[PROFILE_KEY, old]]);
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    const events = createEventBus();
    const profile = createProfile(events, { storage });
    const eco = createEconomyRules(events, profile);
    eco.registerItems(GEAR_CATALOG);
    expect(profile.wallet).toBe(42);
    expect(profile.equipped('head')).toBe('hat-propeller');
    expect(profile.owns('hat-explorer')).toBe(true);
    const free = GOOFY_ITEMS.filter((i) => i.price === 0).map((i) => i.id);
    expect(free.length).toBeGreaterThanOrEqual(6);
    for (const id of free) expect(profile.owns(id)).toBe(true);
    // Saved again with the new items; reloading it gives the same profile.
    const again = createProfile(createEventBus(), { storage });
    for (const id of free) expect(again.owns(id)).toBe(true);
    expect(again.equipped('head')).toBe('hat-propeller');
  });
});
