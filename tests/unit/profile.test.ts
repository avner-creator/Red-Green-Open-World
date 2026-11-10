import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../src/events';
import { createProfile, sanitizeProfile, type ProfileStorage } from '../../src/profile';
import { createSession } from '../../src/session';
import { createSettings } from '../../src/settings';
import { PROFILE_KEY } from '../../src/config';
import type { EventBus, GameEvents } from '../../src/types';

function memStorage(init?: string): ProfileStorage & { mem: Map<string, string> } {
  const mem = new Map<string, string>();
  if (init !== undefined) mem.set(PROFILE_KEY, init);
  return { mem, getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
}

function record<K extends keyof GameEvents>(events: EventBus, type: K): GameEvents[K][] {
  const out: GameEvents[K][] = [];
  events.on(type, (e) => out.push(e));
  return out;
}

describe('profile', () => {
  it('earns and spends, refusing when too poor', () => {
    const events = createEventBus();
    const changes = record(events, 'wallet:changed');
    const p = createProfile(events, { storage: memStorage() });
    p.earn(7, 'gem');
    expect(p.wallet).toBe(7);
    expect(p.spend(5, 'shop')).toBe(true);
    expect(p.wallet).toBe(2);
    expect(p.spend(3, 'ticket')).toBe(false);
    expect(p.wallet).toBe(2);
    p.earn(0, 'gem');
    p.earn(-4, 'gem');
    expect(p.data.lifetimeGems).toBe(7);
    expect(changes).toEqual([
      { wallet: 7, delta: 7, reason: 'gem' },
      { wallet: 2, delta: -5, reason: 'shop' },
    ]);
  });

  it('unlocks once and equips', () => {
    const events = createEventBus();
    const unlocked = record(events, 'item:unlocked');
    const equipped = record(events, 'item:equipped');
    const p = createProfile(events, { storage: memStorage() });
    expect(p.unlock('hat-top', 'shop')).toBe(true);
    expect(p.unlock('hat-top', 'chest')).toBe(false);
    expect(unlocked).toEqual([{ itemId: 'hat-top', source: 'shop' }]);
    p.equip('head', 'hat-top');
    expect(p.equipped('head')).toBe('hat-top');
    p.equip('head', null);
    expect(p.equipped('head')).toBeNull();
    expect(equipped).toEqual([{ slot: 'head', itemId: 'hat-top' }, { slot: 'head', itemId: null }]);
  });

  it('persists every change and reloads it', () => {
    const storage = memStorage();
    const a = createProfile(createEventBus(), { storage });
    a.earn(12, 'gem');
    a.unlock('trail-spark', 'shop');
    a.equip('trail', 'trail-spark');
    a.noteCombo(3);
    a.noteCombo(2);
    a.noteSession();
    const b = createProfile(createEventBus(), { storage });
    expect(b.wallet).toBe(12);
    expect(b.owns('trail-spark')).toBe(true);
    expect(b.equipped('trail')).toBe('trail-spark');
    expect(b.data.bestCombo).toBe(3);
    expect(b.data.sessions).toBe(1);
  });

  it('reset wipes everything and emits the events', () => {
    const events = createEventBus();
    const storage = memStorage();
    const p = createProfile(events, { storage });
    p.earn(9, 'gem');
    p.unlock('cape-red', 'shop');
    p.equip('back', 'cape-red');
    const resets = record(events, 'profile:reset');
    const changes = record(events, 'wallet:changed');
    const equipped = record(events, 'item:equipped');
    p.reset();
    expect(p.wallet).toBe(0);
    expect(p.owns('cape-red')).toBe(false);
    expect(resets).toHaveLength(1);
    expect(changes).toEqual([{ wallet: 0, delta: -9, reason: 'test' }]);
    expect(equipped).toEqual([{ slot: 'back', itemId: null }]);
    expect(createProfile(createEventBus(), { storage }).wallet).toBe(0);
  });

  it('starts fresh from corrupt or invalid storage and cleans loaded data', () => {
    expect(createProfile(createEventBus(), { storage: memStorage('{not json') }).wallet).toBe(0);
    expect(createProfile(createEventBus(), { storage: memStorage('{"version":2,"wallet":50}') }).wallet).toBe(0);
    expect(createProfile(createEventBus(), { storage: memStorage('[1,2]') }).wallet).toBe(0);
    const clean = sanitizeProfile({
      version: 1, wallet: -3.5, lifetimeGems: 'x', owned: ['a', 'a', 4, ''], equipped: { head: 'a', nose: 'b', face: 7 },
      sessions: 2.9, bestCombo: Infinity, extra: true,
    });
    expect(clean).toEqual({ version: 1, wallet: 0, lifetimeGems: 0, owned: ['a'], equipped: { head: 'a' }, sessions: 2, bestCombo: 0 });
    expect(sanitizeProfile({ version: 1, wallet: 12.7 }).wallet).toBe(12);
  });

  it('keeps working in memory when storage throws', () => {
    const boom = (): never => {
      throw new Error('blocked');
    };
    const p = createProfile(createEventBus(), { storage: { getItem: boom, setItem: boom, removeItem: boom } });
    p.earn(4, 'gem');
    expect(p.spend(1, 'shop')).toBe(true);
    expect(p.wallet).toBe(3);
    expect(createProfile(createEventBus(), { storage: null }).wallet).toBe(0);
  });
});

describe('session economy counters', () => {
  it('counts earned, spent, combo, mega gems and missions, and resets on start', () => {
    const events = createEventBus();
    const session = createSession(events, createSettings(events, null));
    const p = createProfile(events, { storage: null });
    session.start();
    p.earn(10, 'gem');
    p.earn(5, 'test');
    p.spend(4, 'shop');
    events.emit('combo:changed', { multiplier: 3, streak: 6 });
    events.emit('combo:changed', { multiplier: 1, streak: 0 });
    const pos = { x: 0, y: 0, z: 0 } as GameEvents['gem:collected']['position'];
    events.emit('gem:collected', { id: 'a', count: 1, total: 10, position: pos, value: 5, mega: true, combo: 1, gain: 5 });
    events.emit('gem:collected', { id: 'b', count: 2, total: 10, position: pos });
    const m = { id: 'm', kind: 'collectGems' as const, icon: 'gem' as const, target: 5, reward: 3, progress: 5, done: true };
    events.emit('mission:completed', { index: 0, mission: m });
    p.reset();
    expect(session.state).toMatchObject({ earned: 10, spent: 4, bestCombo: 3, megaGems: 1, missionsDone: 1 });
    session.end();
    session.toTitle();
    session.start();
    expect(session.state).toMatchObject({ earned: 0, spent: 0, bestCombo: 0, megaGems: 0, missionsDone: 0 });
  });
});
