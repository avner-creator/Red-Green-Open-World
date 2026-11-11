/**
 * Pip's voice. He speaks his lines in real words: a pre-recorded clip per line
 * (`public/assets/voice/`, made by `scripts/gen-pip-voice.mjs`), else the browser's on-device speech
 * (Web Speech, local voices only), else a synthesised "animalese" babble (one short pitched syllable
 * per letter). Plus little one-shot barks, yips, whines, pants and sniffs.
 * Its own lazily created AudioContext, unlocked on the first user gesture (clips load only then,
 * never during boot); the level follows the master and effects volume settings (and `voicePip` when
 * settings have it). Music is ducked while he talks (when the audio system offers `duckMusic`).
 * Never talks over himself: a new line or `hush()` stops the current one.
 * In test mode it makes no sound and only records what it was asked to say (`requests`).
 */
import type { AudioApi, GameSettings, SettingsApi, EventBus } from '../types';
import { CHAR_SECONDS } from './dialogue';
import type { Mood } from './dialogue';
import { ClipBank } from './clips';
import { createSpeaker } from './speech';
import { clipId } from './voiceLines';
import { HOWTO, STORY } from './script';

/** Clips fetched first after the first gesture: the welcome story, then the trampoline how-to. */
const FIRST_CLIPS = [...STORY, ...HOWTO.trampoline].map((l) => l.text);

export type BarkKind = 'yip' | 'bark' | 'whine' | 'pant' | 'sniff' | 'lick';

/** What the voice was asked to say (test hook): the clip id and which path plays it. */
export interface VoiceRequest {
  id: string;
  text: string;
  source: 'clip' | 'speech' | 'pending' | 'off';
}

export interface Voice {
  speak(text: string, mood: Mood): void;
  bark(kind: BarkKind): void;
  /** Stop speech now (a line got interrupted). */
  hush(): void;
  /**
   * True when Pip will say this line out loud with his recorded voice: voice level above 0, audio
   * unlocked and a clip for it exists. Then the bubble shows only pictograms.
   */
  audible(text: string): boolean;
  /** Still saying (or about to say) the current line: the bubble waits for the voice to finish. */
  talking(): boolean;
  /** Seconds of the recorded clip for this text, once the manifest is loaded (bubble sync). */
  clipSeconds(text: string): number | null;
  /** Everything it was asked to say (kept in test mode only). */
  readonly requests: readonly VoiceRequest[];
  dispose(): void;
}

/** How long a clip may take to arrive before the line falls back to on-device speech (s). */
export const CLIP_WAIT = 0.9;
/** Music level while Pip talks (about −6 dB). */
export const DUCK_LEVEL = 0.5;

/** Pip's own voice level 0..1 (`voicePip` once settings have it; on by default). */
export function pipVoiceLevel(s: Readonly<GameSettings>): number {
  const v = (s as GameSettings & { voicePip?: number }).voicePip;
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
}

/** A small pitch/tempo lift per mood for recorded clips (playbackRate). */
export function moodRate(mood: Mood): number {
  return mood === 'excited' ? 1.04 : mood === 'silly' ? 1.06 : mood === 'worried' ? 0.97 : 1;
}

type Ducker = AudioApi & { duckMusic?: (level: number, seconds: number) => void };

const baseUrl = (): string => {
  try {
    return import.meta.env.BASE_URL ?? './';
  } catch {
    return './';
  }
};

