import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../src/config';
import { createEventBus } from '../../src/events';
import { createSettings } from '../../src/settings';
import { SETTINGS_KEY } from '../../src/config';
import { CHALLENGE } from '../../src/vision/challenge/constants';
import { createChallengeDriver } from '../../src/vision/challenge/driver';
import { IDENTITY_MODIFIERS, levelModifiers } from '../../src/vision/challenge/staircase';
import { IDENTITY_RUNTIME, compositePixel, deriveChannels, effectiveUniforms } from '../../src/vision/math';
import { compositeFragment } from '../../src/vision/shaders';
import type { ChallengeModifiers, EyeSettings, GameEvents } from '../../src/types';

const eye = (patch: Partial<EyeSettings> = {}): EyeSettings => ({ ...DEFAULT_SETTINGS.eye, ...patch });
const COMBOS: Array<Pick<EyeSettings, 'leftLens' | 'weakEye'>> = [
  { leftLens: 'red', weakEye: 'left' },
  { leftLens: 'red', weakEye: 'right' },
  { leftLens: 'green', weakEye: 'left' },
  { leftLens: 'green', weakEye: 'right' },
];
const BGS: Array<[number, number, number]> = [[0, 0, 0], [1, 1, 1], [0.5, 0.5, 0.5], [0.2, 0.7, 0.4], [0.9, 0.1, 0.6]];
const FULL = { L: 1, M: 1 };
const HALF = { L: 0.5, M: 0.6 };
const NONE = { L: 0, M: 0 };

describe('composite maths with runtime multipliers', () => {
  it('identity multipliers give exactly the old result', () => {
    for (const c of COMBOS) for (const e of [eye(c), eye({ ...c, weakStrength: 0.7, crosstalkLimit: 0.3, strongContrast: 0.6 })]) {
      for (const bg of BGS) for (const w of [NONE, HALF, FULL]) for (const s of [NONE, HALF, FULL]) {
        expect(compositePixel(bg, e, w, s, IDENTITY_RUNTIME)).toEqual(compositePixel(bg, e, w, s));
      }
      expect(effectiveUniforms(e)).toEqual({ strength: e.weakStrength, limit: e.crosstalkLimit, contrast: e.strongContrast, weakMul: 1, strongMul: 1 });
    }
  });
  it('weak multipliers change only the weak channel, strong fade only the strong channel', () => {
    for (const c of COMBOS) {
      const e = eye(c);
      const ch = deriveChannels(c);
      const wi = ch.weak === 'r' ? 0 : 1;
      const si = 1 - wi;
      for (const bg of BGS) {
        const base = compositePixel(bg, e, FULL, FULL);
        const weaker = compositePixel(bg, e, FULL, FULL, { ...IDENTITY_RUNTIME, weakScale: 0.58, weakFade: 0.5 });
        expect(weaker[si]).toBe(base[si]);
        expect(weaker[2]).toBe(bg[2]);
        expect(Math.abs(weaker[wi] - bg[wi])).toBeLessThan(Math.abs(base[wi] - bg[wi]));
        const sf = compositePixel(bg, e, FULL, FULL, { ...IDENTITY_RUNTIME, strongFade: 0.3 });
        expect(sf[wi]).toBe(base[wi]);
        expect(sf[2]).toBe(bg[2]);
        const off = compositePixel(bg, e, FULL, NONE, { ...IDENTITY_RUNTIME, weakFade: 0 });
        expect(off).toEqual(compositePixel(bg, e, NONE, NONE));
      }
    }
  });
  it('contrast change touches only the strong channel', () => {
    const e = eye();
    const a = compositePixel([0.2, 0.9, 0.3], e, HALF, NONE);
    const b = compositePixel([0.2, 0.9, 0.3], e, HALF, NONE, { ...IDENTITY_RUNTIME, strongScale: 0.7 });
    expect(b[0]).toBe(a[0]);
    expect(b[2]).toBe(a[2]);
    expect(b[1]).toBeLessThan(a[1]);
  });
  it('effective values stay within the calibrated limits', () => {
    for (const ws of [0, 0.5, 1]) for (const sc of [0.4, 0.45, 0.8, 1]) for (let l = 0; l <= CHALLENGE.maxLevel; l++) {
      const m = levelModifiers(l);
      const u = effectiveUniforms(eye({ weakStrength: ws, strongContrast: sc }), { weakFade: 1, strongFade: 1, weakScale: m.weakScale, strongScale: m.strongScale });
      expect(u.strength * u.weakMul).toBeLessThanOrEqual(ws);
      expect(u.contrast).toBeGreaterThanOrEqual(0.4);
      expect(u.contrast).toBeLessThanOrEqual(sc);
    }
  });
  it('shader uses the per-layer multipliers', () => {
    expect(compositeFragment).toContain('uniform float weakMul;');
    expect(compositeFragment).toContain('polarityBg(bgW, blurW), weakMul)');
    expect(compositeFragment).toContain('polarityBg(bgS, blurS), strongMul)');
  });
});

function memStorage(): { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void; raw(): string | null } {
  const mem = new Map<string, string>();
  return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k), raw: () => mem.get(SETTINGS_KEY) ?? null };
}

function setup(autoChallenge: boolean) {
  const events = createEventBus();
  const storage = memStorage();
  const settings = createSettings(events, storage);
  settings.set({ autoChallenge, eye: { weakStrength: 0.8 } });
  const driver = createChallengeDriver({ settings, events });
  const announced: ChallengeModifiers[] = [];
  events.on('glasses:challenge', (e) => announced.push({ ...e.modifiers }));
  const res = (hit: boolean, mechanic = 'glowflies'): void => events.emit('glasses:result', { mechanic, kind: 'follow', tier: 2, hit });
  const start = (): void => {
    events.emit('session:phase', { phase: 'playing', previous: 'title' });
    events.emit('session:tick', { remaining: 300, total: 300 });
  };
  const tick = (elapsed: number): void => events.emit('session:tick', { remaining: 300 - elapsed, total: 300 });
  return { events, storage, settings, driver, announced, res, start, tick };
}

