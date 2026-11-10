import { describe, expect, it } from 'vitest';
import { ComboTracker } from '../../src/activities/economy/combo';
import { createEventBus } from '../../src/events';
import { createProfile } from '../../src/profile';
import { createEconomyRules } from '../../src/activities/economy/rules';
import { ECONOMY } from '../../src/config';
import type { GameEvents } from '../../src/types';

describe('ComboTracker', () => {
  it('builds x1, x2 ... and caps at comboMax', () => {
    const c = new ComboTracker(3, 5);
    const seen = Array.from({ length: 7 }, () => c.hit());
    expect(seen).toEqual([1, 2, 3, 4, 5, 5, 5]);
    expect(c.state.streak).toBe(7);
  });

  it('keeps the streak alive inside the window and restarts the timer on each hit', () => {
    const c = new ComboTracker(3, 5);
    c.hit();
    expect(c.update(2.9)).toBe(false);
    expect(c.hit()).toBe(2);
    expect(c.state.timeLeft).toBe(3);
    expect(c.update(2.9)).toBe(false);
  });

  it('drops back to x1 when the window runs out (reported once)', () => {
    const c = new ComboTracker(3, 5);
    c.hit();
    c.hit();
    expect(c.update(3.1)).toBe(true);
    expect(c.state).toEqual({ multiplier: 1, streak: 0, timeLeft: 0 });
    expect(c.update(1)).toBe(false);
    expect(c.hit()).toBe(1);
  });
});

function setup() {
  const events = createEventBus();
  const profile = createProfile(events, { storage: null });
  const eco = createEconomyRules(events, profile);
  const combos: GameEvents['combo:changed'][] = [];
  events.on('combo:changed', (e) => combos.push(e));
  events.emit('session:phase', { phase: 'playing', previous: 'title' });
  return { events, profile, eco, combos };
}

describe('economy pickups', () => {
  it('pays value x combo into the wallet and emits combo:changed each step', () => {
    const { eco, profile, combos } = setup();
    expect(eco.recordPickup(1, false)).toEqual({ combo: 1, gain: 1 });
    expect(eco.recordPickup(1, false)).toEqual({ combo: 2, gain: 2 });
    expect(eco.recordPickup(ECONOMY.megaGemValue, true)).toEqual({ combo: 3, gain: 15 });
    expect(profile.wallet).toBe(18);
    expect(combos.map((c) => c.multiplier)).toEqual([1, 2, 3]);
    expect(profile.data.bestCombo).toBe(3);
    expect(eco.combo.multiplier).toBe(3);
    expect(eco.combo.timeLeft).toBe(ECONOMY.comboWindow);
  });

  it('emits the drop back to x1 and only counts down while playing', () => {
    const { eco, events, combos } = setup();
    eco.recordPickup(1, false);
    eco.recordPickup(1, false);
    events.emit('session:phase', { phase: 'paused', previous: 'playing' });
    eco.update(10);
    expect(eco.combo.multiplier).toBe(2);
    events.emit('session:phase', { phase: 'playing', previous: 'paused' });
    eco.update(ECONOMY.comboWindow + 0.1);
    expect(eco.combo.multiplier).toBe(1);
    expect(combos[combos.length - 1]).toEqual({ multiplier: 1, streak: 0 });
  });

  it('a new session resets the streak', () => {
    const { eco, events } = setup();
    eco.recordPickup(1, false);
    events.emit('session:phase', { phase: 'ended', previous: 'playing' });
    events.emit('session:phase', { phase: 'title', previous: 'ended' });
    events.emit('session:phase', { phase: 'playing', previous: 'title' });
    expect(eco.combo.streak).toBe(0);
  });
});
