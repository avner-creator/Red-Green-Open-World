/**
 * Pip's voice: synthesised "animalese" gibberish (one short pitched syllable per letter, a pitch
 * contour from punctuation and mood) plus little one-shot barks, yips, whines, pants and sniffs.
 * WebAudio only (no recorded speech, no network). Its own lazily created AudioContext, unlocked on
 * the first user gesture; the level follows the master and effects volume settings. A silent
 * no-op in test mode or without WebAudio.
 */
import type { GameSettings, SettingsApi, EventBus } from '../types';
import { CHAR_SECONDS } from './dialogue';
import type { Mood } from './dialogue';

export type BarkKind = 'yip' | 'bark' | 'whine' | 'pant' | 'sniff' | 'lick';

export interface Voice {
  speak(text: string, mood: Mood): void;
  bark(kind: BarkKind): void;
  /** Stop speech now (a line got interrupted). */
  hush(): void;
  dispose(): void;
}

type AudioCtor = new () => AudioContext;

/** Formant (band-pass centre, Hz) for a letter: vowels are open, consonants brighter. */
export function letterFormant(ch: string): number {
  const c = ch.toLowerCase();
  if ('a'.includes(c)) return 1100;
  if ('e'.includes(c)) return 1900;
  if ('i'.includes(c)) return 2400;
  if ('o'.includes(c)) return 800;
  if ('u'.includes(c)) return 650;
  return 1500 + ((c.charCodeAt(0) * 37) % 900);
}

/**
 * Pitch multiplier for letter `i` of `n` in a line: "!" rises at the end, "?" lifts the last
 * word, "." falls; excited lines sit higher, worried ones wobble.
 */
export function contour(i: number, n: number, end: string, mood: Mood): number {
  const k = n <= 1 ? 1 : i / (n - 1);
  let m = 1 + Math.sin(i * 1.7) * 0.06;
  if (end === '!') m *= 1 + k * 0.22;
  else if (end === '?') m *= k > 0.7 ? 1 + (k - 0.7) * 1.4 : 1;
  else m *= 1 - k * 0.15;
  if (mood === 'excited') m *= 1.12;
  if (mood === 'worried') m *= 0.95 + Math.sin(i * 3.1) * 0.05;
  if (mood === 'silly') m *= 1 + Math.sin(i * 0.9) * 0.15;
  return m;
}

