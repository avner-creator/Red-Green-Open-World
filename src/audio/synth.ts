import type { SfxName } from '../types';
import { noteFreq } from './music-theory';

/** Frequency envelope points: [seconds from start, Hz]. */
export type FreqPoints = ReadonlyArray<readonly [number, number]>;

export interface ToneOpts {
  filter?: { type: BiquadFilterType; freq: number; q?: number };
  attack?: number;
  /** Peak gain. */
  peak: number;
}

export function createNoiseBuffer(ctx: BaseAudioContext, seconds = 2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Builds short-lived one-shot voices into `out`. Tracks the latest end time of the current sound. */
export class Synth {
  /** Latest end (seconds after `t0` of the running recipe). */
  end = 0;
  /** Absolute start time of the running recipe. */
  origin = 0;
  constructor(
    readonly ctx: BaseAudioContext,
    readonly out: AudioNode,
    readonly noise: AudioBuffer,
  ) {}

  private cleanup(src: AudioScheduledSourceNode, nodes: AudioNode[]): void {
    src.onended = () => {
      for (const n of nodes) n.disconnect();
    };
  }

  /** Oscillator with a frequency path and a percussive envelope. `at` is the absolute start time. */
  tone(type: OscillatorType, pts: FreqPoints, at: number, dur: number, o: ToneOpts): void {
    const c = this.ctx;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    const first = pts[0] ?? [0, 440];
    osc.frequency.setValueAtTime(first[1], at);
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      if (p) osc.frequency.exponentialRampToValueAtTime(Math.max(20, p[1]), at + p[0]);
    }
    const atk = Math.min(o.attack ?? 0.006, dur * 0.5);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(o.peak, at + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    const nodes: AudioNode[] = [osc, g];
    osc.connect(g);
    let tail: AudioNode = g;
    if (o.filter) {
      const f = c.createBiquadFilter();
      f.type = o.filter.type;
      f.frequency.value = o.filter.freq;
      f.Q.value = o.filter.q ?? 0.7;
      g.connect(f);
      nodes.push(f);
      tail = f;
    }
    tail.connect(this.out);
    this.cleanup(osc, nodes);
    osc.start(at);
    osc.stop(at + dur + 0.05);
    this.end = Math.max(this.end, at + dur + 0.05 - this.origin);
  }

  /** Filtered noise burst with a filter sweep f0 to f1. */
  burst(at: number, dur: number, type: BiquadFilterType, f0: number, f1: number, q: number, peak: number, attack = 0.005): void {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, at);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
    const g = c.createGain();
    const atk = Math.min(attack, dur * 0.5);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.out);
    this.cleanup(src, [src, f, g]);
    src.start(at, Math.random() * 1.5);
    src.stop(at + dur + 0.05);
    this.end = Math.max(this.end, at + dur + 0.05 - this.origin);
  }
}

type Recipe = (s: Synth, t: number, v: number, p: number) => void;

const hz = noteFreq;

/** A soft bell-ish note: sine plus a quiet octave. */
function chime(s: Synth, t: number, f: number, dur: number, peak: number): void {
  s.tone('sine', [[0, f]], t, dur, { peak });
  s.tone('sine', [[0, f * 2]], t, dur * 0.6, { peak: peak * 0.3 });
}

function thud(s: Synth, t: number, v: number, f = 130, peak = 0.35): void {
  s.tone('sine', [[0, f], [0.14, f * 0.38]], t, 0.18, { peak: peak * v });
  s.burst(t, 0.1, 'lowpass', 500, 150, 0.7, 0.18 * v);
}

