import { describe, expect, it } from 'vitest';
import { landVolume, volumeToGain } from '../../src/audio/gain';
import { RateLimiter, StreakTracker, VoiceCounter } from '../../src/audio/limiter';
import {
  generateMelodyBar,
  mulberry32,
  noteFreq,
  PENTATONIC,
  scaleToMidi,
  streakPitch,
} from '../../src/audio/music-theory';
import { createAudio } from '../../src/audio';
import type { GameContext, GameEvents, SfxName } from '../../src/types';

describe('music theory', () => {
  it('maps midi to frequency', () => {
    expect(noteFreq(69)).toBeCloseTo(440, 6);
    expect(noteFreq(81)).toBeCloseTo(880, 6);
    expect(noteFreq(60)).toBeCloseTo(261.626, 2);
  });

  it('scaleToMidi handles negative indices and octaves', () => {
    expect(scaleToMidi(0, 60)).toBe(60);
    expect(scaleToMidi(5, 60)).toBe(72);
    expect(scaleToMidi(-1, 60)).toBe(57);
    expect(scaleToMidi(2, 60)).toBe(64);
  });

  it('seeded rng is deterministic and in range', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 50; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('melody stays pentatonic, sparse and deterministic', () => {
    const run = (seed: number) => {
      const rng = mulberry32(seed);
      let idx = 0;
      const all: number[] = [];
      for (let bar = 0; bar < 200; bar++) {
        const r = generateMelodyBar(rng, idx);
        idx = r.lastIndex;
        expect(r.notes.length).toBeLessThanOrEqual(4);
        for (const n of r.notes) {
          expect(PENTATONIC).toContain((((n.midi - 72) % 12) + 12) % 12);
          expect(n.step).toBeGreaterThanOrEqual(0);
          expect(n.step).toBeLessThanOrEqual(7);
          all.push(n.midi);
        }
      }
      return all;
    };
    expect(run(7)).toEqual(run(7));
    expect(run(7)).not.toEqual(run(8));
  });

  it('streak pitch rises and caps', () => {
    expect(streakPitch(0)).toBe(1);
    expect(streakPitch(1)).toBeGreaterThan(1);
    expect(streakPitch(50)).toBeCloseTo(streakPitch(7), 9);
  });
});

describe('limiter helpers', () => {
  it('rate limiter blocks identical sounds under the gap only', () => {
    const r = new RateLimiter(0.04);
    expect(r.allow('gem', 1)).toBe(true);
    expect(r.allow('gem', 1.02)).toBe(false);
    expect(r.allow('jump', 1.02)).toBe(true);
    expect(r.allow('gem', 1.05)).toBe(true);
  });

  it('voice counter caps polyphony and frees voices', () => {
    const v = new VoiceCounter(2);
    expect(v.tryAdd(0, 1)).toBe(true);
    expect(v.tryAdd(0, 2)).toBe(true);
    expect(v.tryAdd(0.5, 1)).toBe(false);
    expect(v.tryAdd(1.5, 1)).toBe(true);
  });

  it('streak tracker counts hits within the window', () => {
    const s = new StreakTracker(3);
    expect(s.hit(10)).toBe(0);
    expect(s.hit(12)).toBe(1);
    expect(s.hit(14.5)).toBe(2);
    expect(s.hit(20)).toBe(0);
  });
});

describe('gain mapping', () => {
  it('clamps and squares volumes', () => {
    expect(volumeToGain(-1)).toBe(0);
    expect(volumeToGain(2)).toBe(1);
    expect(volumeToGain(0.5)).toBeCloseTo(0.25, 9);
    expect(volumeToGain(Number.NaN)).toBe(0);
  });

  it('land volume is silent when slow and louder when fast', () => {
    expect(landVolume(2)).toBe(0);
    expect(landVolume(3)).toBeGreaterThan(0);
    expect(landVolume(20)).toBe(1);
    expect(landVolume(8)).toBeGreaterThan(landVolume(4));
  });
});

describe('createAudio without WebAudio', () => {
  it('is a safe no-op when AudioContext is undefined', () => {
    const handlers = new Map<string, Array<(e: never) => void>>();
    const events = {
      on(type: string, h: (e: never) => void) {
        handlers.set(type, [...(handlers.get(type) ?? []), h]);
        return () => undefined;
      },
      emit<K extends keyof GameEvents>(type: K, e: GameEvents[K]) {
        for (const h of handlers.get(type) ?? []) h(e as never);
      },
    };
    const settings = {
      get: () => ({ volumeMaster: 1, volumeMusic: 1, volumeSfx: 1 }),
      set() {},
      reset() {},
    };
    const audio = createAudio({
      settings: settings as unknown as GameContext['settings'],
      events: events as unknown as GameContext['events'],
      testMode: false,
    });
    const names: SfxName[] = ['gem', 'jump', 'fanfare', 'neigh', 'tick'];
    expect(() => {
      audio.play('gem');
      for (const n of names) audio.play(n, { volume: 0.5, pitch: 1.2 });
      audio.setLoop('wind', 1, 1);
      audio.setLoop('engine', 0);
      audio.setMusic(true);
      audio.update(0.016);
      audio.unlock();
      audio.play('click');
      audio.setLoop('gallop', 0.5, 1);
      audio.update(0.016);
      events.emit('gem:collected', { id: 'a', count: 1, total: 2, position: null as never });
      events.emit('player:land', { speed: 10 });
      events.emit('session:phase', { phase: 'playing', previous: 'title' });
      events.emit('session:phase', { phase: 'ended', previous: 'playing' });
      audio.update(5);
    }).not.toThrow();
  });
});
