/**
 * Economy rules (pure: no three.js, no DOM): catalog, buying, equipping and ride tickets.
 * Talks to the world only through the event bus and the profile, so it is unit-testable.
 */
import { ECONOMY } from '../../config';
import type {
  BuyResult, EconomyApi, EquipSlot, EventBus, MissionState, ProfileApi, ShopItem, TicketKind,
} from '../../types';

export interface EconomyRules extends EconomyApi {
  /** Advance timers (combo window, missions). */
  update(dt: number): void;
  dispose(): void;
}

/** Why a purchase can or cannot happen (no side effects). */
export function checkBuy(item: ShopItem | undefined, owned: boolean, wallet: number): BuyResult {
  if (!item) return 'unknown';
  if (owned) return 'owned';
  if (item.chestOnly) return 'notForSale';
  if (item.price > wallet) return 'tooPoor';
  return 'ok';
}

/** Price of the next ride, given how many balloon rides were already taken this session. */
export function ticketPriceFor(kind: TicketKind, balloonRidesThisSession: number): number {
  if (kind === 'balloon') return balloonRidesThisSession < ECONOMY.freeBalloonRides ? 0 : ECONOMY.balloonTicket;
  return ECONOMY.rocketPadTicket;
}

export function createEconomyRules(events: EventBus, profile: ProfileApi): EconomyRules {
  const items: ShopItem[] = [];
  const byId = new Map<string, ShopItem>();
  let balloonRides = 0;
  // TODO(activities-designer): missions and combo are filled in by the economy worker.
  const missions: MissionState[] = [];
  const combo = { multiplier: 1, streak: 0, timeLeft: 0 };

  const grantStarters = (): void => {
    for (const it of items) if (it.price === 0 && !it.chestOnly) profile.unlock(it.id, 'starter');
  };

  const offs = [
    events.on('session:phase', (e) => {
      if (e.phase === 'playing' && e.previous === 'title') balloonRides = 0;
    }),
    // A wiped profile owns nothing; the free starter items come straight back.
    events.on('profile:reset', grantStarters),
  ];

  return {
    get catalog() {
      return items;
    },
    item(id) {
      return byId.get(id);
    },
    registerItems(list) {
      for (const it of list) {
        if (byId.has(it.id)) continue;
        byId.set(it.id, it);
        items.push(it);
        if (it.price === 0 && !it.chestOnly) profile.unlock(it.id, 'starter');
      }
    },
    buy(itemId) {
      const it = byId.get(itemId);
      const result = checkBuy(it, profile.owns(itemId), profile.wallet);
      if (result !== 'ok' || !it) return result;
      if (!profile.spend(it.price, 'shop')) return 'tooPoor';
      profile.unlock(it.id, 'shop');
      profile.equip(it.slot, it.id);
      events.emit('shop:purchased', { itemId: it.id, price: it.price });
      return 'ok';
    },
    equip(slot: EquipSlot, itemId) {
      if (itemId === null) {
        profile.equip(slot, null);
        return true;
      }
      const it = byId.get(itemId);
      if (!it || it.slot !== slot || !profile.owns(itemId)) return false;
      profile.equip(slot, itemId);
      return true;
    },
    ticketPrice(kind) {
      return ticketPriceFor(kind, balloonRides);
    },
    payTicket(kind) {
      const price = ticketPriceFor(kind, balloonRides);
      if (price > 0 && !profile.spend(price, 'ticket')) {
        events.emit('ticket:denied', { kind, price, wallet: profile.wallet });
        return false;
      }
      if (kind === 'balloon') balloonRides += 1;
      events.emit('ticket:paid', { kind, price, free: price === 0 });
      return true;
    },
    get missions() {
      return missions;
    },
    get combo() {
      return combo;
    },
    update() {
      // TODO(activities-designer): combo window countdown and mission progress.
    },
    dispose() {
      for (const off of offs) off();
    },
  };
}