const emit = <K extends keyof GameEvents>(t: ReturnType<typeof setup>, k: K, e: GameEvents[K]): void => t.events.emit(k, e);

describe('challenge driver', () => {
  it('off: results are tallied but the picture stays identity', () => {
    const t = setup(false);
    t.start();
    for (let i = 0; i < 9; i++) t.res(true);
    t.driver.update(10);
    expect(t.driver.modifiers()).toEqual(IDENTITY_MODIFIERS);
    expect(t.driver.summary().rows).toEqual([{ mechanic: 'glowflies', kind: 'follow', tier: 2, hits: 9, misses: 0 }]);
    expect(t.driver.summary().challenge.enabled).toBe(false);
    expect(t.announced).toEqual([]);
  });
  it('on: steps, eases, announces; never writes settings', () => {
    const t = setup(true);
    const before = t.storage.raw();
    t.start();
    t.announced.length = 0;
    for (let i = 0; i < 6; i++) t.res(true);
    expect(t.driver.target().level).toBe(2);
    expect(t.announced.map((m) => m.level)).toEqual([1, 2]);
    expect(t.driver.modifiers().weakScale).toBe(1); // not eased yet
    t.driver.update(0);
    expect(t.driver.modifiers().weakScale).toBe(1);
    t.driver.update(1);
    expect(t.driver.modifiers().weakScale).toBeLessThan(1);
    t.driver.update(10);
    expect(t.driver.modifiers()).toEqual(levelModifiers(2));
    t.res(false);
    expect(t.driver.target().level).toBe(1);
    expect(t.storage.raw()).toBe(before);
    expect(t.settings.get().eye.weakStrength).toBe(0.8);
  });
  it('drought counts playing time from ticks, ignores pauses and timer skips', () => {
    const t = setup(true);
    t.start();
    for (let i = 0; i < 3; i++) t.res(true);
    for (let s = 0.25; s <= 39.5; s += 0.25) t.tick(s);
    expect(t.driver.target().level).toBe(1);
    emit(t, 'session:phase', { phase: 'paused', previous: 'playing' });
    t.tick(100);
    emit(t, 'session:phase', { phase: 'playing', previous: 'paused' });
    t.tick(100.25);
    expect(t.driver.target().level).toBe(1);
    t.tick(200); // skip: at most 1 s
    expect(t.driver.target().level).toBe(0);
    expect(t.driver.summary().challenge.stepsDown).toBe(1);
    expect(t.driver.summary().seconds).toBe(200);
  });
  it('existing game events count as hits; only while playing', () => {
    const t = setup(true);
    emit(t, 'chest:key', { chestId: 'a' }); // still on the title screen
    t.start();
    emit(t, 'gem:collected', { id: 'g', count: 1, total: 9, position: null as never });
    emit(t, 'chest:key', { chestId: 'a' });
    emit(t, 'chest:opened', { chestId: 'a', outfitId: 'hat' });
    expect(t.driver.summary().rows).toEqual([
      { mechanic: 'gems', kind: 'find', tier: 1, hits: 1, misses: 0 },
      { mechanic: 'chestKeys', kind: 'find', tier: 1, hits: 1, misses: 0 },
      { mechanic: 'chests', kind: 'lineUp', tier: 1, hits: 1, misses: 0 },
    ]);
    expect(t.driver.target().level).toBe(1);
    emit(t, 'session:phase', { phase: 'ended', previous: 'playing' });
    t.res(true);
    t.res(true);
    t.res(true);
    expect(t.driver.target().level).toBe(1); // frozen once ended
    expect(t.driver.summary().rows.length).toBe(3); // kept after the end
  });
  it('a new session resets; turning the setting off returns to identity at once', () => {
    const t = setup(true);
    t.start();
    for (let i = 0; i < 9; i++) t.res(true);
    t.driver.update(100);
    expect(t.driver.modifiers().level).toBe(3);
    emit(t, 'session:phase', { phase: 'title', previous: 'playing' });
    t.start();
    expect(t.driver.modifiers()).toEqual(IDENTITY_MODIFIERS);
    expect(t.driver.summary()).toEqual({ rows: [], seconds: 0, challenge: { enabled: true, level: 0, maxLevel: 6, stepsUp: 0, stepsDown: 0 } });
    for (let i = 0; i < 6; i++) t.res(true);
    t.driver.update(100);
    t.settings.set({ autoChallenge: false });
    expect(t.driver.modifiers()).toEqual(IDENTITY_MODIFIERS);
    expect(t.driver.target()).toEqual(IDENTITY_MODIFIERS);
    expect(t.driver.summary().challenge.enabled).toBe(true); // it was on during this session
  });
  it('forced modifiers win until released', () => {
    const t = setup(false);
    t.driver.setForced({ weakScale: 0.5, level: 3 });
    expect(t.driver.modifiers().weakScale).toBe(0.5);
    expect(t.driver.modifiers().strongScale).toBeCloseTo(levelModifiers(3).strongScale);
    t.driver.update(1);
    expect(t.driver.modifiers().weakScale).toBe(0.5);
    t.driver.setForced(null);
    t.driver.update(0);
    expect(t.driver.modifiers()).toEqual(IDENTITY_MODIFIERS);
  });
});
