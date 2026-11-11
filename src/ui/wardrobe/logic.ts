/** Pure helpers for the dressing room: tabs, tile states, the HUD "new!" badge. No DOM. */
import type { EquipSlot, ShopItem } from '../../types';
import type { UiIconName } from '../icons';

/** Dressing-room tabs, in order. A tab is a slot ('paint' = the buggy paint). */
export type DressTab = 'head' | 'face' | 'back' | 'trail' | 'paint' | 'emote' | 'hero' | 'other';
export const DRESS_TABS: readonly DressTab[] = ['head', 'face', 'back', 'trail', 'paint', 'emote', 'hero', 'other'];

export const TAB_ICON: Record<DressTab, UiIconName> = {
  head: 'hat',
  face: 'glasses',
  back: 'cape',
  trail: 'trail',
  paint: 'car',
  emote: 'emote',
  hero: 'character',
  other: 'sparkle',
};

export function tabOf(it: ShopItem): DressTab {
  switch (it.slot) {
    case 'head':
    case 'face':
    case 'back':
    case 'trail':
    case 'emote':
      return it.slot;
    case 'carColor':
      return 'paint';
    case 'character':
      return 'hero';
    default:
      return 'other';
  }
}

/** Items the dressing room shows (all of them: heroes have a tab too, and their own screen). */
export const dressable = (it: ShopItem): boolean => !!it.id;

/** Tabs that have at least one item, in order. */
export function dressTabs(catalog: readonly ShopItem[]): DressTab[] {
  const have = new Set(catalog.filter(dressable).map(tabOf));
  return DRESS_TABS.filter((t) => have.has(t));
}

/**
 * Items of a tab: owned first (worn first of all), then the rest by price, so the things a child
 * can wear right now and the next ones to save for are on top.
 */
export function tabItems(catalog: readonly ShopItem[], tab: DressTab, owns: (id: string) => boolean, worn: (slot: EquipSlot) => string | null): ShopItem[] {
  const list = catalog.filter((i) => dressable(i) && tabOf(i) === tab);
  const rank = (i: ShopItem): number => (worn(i.slot) === i.id ? 0 : owns(i.id) ? 1 : i.chestOnly ? 3 : 2);
  return list
    .map((it, n) => ({ it, n }))
    .sort((a, b) => rank(a.it) - rank(b.it) || (rank(a.it) === 2 ? a.it.price - b.it.price : 0) || a.n - b.n)
    .map((x) => x.it);
}

/**
 * The HUD wardrobe button's "new!" badge: something is newly affordable (not owned, for sale,
 * price ≤ wallet) or newly unlocked, and the child has not opened the dressing room since.
 */
export function badgeIds(catalog: readonly ShopItem[], owns: (id: string) => boolean, wallet: number, seen: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const it of catalog) {
    if (!dressable(it) || seen.has(it.id)) continue;
    const affordable = !owns(it.id) && !it.chestOnly && it.price > 0 && it.price <= wallet;
    const fresh = owns(it.id) && (it.price > 0 || !!it.chestOnly);
    if (affordable || fresh) out.push(it.id);
  }
  return out;
}