export function createVoice(opts: { settings: SettingsApi; events: EventBus; testMode: boolean }): Voice {
  const ctor: AudioCtor | null =
    typeof window === 'undefined' ? null : ((window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor }).AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext ??
      null);
  const noop: Voice = { speak() {}, bark() {}, hush() {}, dispose() {} };
  if (opts.testMode || !ctor) return noop;

  let ac: AudioContext | null = null;
  let out: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let speech: GainNode | null = null;

  const level = (s: Readonly<GameSettings>): number => {
    const v = (x: number): number => Math.max(0, Math.min(1, x)) ** 2;
    return v(s.volumeMaster) * v(s.volumeSfx) * 0.9;
  };

  const unlock = (): void => {
    try {
      if (!ac) {
        ac = new ctor();
        out = ac.createGain();
        out.gain.value = level(opts.settings.get());
        const comp = ac.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 4;
        out.connect(comp).connect(ac.destination);
        noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
        const d = noise.getChannelData(0);
        let seed = 12345;
        for (let i = 0; i < d.length; i++) {
          seed = (seed * 1103515245 + 12345) & 0x7fffffff;
          d[i] = (seed / 0x7fffffff) * 2 - 1;
        }
      }
      if (ac.state === 'suspended') void ac.resume().catch(() => {});
    } catch {
      ac = null;
    }
    if (ac && ac.state === 'running') {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      window.removeEventListener('touchend', unlock, true);
    }
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  window.addEventListener('touchend', unlock, true);
  const offSettings = opts.events.on('settings:changed', (e) => {
    if (ac && out) out.gain.setTargetAtTime(level(e.settings), ac.currentTime, 0.05);
  });

  const ready = (): AudioContext | null => (ac && out && ac.state === 'running' ? ac : null);

  /** One syllable: a soft square+triangle pair through a band-pass "mouth". */
  const syllable = (a: AudioContext, dest: AudioNode, at: number, freq: number, formant: number, dur: number, vol: number): void => {
    const o1 = a.createOscillator();
    const o2 = a.createOscillator();
    o1.type = 'triangle';
    o2.type = 'square';
    o1.frequency.setValueAtTime(freq * 1.06, at);
    o1.frequency.exponentialRampToValueAtTime(freq, at + dur * 0.5);
    o2.frequency.setValueAtTime(freq * 1.06, at);
    o2.frequency.exponentialRampToValueAtTime(freq, at + dur * 0.5);
    const mix2 = a.createGain();
    mix2.gain.value = 0.18;
    const bp = a.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = formant;
    bp.Q.value = 2.2;
    const env = a.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(vol, at + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o1.connect(env);
    o2.connect(mix2).connect(env);
    const dry = a.createGain();
    dry.gain.value = 0.55;
    env.connect(bp).connect(dest);
    env.connect(dry).connect(dest);
    o1.start(at);
    o2.start(at);
    o1.stop(at + dur + 0.02);
    o2.stop(at + dur + 0.02);
  };

  const noiseBurst = (a: AudioContext, at: number, dur: number, f: number, q: number, vol: number, sweepTo?: number): void => {
    if (!noise || !out) return;
    const src = a.createBufferSource();
    src.buffer = noise;
    const bp = a.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(f, at);
    if (sweepTo) bp.frequency.exponentialRampToValueAtTime(sweepTo, at + dur);
    bp.Q.value = q;
    const env = a.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(vol, at + Math.min(0.02, dur * 0.3));
    env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(bp).connect(env).connect(out);
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.02);
  };

  const tone = (a: AudioContext, at: number, type: OscillatorType, pts: [number, number][], vol: number, lp = 3000): void => {
    if (!out) return;
    const o = a.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(pts[0][1], at);
    for (const [t, f] of pts.slice(1)) o.frequency.exponentialRampToValueAtTime(f, at + t);
    const end = pts[pts.length - 1][0];
    const f = a.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lp;
    const env = a.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.exponentialRampToValueAtTime(vol, at + 0.012);
    env.gain.setValueAtTime(vol, at + end * 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, at + end);
    o.connect(f).connect(env).connect(out);
    o.start(at);
    o.stop(at + end + 0.02);
  };

  return {
    speak(text, mood) {
      const a = ready();
      if (!a || !out) return;
      speech?.disconnect();
      speech = a.createGain();
      speech.gain.value = 1;
      speech.connect(out);
      const t0 = a.currentTime + 0.02;
      const trimmed = text.trim();
      const end = /[!?.]$/.test(trimmed) ? trimmed[trimmed.length - 1] : '.';
      const base = 470 + (mood === 'excited' ? 40 : 0);
      const n = text.length;
      let spoken = 0;
      for (let i = 0; i < n; i++) {
        const ch = text[i];
        if (!/[a-z0-9]/i.test(ch)) continue;
        // Speak roughly every other letter, like a real "animalese" voice: quicker, cuter.
        if (spoken > 0 && i % 2 === 1 && !/[aeiou]/i.test(ch)) continue;
        spoken++;
        const f = base * contour(i, n, end, mood) * (ch === ch.toUpperCase() && /[A-Z]/.test(ch) ? 1.08 : 1);
        syllable(a, speech, t0 + i * CHAR_SECONDS, f, letterFormant(ch), CHAR_SECONDS * 1.7, 0.16);
      }
    },
    hush() {
      const a = ready();
      if (!a || !speech) return;
      speech.gain.setTargetAtTime(0, a.currentTime, 0.02);
      speech = null;
    },
    bark(kind) {
      const a = ready();
      if (!a) return;
      const t = a.currentTime + 0.01;
      switch (kind) {
        case 'yip':
          tone(a, t, 'sawtooth', [[0, 900], [0.05, 1550], [0.13, 760]], 0.16, 2600);
          noiseBurst(a, t, 0.05, 2500, 1.5, 0.05);
          break;
        case 'bark':
          tone(a, t, 'sawtooth', [[0, 420], [0.04, 700], [0.16, 360]], 0.2, 1800);
          noiseBurst(a, t, 0.09, 1200, 1.2, 0.08);
          tone(a, t + 0.2, 'sawtooth', [[0, 460], [0.04, 760], [0.14, 380]], 0.16, 1800);
          break;
        case 'whine':
          tone(a, t, 'sine', [[0, 880], [0.2, 1250], [0.45, 980], [0.62, 760]], 0.12, 3000);
          break;
        case 'pant':
          for (let i = 0; i < 4; i++) noiseBurst(a, t + i * 0.16, 0.09, 1600, 3, 0.05);
          break;
        case 'sniff':
          for (let i = 0; i < 3; i++) noiseBurst(a, t + i * 0.09, 0.06, 4200, 2, 0.04);
          break;
        case 'lick':
          noiseBurst(a, t, 0.14, 700, 4, 0.06, 2200);
          noiseBurst(a, t + 0.18, 0.12, 800, 4, 0.05, 2400);
          break;
      }
    },
    dispose() {
      offSettings();
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
      window.removeEventListener('touchend', unlock, true);
      try {
        void ac?.close();
      } catch {
        /* ignore */
      }
    },
  };
}
