/** Super power picks live in the profile's 'power' slot (migrated once from `rgow.powers.v1`). */
import { describe, expect, it } from 'vitest';
import { decodePowers, encodePowers } from '../../src/activities/economy/characters';
import { sanitizeProfile } from '../../src/profile';

describe('power picks in the profile', () => {
  it('round-trips per-hero picks and drops junk', () => {
    const all = { frog: 'bounceBall', robot: 'dash' };
    expect(decodePowers(encodePowers(all))).toEqual(all);
    expect(encodePowers({})).toBeNull();
    expect(encodePowers({ 'bad id': 'x', fox: 'giant' })).toBe('fox:giant');
    expect(decodePowers(null)).toEqual({});
    expect(decodePowers('frog:,:x,pup:zoom')).toEqual({ pup: 'zoom' });
  });

  it('the sanitizer keeps a valid power value (not an owned item) and rejects others', () => {
    const base = { version: 1, owned: ['frog'], wallet: 0 };
    expect(sanitizeProfile({ ...base, equipped: { power: 'frog:bounceBall,robot:dash' } }).equipped.power).toBe('frog:bounceBall,robot:dash');
    expect(sanitizeProfile({ ...base, equipped: { power: '<script>' } }).equipped.power).toBeUndefined();
    expect(sanitizeProfile({ ...base, equipped: { head: 'hat-not-owned' } }).equipped.head).toBeUndefined();
  });
});
