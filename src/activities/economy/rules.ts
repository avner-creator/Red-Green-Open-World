/**
 * Economy rules (pure: no three.js, no DOM): catalog, buying, equipping and ride tickets.
 * Talks to the world only through the event bus and the profile, so it is unit-testable.
 */
import { ECONOMY } from '../../config';
import type {
  BuyResult, EconomyApi, EquipSlot, EventBus, PlayerMode, ProfileApi, SessionPhase, SfxName, ShopItem, TicketKind,
} from '../../types';
import { ComboTracker } from './combo';
import { MissionTracker, mulberry32, pickMissions, type MissionEvent } from './missions';

export interface EconomyRules extends EconomyApi, GemPickupSink {
  /** Advance timers (combo window, missions). */
  update(dt: number): void;
  dispose(): void;
}

/** What the gem pickup code needs from the economy (found on `ctx.economy` by a type guard). */
export interface GemPickupSink {
  /** A gem of `value` was picked up: extends the combo, pays `value x combo` into the wallet. */
  recordPickup(value: number, mega: boolean): { combo: number; gain: number };
}

export function hasPickupSink(e: unknown): e is GemPickupSink {
  return typeof e === 'object' && e !== null && typeof (e as Partial<GemPickupSink>).recordPickup === 'function';
}

export interface EconomyOptions {
  /** Random source for the mission pick (seeded in test mode). */
  rand?: () => number;
  /** Sound hook (finished mission = 'star', jackpot = 'fanfare'). */
  play?: (name: SfxName) => void;
}

/** Why a purchase can or cannot happen (no side effects). */
export function checkBuy(item: ShopItem | undefined, owned: boolean, wallet: number): BuyResult {
  if (!item) return 'unknown';
  if (owned) return 'owned';
  if (item.chestOnly) return 'notForSale';
  if (item.price > wallet) return 'tooPoor';
  return 'ok';
}

/**
 * Price of the next ride, given how many rides of this kind were already taken this session
 * (balloon: the first `freeBalloonRides` are free; attractions: the first play is free).
 */
export function ticketPriceFor(kind: TicketKind, ridesThisSession: number): number {
  if (kind === 'balloon') return ridesThisSession < ECONOMY.freeBalloonRides ? 0 : ECONOMY.balloonTicket;
  if (kind === 'rocketPad') return ECONOMY.rocketPadTicket;
  return ridesThisSession < 1 ? 0 : ECONOMY.attractionTicket;
}

export function createEconomyRules(events: EventBus, profile: ProfileApi, opts: EconomyOptions = {}): EconomyRules {
  const items: ShopItem[] = [];
  const byId = new Map<string, ShopItem>();
  /** Rides of each kind this session (balloon and attractions). */
  const rides = new Map<TicketKind, number>();
  const ridesOf = (k: TicketKind): number => rides.get(k) ?? 0;
  const rand = opts.rand ?? mulberry32((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
  const comboTracker = new ComboTracker(ECONOMY.comboWindow, ECONOMY.comboMax);
  const tracker = new MissionTracker();
  let phase: SessionPhase = 'title';
  let mode: PlayerMode = 'walk';

  const note = (ev: MissionEvent): void => {
    for (const ch of tracker.note(ev)) {
      events.emit('mission:progress', { index: ch.index, mission: ch.mission });
      if (!ch.completed) continue;
      profile.earn(ch.mission.reward, 'mission');
      events.emit('mission:completed', { index: ch.index, mission: ch.mission });
      opts.play?.('star');
    }
    if (tracker.allDone && !jackpotPaid) {
      jackpotPaid = true;
      profile.earn(ECONOMY.jackpot, 'jackpot');
      events.emit('mission:jackpot', { reward: ECONOMY.jackpot });
      opts.play?.('fanfare');
    }
  };
  let jackpotPaid = false;

  const emitCombo = (): void => {
    events.emit('combo:changed', { multiplier: comboTracker.state.multiplier, streak: comboTracker.state.streak });
  };

  const grantStarters = (): void => {
    for (const it of items) if (it.price === 0 && !it.chestOnly) profile.unlock(it.id, 'starter');
  };

  const offs = [
    events.on('session:phase', (e) => {
      phase = e.phase;
      if (e.phase === 'playing' && e.previous === 'title') {
        rides.clear();
        comboTracker.reset();
        jackpotPaid = false;
        tracker.start(pickMissions(rand));
        for (let i = 0; i < tracker.missions.length; i++) {
          events.emit('mission:progress', { index: i, mission: { ...tracker.missions[i] } });
        }
      }
    }),
    events.on('player:mode', (e) => {
      mode = e.mode;
    }),
    events.on('gem:collected', (e) => note({ type: 'gem', mega: e.mega === true, driving: mode === 'driving' })),
    events.on('combo:changed', (e) => note({ type: 'combo', multiplier: e.multiplier })),
    events.on('chest:opened', () => note({ type: 'chest' })),
    events.on('stunt', (e) => {
      if (e.kind === 'bigBounce') note({ type: 'bounce', height: e.value });
      if (e.kind === 'bullseye') note({ type: 'ring' });
      if (e.stars > 0) note({ type: 'stars', amount: e.stars });
    }),
    // A wiped profile owns nothing; the free starter items come straight back.
    events.on('profile:reset', grantStarters),
  ];

  const rules: EconomyRules = {
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
      return ticketPriceFor(kind, ridesOf(kind));
    },
    payTicket(kind) {
      const price = ticketPriceFor(kind, ridesOf(kind));
      if (price > 0 && !profile.spend(price, 'ticket')) {
        events.emit('ticket:denied', { kind, price, wallet: profile.wallet });
        return false;
      }
      rides.set(kind, ridesOf(kind) + 1);
      events.emit('ticket:paid', { kind, price, free: price === 0 });
      return true;
    },
    rideTicket(kind) {
      const price = ticketPriceFor(kind, ridesOf(kind));
      // A child short of gems still plays: a practice round with no prize (never a locked gate).
      if (!rules.payTicket(kind)) return 'practice';
      return price === 0 ? 'free' : 'paid';
    },
    get missions() {
      return tracker.missions;
    },
    get combo() {
      return comboTracker.state;
    },
    recordPickup(value, mega) {
      const multiplier = comboTracker.hit();
      const gain = value * multiplier;
      profile.earn(gain, 'gem');
      profile.noteCombo(multiplier);
      emitCombo();
      void mega;
      return { combo: multiplier, gain };
    },
    update(dt) {
      if (phase !== 'playing') return;
      if (comboTracker.update(dt)) emitCombo();
    },
    dispose() {
      for (const off of offs) off();
    },
  };
  return rules;
}
