import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../src/events';
import { createProfile } from '../../src/profile';
import { checkBuy, createEconomyRules, ticketPriceFor } from '../../src/activities/economy/rules';
import { ECONOMY } from '../../src/config';
import type { EventBus, GameEvents, ShopItem } from '../../src/types';

const ITEMS: ShopItem[] = [
  { id: 'hat-none', category: 'outfit', slot: 'head', name: 'Cap', icon: 'hat', price: 0 },
  { id: 'hat-top', category: 'outfit', slot: 'head', name: 'Top hat', icon: 'hat', price: 10 },
  { id: 'trail-spark', category: 'trail', slot: 'trail', name: 'Spark', icon: 'trail', price: 25, swatch: '#ffd34d' },
  { id: 'cape-gold', category: 'outfit', slot: 'back', name: 'Gold cape', icon: 'cape', price: 0, chestOnly: true },
];

function setup(wallet = 0) {
  const events = createEventBus();
  const profile = createProfile(events, { storage: null });
  if (wallet > 0) profile.earn(wallet, 'test');
  const eco = createEconomyRules(events, profile);
  eco.registerItems(ITEMS);
  return { events, profile, eco };
}

function record<K extends keyof GameEvents>(events: EventBus, type: K): GameEvents[K][] {
  const out: GameEvents[K][] = [];
  events.on(type, (e) => out.push(e));
  return out;
}

describe('pure helpers', () => {
  it('checkBuy covers every result', () => {
    expect(checkBuy(undefined, false, 99)).toBe('unknown');
    expect(checkBuy(ITEMS[1], true, 99)).toBe('owned');
    expect(checkBuy(ITEMS[3], false, 99)).toBe('notForSale');
    expect(checkBuy(ITEMS[1], false, 9)).toBe('tooPoor');
    expect(checkBuy(ITEMS[1], false, 10)).toBe('ok');
  });
  it('ticket prices come from ECONOMY', () => {
    expect(ticketPriceFor('balloon', 0)).toBe(0);
    expect(ticketPriceFor('balloon', ECONOMY.freeBalloonRides)).toBe(ECONOMY.balloonTicket);
    expect(ticketPriceFor('rocketPad', 0)).toBe(ECONOMY.rocketPadTicket);
  });
});

describe('catalog', () => {
  it('registers in order, ignores duplicates, grants starter items', () => {
    const { eco, profile } = setup();
    eco.registerItems([{ ...ITEMS[1], price: 99 }]);
    expect(eco.catalog.map((i) => i.id)).toEqual(ITEMS.map((i) => i.id));
    expect(eco.item('hat-top')?.price).toBe(10);
    expect(eco.item('nope')).toBeUndefined();
    expect(profile.owns('hat-none')).toBe(true);
    expect(profile.owns('cape-gold')).toBe(false);
  });
  it('gives starter items back after a profile reset', () => {
    const { profile } = setup();
    profile.reset();
    expect(profile.owns('hat-none')).toBe(true);
  });
});

describe('buy and equip', () => {
  it('buys: pays, unlocks, equips, emits', () => {
    const { eco, profile, events } = setup(30);
    const bought = record(events, 'shop:purchased');
    const unlocked = record(events, 'item:unlocked');
    expect(eco.buy('hat-top')).toBe('ok');
    expect(profile.wallet).toBe(20);
    expect(profile.owns('hat-top')).toBe(true);
    expect(profile.equipped('head')).toBe('hat-top');
    expect(bought).toEqual([{ itemId: 'hat-top', price: 10 }]);
    expect(unlocked).toEqual([{ itemId: 'hat-top', source: 'shop' }]);
    expect(eco.buy('hat-top')).toBe('owned');
    expect(eco.buy('cape-gold')).toBe('notForSale');
    expect(eco.buy('trail-spark')).toBe('tooPoor');
    expect(eco.buy('ghost')).toBe('unknown');
    expect(profile.wallet).toBe(20);
    expect(bought).toHaveLength(1);
  });
  it('equips only owned items in their own slot, or null', () => {
    const { eco, profile } = setup();
    expect(eco.equip('head', 'hat-top')).toBe(false);
    expect(eco.equip('back', 'hat-none')).toBe(false);
    expect(eco.equip('head', 'ghost')).toBe(false);
    expect(eco.equip('head', 'hat-none')).toBe(true);
    expect(profile.equipped('head')).toBe('hat-none');
    expect(eco.equip('head', null)).toBe(true);
    expect(profile.equipped('head')).toBeNull();
  });
});

describe('tickets', () => {
  it('first balloon ride per session is free, then paid, denied when poor; resets on a new session', () => {
    const { eco, profile, events } = setup(6);
    const paid = record(events, 'ticket:paid');
    const denied = record(events, 'ticket:denied');
    expect(eco.ticketPrice('balloon')).toBe(0);
    expect(eco.payTicket('balloon')).toBe(true);
    expect(eco.ticketPrice('balloon')).toBe(ECONOMY.balloonTicket);
    expect(eco.payTicket('balloon')).toBe(true);
    expect(profile.wallet).toBe(1);
    expect(eco.payTicket('balloon')).toBe(false);
    expect(eco.payTicket('rocketPad')).toBe(false);
    expect(profile.wallet).toBe(1);
    expect(paid).toEqual([
      { kind: 'balloon', price: 0, free: true },
      { kind: 'balloon', price: ECONOMY.balloonTicket, free: false },
    ]);
    expect(denied).toEqual([
      { kind: 'balloon', price: ECONOMY.balloonTicket, wallet: 1 },
      { kind: 'rocketPad', price: ECONOMY.rocketPadTicket, wallet: 1 },
    ]);
    events.emit('session:phase', { phase: 'paused', previous: 'playing' });
    events.emit('session:phase', { phase: 'playing', previous: 'paused' });
    expect(eco.ticketPrice('balloon')).toBe(ECONOMY.balloonTicket);
    events.emit('session:phase', { phase: 'playing', previous: 'title' });
    expect(eco.ticketPrice('balloon')).toBe(0);
  });
  it('missions and combo start empty (TODO stubs)', () => {
    const { eco } = setup();
    expect(eco.missions).toEqual([]);
    expect(eco.combo).toEqual({ multiplier: 1, streak: 0, timeLeft: 0 });
  });
});
