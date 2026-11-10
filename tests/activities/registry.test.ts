import { describe, expect, it } from 'vitest';
import { activityEntries } from '../../src/activities';

describe('activity registry (register.ts discovery)', () => {
  it('finds every attraction folder and keeps rides before pickups before dressing', () => {
    const names = activityEntries().map((e) => e.name);
    for (const n of ['thrills', 'skydive', 'bungee', 'silly', 'gems', 'chests', 'secrets', 'gear']) expect(names, n).toContain(n);
    const at = (n: string): number => names.indexOf(n);
    for (const ride of ['thrills', 'skydive', 'bungee', 'silly']) expect(at(ride), ride).toBeLessThan(at('gems'));
    expect(at('gems')).toBeLessThan(at('chests'));
    expect(at('chests')).toBeLessThan(at('secrets'));
    expect(names[names.length - 1]).toBe('gear');
  });

  it('sorts by order, then folder name; order defaults to 100', () => {
    const f = () => ({ update() {} });
    const names = activityEntries({
      './zeta/register.ts': { default: f, order: 50 },
      './alpha/register.ts': { default: f, order: 50 },
      './beta/register.ts': { default: f },
    }).map((e) => e.name);
    expect(names).toEqual(['thrills', 'alpha', 'zeta', 'beta', 'gems']);
  });
});
