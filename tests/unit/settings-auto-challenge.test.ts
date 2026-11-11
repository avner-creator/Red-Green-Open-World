import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../src/events';
import { createSettings, sanitizeSettings } from '../../src/settings';
import { DEFAULT_SETTINGS, SETTINGS_KEY } from '../../src/config';
import type { DeepPartial, GameSettings } from '../../src/types';

function memStorage(): { mem: Map<string, string>; getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void } {
  const mem = new Map<string, string>();
  return { mem, getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) };
}

describe('settings: autoChallenge', () => {
  it('is kept, saved and survives a reload', () => {
    const storage = memStorage();
    const a = createSettings(createEventBus(), storage);
    a.set({ autoChallenge: true });
    expect(a.get().autoChallenge).toBe(true);
    expect(JSON.parse(storage.mem.get(SETTINGS_KEY) ?? '{}')).toMatchObject({ autoChallenge: true });
    expect(createSettings(createEventBus(), storage).get().autoChallenge).toBe(true);
  });

  it('ignores a non-boolean value', () => {
    const s = sanitizeSettings({ autoChallenge: 'yes' } as unknown as DeepPartial<GameSettings>);
    expect('autoChallenge' in s).toBe(false);
    const a = createSettings(createEventBus(), memStorage());
    a.set({ autoChallenge: true });
    a.set({ autoChallenge: 1 } as unknown as DeepPartial<GameSettings>);
    expect(a.get().autoChallenge).toBe(true);
  });

  it('is kept by later eye changes and cleared by reset', () => {
    const storage = memStorage();
    const a = createSettings(createEventBus(), storage);
    a.set({ autoChallenge: true });
    a.set({ eye: { weakEye: 'right' } });
    expect(a.get().autoChallenge).toBe(true);
    expect(a.get().eye.weakEye).toBe('right');
    a.reset();
    expect(a.get().autoChallenge).toBeUndefined();
    expect(createSettings(createEventBus(), storage).get().autoChallenge).toBeUndefined();
  });

  it('leaves the default shape unchanged', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect('autoChallenge' in sanitizeSettings(undefined)).toBe(false);
  });
});
