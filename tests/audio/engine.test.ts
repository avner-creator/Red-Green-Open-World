import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAudio } from '../../src/audio';
import type { GameContext, GameEvents } from '../../src/types';

/** Minimal fake WebAudio graph: enough surface for the engine, counts what gets created. */
class FakeParam {
  value = 1;
  setValueAtTime() {}
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
  setTargetAtTime() {}
  setValueCurveAtTime() {}
  cancelScheduledValues() {}
}
class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  threshold = new FakeParam();
  knee = new FakeParam();
  ratio = new FakeParam();
  attack = new FakeParam();
  release = new FakeParam();
  type = '';
  buffer: unknown = null;
  loop = false;
  onended: (() => void) | null = null;
  connect() {}
  disconnect() {}
  start() {}
  stop() {}
}
const created = { contexts: 0, sources: 0, oscillators: 0 };
const sources: FakeNode[] = [];
class FakeAudioContext {
  currentTime = 0;
  sampleRate = 48000;
  state = 'running';
  destination = new FakeNode();
  constructor() {
    created.contexts++;
  }
  createGain() {
    return new FakeNode();
  }
  createOscillator() {
    created.oscillators++;
    return new FakeNode();
  }
  createBufferSource() {
    created.sources++;
    const n = new FakeNode();
    sources.push(n);
    return n;
  }
  createBiquadFilter() {
    return new FakeNode();
  }
  createDynamicsCompressor() {
    return new FakeNode();
  }
  createBuffer(_ch: number, len: number) {
    const data = new Float32Array(len);
    return { duration: len / 48000, getChannelData: () => data };
  }
  decodeAudioData(_d: ArrayBuffer, ok: (b: unknown) => void) {
    const b = { duration: 10 };
    ok(b);
    return Promise.resolve(b);
  }
  resume() {
    return Promise.resolve();
  }
}

function harness(testMode: boolean) {
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
  const settings = { get: () => ({ volumeMaster: 1, volumeMusic: 1, volumeSfx: 1 }), set() {}, reset() {} };
  const audio = createAudio({
    settings: settings as unknown as GameContext['settings'],
    events: events as unknown as GameContext['events'],
    testMode,
  });
  return { audio, events };
}

const fetched: string[] = [];
function install(): void {
  created.contexts = created.sources = created.oscillators = 0;
  fetched.length = 0;
  sources.length = 0;
  vi.stubGlobal('AudioContext', FakeAudioContext);
  vi.stubGlobal('fetch', (url: string) => {
    fetched.push(url);
    return Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });
  });
}
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('audio engine with a fake AudioContext', () => {
  it('test mode builds nothing and fetches no tracks', async () => {
    install();
    const { audio, events } = harness(true);
    audio.unlock();
    events.emit('session:phase', { phase: 'playing', previous: 'title' });
    audio.update(0.1);
    await flush();
    expect(created.contexts).toBe(0);
    expect(fetched).toEqual([]);
  });

  it('nothing is fetched before Play; Play loads the explore loop first, then the rest lazily', async () => {
    install();
    const { audio, events } = harness(false);
    audio.unlock();
    audio.update(0.1);
    await flush();
    expect(created.contexts).toBe(1);
    expect(fetched).toEqual([]); // title theme is generative
    expect(created.oscillators).toBeGreaterThan(0);
    events.emit('session:phase', { phase: 'playing', previous: 'title' });
    for (let i = 0; i < 10; i++) await flush();
    expect(fetched[0]).toContain('music-explore.ogg');
    expect(fetched.some((u) => u.includes('jingle-win.ogg'))).toBe(true);
    expect(fetched.some((u) => u.includes('music-action.ogg'))).toBe(true);
    expect(fetched.some((u) => u.includes('music-urgent.ogg'))).toBe(false);
    events.emit('session:tick', { remaining: 60, total: 300 });
    await flush();
    expect(fetched.some((u) => u.includes('music-urgent.ogg'))).toBe(true);
  });

  it('starts a looping source for the explore loop and survives every event without throwing', async () => {
    install();
    const { audio, events } = harness(false);
    audio.unlock();
    events.emit('session:phase', { phase: 'playing', previous: 'title' });
    for (let i = 0; i < 10; i++) await flush();
    audio.update(0.016);
    expect(sources.filter((n) => n.loop && n.buffer !== null)).toHaveLength(1); // the explore loop
    expect(() => {
      for (let i = 0; i < 6; i++) events.emit('gem:collected', { id: `g${i}`, count: i + 1, total: 10, position: null as never });
      events.emit('stunt', { kind: 'bigBounce', value: 35, stars: 3 });
      events.emit('stunt', { kind: 'bullseye', value: 1, stars: 1 });
      events.emit('chest:opened', { chestId: 'c', outfitId: 'o' });
      events.emit('player:mode', { mode: 'driving', previous: 'walk' });
      audio.update(0.5);
      events.emit('player:mode', { mode: 'external', previous: 'driving' });
      audio.update(0.5);
      events.emit('session:tick', { remaining: 20, total: 300 });
      audio.update(0.5);
      events.emit('session:phase', { phase: 'paused', previous: 'playing' });
      audio.update(0.5);
      events.emit('session:phase', { phase: 'playing', previous: 'paused' });
      events.emit('session:phase', { phase: 'ended', previous: 'playing' });
      audio.update(6);
      audio.setMusic(false);
      audio.update(0.1);
      audio.setMusic(true);
      events.emit('session:phase', { phase: 'title', previous: 'ended' });
      audio.update(0.1);
    }).not.toThrow();
  });

  it('a failed track download does not throw and leaves the generative fallback on', async () => {
    install();
    vi.stubGlobal('fetch', () => Promise.resolve({ ok: false, status: 404 }));
    const { audio, events } = harness(false);
    audio.unlock();
    events.emit('session:phase', { phase: 'playing', previous: 'title' });
    for (let i = 0; i < 10; i++) await flush();
    const before = created.oscillators;
    expect(() => {
      for (let i = 0; i < 20; i++) audio.update(0.1);
    }).not.toThrow();
    expect(created.oscillators).toBeGreaterThan(before); // generative music keeps scheduling notes
  });
});