const RECIPES: Record<SfxName, Recipe> = {
  gem: (s, t, v, p) => {
    chime(s, t, 988 * p, 0.35, 0.22 * v);
    chime(s, t + 0.09, 1480 * p, 0.5, 0.2 * v);
  },
  gemNear: (s, t, v, p) => {
    const fs = [2093, 2637, 3136];
    fs.forEach((f, i) => s.tone('sine', [[0, f * p]], t + i * 0.07, 0.22, { peak: 0.04 * v }));
  },
  jump: (s, t, v, p) => {
    s.tone('sine', [[0, 320 * p], [0.14, 640 * p]], t, 0.16, { peak: 0.22 * v });
  },
  land: (s, t, v, p) => thud(s, t, v, 120 * p, 0.3),
  boing: (s, t, v, p) => {
    // Springy cartoon boing: a soft thump, a wobbling spring glide and a bright pluck on top.
    const pts: FreqPoints = [[0, 150 * p], [0.07, 620 * p], [0.16, 260 * p], [0.25, 500 * p], [0.34, 300 * p], [0.45, 400 * p]];
    s.tone('sine', [[0, 160 * p], [0.1, 60 * p]], t, 0.14, { peak: 0.28 * v, attack: 0.002 });
    s.tone('sine', pts, t, 0.5, { peak: 0.28 * v });
    s.tone('triangle', pts.map(([d, f]) => [d, f * 2] as const), t, 0.4, { peak: 0.08 * v });
    s.tone('triangle', pts.map(([d, f]) => [d, f * 1.5] as const), t + 0.01, 0.35, { peak: 0.05 * v, filter: { type: 'lowpass', freq: 2500 } });
    s.tone('sine', [[0, 1320 * p], [0.08, 1760 * p]], t + 0.02, 0.12, { peak: 0.05 * v, attack: 0.002 });
  },
  bigBoing: (s, t, v, p) => {
    // Bigger spring, a sub drop, a rising whoosh and a sparkly major chord.
    const pts: FreqPoints = [[0, 110 * p], [0.1, 700 * p], [0.22, 200 * p], [0.34, 600 * p], [0.46, 240 * p], [0.58, 480 * p], [0.7, 300 * p], [0.85, 380 * p]];
    s.tone('sine', [[0, 120 * p], [0.18, 45 * p]], t, 0.25, { peak: 0.35 * v, attack: 0.002 });
    s.tone('sine', pts, t, 0.95, { peak: 0.3 * v });
    s.tone('triangle', pts.map(([d, f]) => [d, f * 2] as const), t, 0.8, { peak: 0.1 * v });
    s.tone('triangle', pts.map(([d, f]) => [d, f * 1.01] as const), t, 0.9, { peak: 0.08 * v, filter: { type: 'lowpass', freq: 1800 } });
    s.burst(t + 0.05, 0.7, 'bandpass', 400, 2600, 1.1, 0.12 * v, 0.25);
    [1046.5, 1318.5, 1568, 2093].forEach((f, i) => chime(s, t + 0.12 + i * 0.05, f * p, 0.5, 0.06 * v));
  },
  flop: (s, t, v, p) => {
    const pts: FreqPoints = [[0, 1300 * p], [0.15, 1000 * p], [0.3, 800 * p], [0.45, 500 * p], [0.6, 220 * p]];
    s.tone('sine', pts, t, 0.65, { peak: 0.2 * v });
    s.tone('sine', pts.map(([d, f]) => [d, f * 1.01] as const), t, 0.65, { peak: 0.1 * v });
    thud(s, t + 0.6, v * 0.8, 95 * p, 0.28);
  },
  splash: (s, t, v, p) => {
    s.burst(t, 0.6, 'bandpass', 1500 * p, 500 * p, 0.8, 0.35 * v, 0.01);
    s.burst(t + 0.05, 0.35, 'highpass', 3000, 1800, 0.5, 0.1 * v, 0.02);
    s.tone('sine', [[0, 260 * p], [0.2, 120 * p]], t, 0.25, { peak: 0.15 * v });
  },
  whoosh: (s, t, v, p) => {
    s.burst(t, 0.7, 'bandpass', 300 * p, 1800 * p, 1.2, 0.3 * v, 0.28);
    s.burst(t + 0.3, 0.4, 'bandpass', 1800 * p, 400 * p, 1.2, 0.15 * v, 0.05);
  },
  chute: (s, t, v, p) => {
    s.burst(t, 0.09, 'highpass', 900, 500, 0.6, 0.3 * v, 0.003);
    s.tone('sine', [[0, 170 * p], [0.1, 70 * p]], t, 0.14, { peak: 0.3 * v });
    s.burst(t + 0.05, 0.55, 'lowpass', 2200, 600, 0.6, 0.14 * v, 0.1);
  },
  key: (s, t, v, p) => {
    [1568, 2093, 2637, 3136].forEach((f, i) => chime(s, t + i * 0.06, f * p, 0.35, 0.14 * v));
  },
  chest: (s, t, v, p) => {
    [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568].forEach((f, i) => {
      s.tone('triangle', [[0, f * p]], t + i * 0.085, 0.45, { peak: 0.2 * v });
      s.tone('sine', [[0, f * 2 * p]], t + i * 0.085, 0.3, { peak: 0.06 * v });
    });
  },
  star: (s, t, v, p) => {
    [1046.5, 1318.5, 1568, 2093, 2637].forEach((f, i) => chime(s, t + i * 0.055, f * p, 0.3, 0.14 * v));
  },
  click: (s, t, v, p) => {
    s.tone('sine', [[0, 1100 * p], [0.05, 650 * p]], t, 0.06, { peak: 0.2 * v, attack: 0.002 });
  },
  horn: (s, t, v, p) => {
    for (let i = 0; i < 2; i++) {
      const at = t + i * 0.17;
      s.tone('square', [[0, 560 * p], [0.1, 700 * p]], at, 0.12, { peak: 0.12 * v, filter: { type: 'lowpass', freq: 2200 } });
      s.tone('triangle', [[0, 1120 * p], [0.1, 1400 * p]], at, 0.12, { peak: 0.08 * v });
    }
  },
  bump: (s, t, v, p) => {
    s.tone('sine', [[0, 240 * p], [0.05, 130 * p], [0.12, 170 * p], [0.2, 80 * p]], t, 0.24, { peak: 0.3 * v });
    s.tone('triangle', [[0, 480 * p], [0.1, 200 * p]], t, 0.12, { peak: 0.08 * v });
    s.burst(t, 0.06, 'lowpass', 700, 300, 0.7, 0.1 * v);
  },
  neigh: (s, t, v, p) => {
    const pts: FreqPoints = [[0, 420 * p], [0.12, 950 * p], [0.24, 780 * p], [0.34, 900 * p], [0.46, 740 * p], [0.62, 520 * p], [0.85, 320 * p]];
    s.tone('sawtooth', pts, t, 0.95, { peak: 0.14 * v, attack: 0.04, filter: { type: 'bandpass', freq: 1100, q: 1.2 } });
    s.tone('triangle', pts, t, 0.95, { peak: 0.1 * v, attack: 0.04 });
    s.burst(t, 0.9, 'bandpass', 2200, 1200, 1.5, 0.03 * v, 0.1);
  },
  start: (s, t, v, p) => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      s.tone('triangle', [[0, f * p]], t + i * 0.1, i === 3 ? 0.6 : 0.25, { peak: 0.2 * v });
      s.tone('sine', [[0, f * 2 * p]], t + i * 0.1, 0.3, { peak: 0.05 * v });
    });
  },
  fanfare: (s, t, v, p) => {
    const seq: ReadonlyArray<readonly [number, number, number]> = [
      [60, 0, 0.18], [64, 0.18, 0.18], [67, 0.36, 0.18], [72, 0.54, 0.45],
      [67, 1.05, 0.18], [72, 1.23, 0.18], [76, 1.41, 0.9],
    ];
    for (const [m, d, len] of seq) {
      const f = hz(m + 12) * p;
      s.tone('triangle', [[0, f]], t + d, len + 0.15, { peak: 0.2 * v, filter: { type: 'lowpass', freq: 3500 } });
      s.tone('sine', [[0, f * 2]], t + d, len, { peak: 0.06 * v });
      s.tone('sine', [[0, f / 2]], t + d, len + 0.1, { peak: 0.1 * v });
    }
  },
  tick: (s, t, v, p) => {
    s.tone('sine', [[0, 1500 * p], [0.04, 1200 * p]], t, 0.05, { peak: 0.12 * v, attack: 0.002 });
  },
};

/** Play one SFX at absolute time `t`. Returns its approximate duration in seconds. */
export function playSfx(s: Synth, name: SfxName, t: number, volume: number, pitch: number): number {
  s.end = 0;
  s.origin = t;
  RECIPES[name](s, t, volume, pitch);
  return s.end;
}
