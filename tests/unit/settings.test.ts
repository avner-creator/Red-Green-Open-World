import { describe, expect, it } from 'vitest';
import { createEventBus } from '../../src/events';
import { createSettings, sanitizeSettings } from '../../src/settings';
import { createSession } from '../../src/session';
import { deriveChannels } from '../../src/vision';
import { DEFAULT_SETTINGS } from '../../src/config';

describe('settings', () => {
  it('clamps bad values', () => {
    const s = sanitizeSettings({ sessionMinutes: 99, eye: { strongContrast: 0, weakStrength: 7 } });
    expect(s.sessionMinutes).toBe(15);
    expect(s.eye.strongContrast).toBe(0.4);
    expect(s.eye.weakStrength).toBe(1);
  });
  it('persists and survives a broken storage', () => {
    const mem = new Map<string, string>();
    const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
    const a = createSettings(createEventBus(), storage);
    a.set({ eye: { weakEye: 'right' } });
    expect(createSettings(createEventBus(), storage).get().eye.weakEye).toBe('right');
    const broken = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    const b = createSettings(createEventBus(), broken);
    b.set({ quality: 'low' });
    expect(b.get().quality).toBe('low');
  });
});

describe('channels', () => {
  it('maps all four lens/eye combinations', () => {
    expect(deriveChannels({ ...DEFAULT_SETTINGS.eye, leftLens: 'red', weakEye: 'left' })).toEqual({ weak: 'r', strong: 'g' });
    expect(deriveChannels({ ...DEFAULT_SETTINGS.eye, leftLens: 'red', weakEye: 'right' })).toEqual({ weak: 'g', strong: 'r' });
    expect(deriveChannels({ ...DEFAULT_SETTINGS.eye, leftLens: 'green', weakEye: 'left' })).toEqual({ weak: 'g', strong: 'r' });
    expect(deriveChannels({ ...DEFAULT_SETTINGS.eye, leftLens: 'green', weakEye: 'right' })).toEqual({ weak: 'r', strong: 'g' });
  });
});

describe('session', () => {
  it('counts down and ends', () => {
    const events = createEventBus();
    const session = createSession(events, createSettings(events, null));
    session.start();
    expect(session.state.remaining).toBe(300);
    session.setRemaining(0.1);
    session.update(0.2);
    expect(session.state.phase).toBe('ended');
  });
});
