/** Pure helpers for the economy UI (wallet, combo, missions, shop cards). No DOM. */
import type { EquipSlot, IconName, MissionKind, ShopCategory, ShopItem, WalletReason } from '../types';

/** "+5" / "−3" (a real minus sign) / "0". */
export function deltaText(n: number): string {
  const v = Math.round(n);
  if (v > 0) return `+${v}`;
  if (v < 0) return `−${-v}`;
  return '0';
}

/**
 * Move a displayed counter toward its target so it "rolls": fast for big jumps, at least one
 * step per frame, never overshooting. Returns an integer.
 */
export function rollToward(shown: number, target: number, dt: number): number {
  const diff = target - shown;
  if (diff === 0) return target;
  const step = Math.max(1, Math.ceil(Math.abs(diff) * Math.min(1, dt * 9)));
  return Math.abs(diff) <= step ? target : shown + Math.sign(diff) * step;
}

/** Fraction (0..1) of the combo window left: drives the shrinking ring. */
export function comboFraction(timeLeft: number, window: number): number {
  if (!(window > 0) || !Number.isFinite(timeLeft)) return 0;
  return Math.min(1, Math.max(0, timeLeft / window));
}

/** Shop tab order (icon tabs). */
export const CATEGORY_ORDER: readonly ShopCategory[] = ['outfit', 'paint', 'trail', 'emote', 'character'];

export const CATEGORY_ICON: Record<ShopCategory, IconName> = {
  outfit: 'hat',
  paint: 'paint',
  trail: 'trail',
  emote: 'emote',
  character: 'character',
};

/** Wardrobe rows, in this order. */
export const SLOT_ORDER: readonly EquipSlot[] = ['character', 'head', 'back', 'face', 'carColor', 'horseColor', 'trail', 'emote'];

export const SLOT_ICON: Record<EquipSlot, IconName> = {
  character: 'character',
  head: 'hat',
  back: 'backpack',
  face: 'glasses',
  carColor: 'car',
  horseColor: 'horse',
  trail: 'trail',
  emote: 'emote',
};

/** Categories that have at least one item, in tab order (empty categories are hidden). */
export function shopCategories(catalog: readonly ShopItem[]): ShopCategory[] {
  const have = new Set(catalog.map((i) => i.category));
  return CATEGORY_ORDER.filter((c) => have.has(c));
}

/** Owned items grouped by slot (only slots that have something), in wardrobe order. */
export function wardrobeGroups(catalog: readonly ShopItem[], owns: (id: string) => boolean): { slot: EquipSlot; items: ShopItem[] }[] {
  const out: { slot: EquipSlot; items: ShopItem[] }[] = [];
  for (const slot of SLOT_ORDER) {
    const items = catalog.filter((i) => i.slot === slot && owns(i.id));
    if (items.length) out.push({ slot, items });
  }
  return out;
}

export type CardState = 'equipped' | 'owned' | 'buy' | 'poor' | 'chest';

/** What a shop card shows and what selecting it does. */
export function cardState(item: ShopItem, owned: boolean, equippedId: string | null, wallet: number): CardState {
  if (owned) return equippedId === item.id ? 'equipped' : 'owned';
  if (item.chestOnly) return 'chest';
  return item.price <= wallet ? 'buy' : 'poor';
}

/** Gems still missing to afford an item (0 when affordable). */
export function missingGems(price: number, wallet: number): number {
  return Math.max(0, Math.ceil(price - wallet));
}

/** Progress text for a mission card: "3/10", or "12/30m" for heights. */
export function missionText(kind: MissionKind, progress: number, target: number): string {
  const p = Math.max(0, Math.min(target, Math.floor(progress)));
  return kind === 'bounceHeight' ? `${p}/${target}m` : `${p}/${target}`;
}

export function missionFraction(progress: number, target: number): number {
  if (!(target > 0)) return 0;
  return Math.min(1, Math.max(0, progress / target));
}

export type PopKind = 'gem' | 'mega' | 'bonus' | 'jackpot' | 'ticket' | 'shop' | 'free' | 'plain';

/** How a wallet change is celebrated at the wallet counter. */
export function popKindFor(reason: WalletReason, delta: number, mega: boolean): PopKind {
  if (reason === 'gem') return mega ? 'mega' : 'gem';
  if (reason === 'mission') return 'bonus';
  if (reason === 'jackpot') return 'jackpot';
  if (reason === 'ticket') return 'ticket';
  if (reason === 'shop') return 'shop';
  return delta > 0 ? 'gem' : 'plain';
}
