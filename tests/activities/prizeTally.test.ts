import { describe, expect, it } from 'vitest';
import { PrizeTally } from '../../src/activities/skyrides/prizeTally';
import type { EventBus, GameEvents } from '../../src/types';

function bus(): EventBus {
  const hs = new Map<string, ((e: unknown) => void)[]>();
  return {
    on(type, h) {
      const l = hs.get(type) ?? [];
      l.push(h as (e: unknown) => void);
      hs.set(type, l);
      return () => hs.set(type, (hs.get(type) ?? []).filter((x) => x !== h));
    },
    emit<K extends keyof GameEvents>(type: K, e: GameEvents[K]) {
      for (const h of hs.get(type) ?? []) h(e);
    },
  };
}

describe('result card = wallet change', () => {
  it('counts the prize plus the stamp prize and mission bonus that the round set off (QA: card +6, wallet +12)', () => {
    const b = bus();
    const t = new PrizeTally(b);
    b.emit('wallet:changed', { wallet: 7, delta: -3, reason: 'ticket' });
    t.start();
    let shown = 0;
    t.onChange((n) => (shown = n));
    b.emit('wallet:changed', { wallet: 13, delta: 6, reason: 'mission' });
    t.notePrize(6);
    b.emit('wallet:changed', { wallet: 18, delta: 5, reason: 'mission' });
    b.emit('wallet:changed', { wallet: 19, delta: 1, reason: 'gem' });
    expect(t.total).toBe(12);
    expect(shown).toBe(12);
    expect(t.prize).toBe(6);
    expect(t.bonus).toBe(6);
    t.stop();
    b.emit('wallet:changed', { wallet: 25, delta: 6, reason: 'gem' });
    expect(t.total).toBe(12);
  });
});
