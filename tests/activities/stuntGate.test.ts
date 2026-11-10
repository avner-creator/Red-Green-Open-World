import { describe, expect, it } from 'vitest';
import { StuntGate } from '../../src/activities/stuntGate';

function make() {
  const out: { name: string; stars?: number; value?: number }[] = [];
  const gate = new StuntGate((name, payload) => {
    const p = payload as { stars?: number; value?: number };
    out.push({ name, stars: p.stars, value: p.value });
  });
  return { gate, out };
}

describe('StuntGate', () => {
  it('emits the first stunt at once and merges the rest into one per second', () => {
    const { gate, out } = make();
    gate.stunt({ kind: 'bigAir', value: 1, stars: 1 });
    for (let i = 2; i <= 4; i++) gate.stunt({ kind: 'bigAir', value: i, stars: 1 });
    expect(out).toHaveLength(1);
    gate.update(0.5);
    expect(out).toHaveLength(1);
    gate.update(0.6);
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual({ name: 'stunt', stars: 3, value: 4 }); // no stars lost
  });

  it('never emits more than one toast per second', () => {
    const { gate, out } = make();
    let t = 0;
    for (let i = 0; i < 600; i++) {
      gate.stunt({ kind: 'bigAir', value: i, stars: 1 });
      gate.toast({ icon: 'lock' });
      gate.update(1 / 60);
      t += 1 / 60;
    }
    expect(out.length).toBeLessThanOrEqual(Math.ceil(t) + 1);
    expect(out.reduce((n, e) => n + (e.stars ?? 0), 0)).toBeGreaterThan(0);
  });

  it('drops a plain toast while one is fresh', () => {
    const { gate, out } = make();
    gate.toast({ icon: 'lock' });
    gate.toast({ icon: 'lock' });
    expect(out).toHaveLength(1);
    gate.update(1.1);
    gate.toast({ icon: 'lock' });
    expect(out).toHaveLength(2);
  });
});