/** Test-mode voice: silent, records each request (and whether a clip exists for it). */
function recorder(settings: SettingsApi): Voice {
  const bank = new ClipBank(baseUrl());
  void bank.load();
  const requests: VoiceRequest[] = [];
  return {
    requests,
    // Test mode stands in for an unlocked device: audible when the voice is on and a clip exists.
    audible: (text) => pipVoiceLevel(settings.get()) > 0 && !!bank.info(text),
    talking: () => false,
    speak(text) {
      void bank.load();
      if (requests.length >= 200) return;
      const source = bank.manifest ? (bank.info(text) ? 'clip' : 'speech') : 'pending';
      requests.push({ id: clipId(text), text, source });
    },
    bark() {},
    hush() {},
    // Line timing stays text-based in tests (deterministic intro pacing).
    clipSeconds: () => null,
    dispose() {},
  };
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

export function createVoice(opts: { settings: SettingsApi; events: EventBus; testMode: boolean; audio?: AudioApi }): Voice {
  const ctor: AudioCtor | null =
    typeof window === 'undefined' ? null : ((window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor }).AudioContext ??
      (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext ??
      null);
  const noop: Voice = { speak() {}, bark() {}, hush() {}, audible: () => false, talking: () => false, clipSeconds: () => null, requests: [], dispose() {} };
  if (opts.testMode) return recorder(opts.settings);
  if (!ctor) return noop;

  let ac: AudioContext | null = null;
  let out: GainNode | null = null;
  /** Spoken words (clips) go through their own gain: Pip's voice level on top of the effects level. */
  let talkOut: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let speech: GainNode | null = null;
  let clip: AudioBufferSourceNode | null = null;
  /** Bumped by every speak/hush: a clip that arrives late for an old line is dropped. */
  let token = 0;
  const bank = new ClipBank(baseUrl());
  // The clip list (a few KB) loads at once, so the very first line already knows its clip; the
  // clips themselves wait for the first gesture.
  void bank.load();
  const speaker = createSpeaker();

  const level = (s: Readonly<GameSettings>): number => {
    const v = (x: number): number => Math.max(0, Math.min(1, x)) ** 2;
    return v(s.volumeMaster) * v(s.volumeSfx) * 0.9;
  };
  /** Words are a bit louder than the babble and follow `voicePip`. */
  const talkLevel = (s: Readonly<GameSettings>): number => Math.min(1, level(s) * 1.25) * pipVoiceLevel(s);

  const unlock = (): void => {
    speaker.unlock();
    // Clips load only now (after a gesture, i.e. after boot): the intro first, then the rest.
    void bank.prefetch(FIRST_CLIPS);
    try {
      if (!ac) {
        ac = new ctor();
        out = ac.createGain();
        out.gain.value = level(opts.settings.get());
        const comp = ac.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.ratio.value = 4;
        out.connect(comp).connect(ac.destination);
        talkOut = ac.createGain();
        talkOut.gain.value = talkLevel(opts.settings.get());
        talkOut.connect(comp);
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
    if (ac && talkOut) talkOut.gain.setTargetAtTime(talkLevel(e.settings), ac.currentTime, 0.05);
  });

  const duck = (seconds: number): void => {
    try {
      (opts.audio as Ducker | undefined)?.duckMusic?.(DUCK_LEVEL, seconds);
    } catch {
      /* the audio system has no ducking: fine */
    }
  };

  /** The gain of the clip now playing (faded out, never cut mid-word). */
  let clipGain: GainNode | null = null;
  /** A line is waiting for its clip (manifest / bytes / decode). */
  let pending = false;

  const stopTalking = (): void => {
    token++;
    pending = false;
    if (clip) {
      const src = clip;
      const g = clipGain;
      clip = null;
      clipGain = null;
      try {
        // A 150 ms fade instead of a hard cut.
        const now = ac?.currentTime ?? 0;
        g?.gain.setTargetAtTime(0, now, 0.04);
        src.stop(now + 0.15);
      } catch {
        /* already stopped */
      }
      window.setTimeout(() => {
        src.disconnect();
        g?.disconnect();
      }, 300);
    }
    speaker.cancel();
  };

  const playClip = (a: AudioContext, buf: AudioBuffer, mood: Mood): void => {
    if (!talkOut) return;
    const src = a.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = moodRate(mood);
    const g = a.createGain();
    src.connect(g).connect(talkOut);
    src.onended = () => {
      if (clip === src) {
        clip = null;
        clipGain = null;
      }
    };
    src.start(a.currentTime + 0.01);
    clip = src;
    clipGain = g;
    duck(buf.duration / src.playbackRate.value + 0.3);
  };

  /** On-device speech, else babble. */
  const fallback = (a: AudioContext | null, text: string, mood: Mood): void => {
    const s = opts.settings.get();
    if (speaker.ready && speaker.speak(text, Math.min(1, Math.sqrt(talkLevel(s)) * 1.1))) {
      duck(0.6 + text.length * 0.06);
      return;
    }
    if (a) babble(a, text, mood);
  };

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

  /** The animalese babble (last fallback when there is neither a clip nor an on-device voice). */
  function babble(a: AudioContext, text: string, mood: Mood): void {
    if (!out) return;
    speech?.disconnect();
    speech = a.createGain();
    speech.gain.value = pipVoiceLevel(opts.settings.get());
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
  }

  const hushBabble = (): void => {
    const a = ready();
    if (!a || !speech) return;
    speech.gain.setTargetAtTime(0, a.currentTime, 0.02);
    speech = null;
  };

  return {
    requests: [],
    talking: () => pending || clip !== null,
    audible: (text) => {
      const s = opts.settings.get();
      return talkLevel(s) > 1e-4 && !!ready() && !!bank.info(text);
    },
    clipSeconds: (text) => bank.info(text)?.dur ?? null,
    speak(text, mood) {
      stopTalking();
      hushBabble();
      if (pipVoiceLevel(opts.settings.get()) <= 0) return;
      const mine = token;
      const a = ready();
      if (!a) {
        // No WebAudio yet (no gesture so far): on-device speech may still work.
        fallback(null, text, mood);
        return;
      }
      let settled = false;
      pending = true;
      // Wait for the clip list first (the very first line comes right after the first gesture),
      // then give the clip itself CLIP_WAIT seconds before the on-device fallback.
      void bank.load().then(() => {
        if (settled || mine !== token) return;
        const timer = window.setTimeout(() => {
          if (settled || mine !== token) return;
          settled = true;
          pending = false;
          fallback(a, text, mood);
        }, CLIP_WAIT * 1000);
        void bank.buffer(a, text).then((buf) => {
          if (settled || mine !== token) return;
          settled = true;
          pending = false;
          window.clearTimeout(timer);
          if (buf) playClip(a, buf, mood);
          else fallback(a, text, mood);
        });
      });
    },
    hush() {
      stopTalking();
      hushBabble();
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
      stopTalking();
      speaker.dispose();
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
