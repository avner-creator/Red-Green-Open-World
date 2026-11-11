/**
 * Wardrobe gifts, so the dress-up starts early and keeps coming:
 * - First-minute gift: the rubber-duck hat, on the first gem picked up (or after 25 s of play if
 *   no gem yet). It goes straight onto the hero's head (if the head is free) with the unlock moment.
 * - Fun Pass milestones: the 2nd and 5th different stamp of a session each give the cheapest
 *   wardrobe item not owned yet.
 * Gifts use `profile.unlock(id, 'chest')` (the HUD's unlock moment) and never cost gems.
 */
import type { GameContext, ShopItem } from '../../types';
import { GIFT_ITEM } from './goofy';

export const GIFT_DELAY = 25;
export const STAMP_GIFTS: readonly number[] = [2, 5];

/** Cheapest wearable for sale that is not owned (ties: catalog order). */
export function cheapestUnowned(catalog: readonly ShopItem[], owns: (id: string) => boolean): ShopItem | null {
  let best: ShopItem | null = null;
  for (const it of catalog) {
    if (owns(it.id) || it.chestOnly || it.price <= 0 || !(it.slot === 'head' || it.slot === 'face' || it.slot === 'back')) continue;
    if (!best || it.price < best.price) best = it;
  }
  return best;
}

export interface Gifts {
  update(dt: number): void;
  /** Off in test mode until a test switches them on (they would change other specs' worn items). */
  enable(on: boolean): void;
  dispose(): void;
}

export function createGifts(ctx: GameContext): Gifts {
  let on = !ctx.testMode;
  let played = 0;
  const stamps = new Set<string>();

  const give = (id: string): void => {
    if (!on) return;
    const it = ctx.economy.item(id);
    if (!it || ctx.profile.owns(id)) return;
    ctx.profile.unlock(id, 'chest');
    if (!ctx.profile.equipped(it.slot)) ctx.economy.equip(it.slot, id);
  };
  const firstGift = (): void => {
    if (!ctx.profile.owns(GIFT_ITEM)) give(GIFT_ITEM);
  };

  const offs = [
    ctx.events.on('gem:collected', firstGift),
    ctx.events.on('session:phase', (e) => {
      if (e.phase === 'playing' && e.previous !== 'paused') {
        played = 0;
        stamps.clear();
      }
    }),
    ctx.events.on('stamp:earned', (e) => {
      if (stamps.has(e.id)) return;
      stamps.add(e.id);
      if (!STAMP_GIFTS.includes(stamps.size)) return;
      const it = cheapestUnowned(ctx.economy.catalog, (id) => ctx.profile.owns(id));
      if (it) give(it.id);
    }),
  ];

  return {
    enable(v) {
      on = v;
    },
    update(dt) {
      if (!on || ctx.session.state.phase !== 'playing' || ctx.profile.owns(GIFT_ITEM)) return;
      played += dt;
      if (played >= GIFT_DELAY) firstGift();
    },
    dispose() {
      for (const off of offs) off();
    },
  };
}
