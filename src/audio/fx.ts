/**
 * Reward sounds beyond the shared SfxName list: combo chimes, ka-ching, whoop and a crowd "yay".
 * Everything is soft-edged (no harsh square leads, filtered noise, gentle attacks).
 */
import { comboArpeggio } from './combo';
import { noteFreq } from './music-theory';
import type { Synth } from './synth';

export type ExtraSfx = 'combo' | 'kaching' | 'whoop' | 'cheer';

/** Vowel formants (F1, F2) in Hz. */
const VOWEL = {
  i: [300, 2300],
  e: [450, 2000],
  a: [760, 1250],
  u: [320, 870],
  o: [500, 900],
} as const;
type Vowel = keyof typeof VOWEL;

/**
 * One sung syllable: a sawtooth with vibrato through two band-pass formants that glide between
 * vowels. `pitch` and `vowels` are [seconds from start, value] paths.
 */
function voice(
  s: Synth,
  at: number,
  dur: number,
  pitch: ReadonlyArray<readonly [number, number]>,
  vowels: ReadonlyArray<readonly [number, Vowel]>,
  peak: number,
): void {
  const c = s.ctx;
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  const p0 = pitch[0] ?? [0, 300];
  osc.frequency.setValueAtTime(p0[1], at);
  for (let i = 1; i < pitch.length; i++) {
    const p = pitch[i];
    if (p) osc.frequency.exponentialRampToValueAtTime(p[1], at + p[0]);
  }
  const vib = c.createOscillator();
  const vibGain = c.createGain();
  vib.frequency.value = 5.5 + Math.random() * 1.5;
  vibGain.gain.value = p0[1] * 0.02;
  vib.connect(vibGain);
  vibGain.connect(osc.frequency);

  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.linearRampToValueAtTime(peak, at + Math.min(0.05, dur * 0.3));
  env.gain.setValueAtTime(peak, at + dur * 0.6);
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  const nodes: AudioNode[] = [osc, vib, vibGain, env];
  for (const k of [0, 1] as const) {
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = k === 0 ? 6 : 9;
    const v0 = vowels[0] ?? [0, 'a'];
    f.frequency.setValueAtTime(VOWEL[v0[1]][k], at);
    for (let i = 1; i < vowels.length; i++) {
      const v = vowels[i];
      if (v) f.frequency.linearRampToValueAtTime(VOWEL[v[1]][k], at + v[0]);
    }
    const g = c.createGain();
    g.gain.value = k === 0 ? 1 : 0.6;
    osc.connect(f);
    f.connect(g);
    g.connect(env);
    nodes.push(f, g);
  }
  // Soften the buzz.
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3200;
  env.connect(lp);
  lp.connect(s.out);
  nodes.push(lp);
  osc.onended = () => {
    for (const n of nodes) n.disconnect();
  };
  osc.start(at);
  vib.start(at);
  osc.stop(at + dur + 0.05);
  vib.stop(at + dur + 0.05);
  s.end = Math.max(s.end, at + dur + 0.05 - s.origin);
}

/** Bell with a slightly inharmonic shimmer partial. */
function bell(s: Synth, t: number, f: number, dur: number, peak: number): void {
  s.tone('sine', [[0, f]], t, dur, { peak, attack: 0.003 });
  s.tone('sine', [[0, f * 2.01]], t, dur * 0.5, { peak: peak * 0.35, attack: 0.002 });
  s.tone('sine', [[0, f * 3.98]], t, dur * 0.25, { peak: peak * 0.12, attack: 0.002 });
}

/** Rising combo chime: a quick run up to this step's note, the top note rings out. */
function combo(s: Synth, t: number, v: number, step: number): void {
  const notes = comboArpeggio(step);
  const gap = 0.045;
  notes.forEach((m, i) => {
    const top = i === notes.length - 1;
    const f = noteFreq(m);
    bell(s, t + i * gap, f, top ? 0.7 : 0.18, (top ? 0.2 : 0.09) * v);
    if (top) s.tone('triangle', [[0, f / 2]], t + i * gap, 0.35, { peak: 0.08 * v, attack: 0.004 });
  });
  if (step >= 2) {
    // Sparkle tail grows with the combo.
    const n = 2 + step * 2;
    for (let i = 0; i < n; i++) {
      const f = noteFreq(96 + ([0, 4, 7, 12, 16, 19][i % 6] ?? 0));
      bell(s, t + notes.length * gap + 0.05 + i * 0.035, f, 0.15, 0.035 * v);
    }
  }
}

/** Fat, friendly "ka-ching": a soft register thunk, a two-bell ding and a coin shimmer. */
function kaching(s: Synth, t: number, v: number): void {
  s.tone('sine', [[0, 180], [0.08, 90]], t, 0.12, { peak: 0.3 * v, attack: 0.002 });
  s.burst(t, 0.05, 'bandpass', 2500, 1500, 1.5, 0.12 * v, 0.002);
  bell(s, t + 0.07, noteFreq(93), 0.9, 0.18 * v); // A6
  bell(s, t + 0.16, noteFreq(100), 1.1, 0.2 * v); // E7
  s.tone('triangle', [[0, noteFreq(57)]], t + 0.16, 0.5, { peak: 0.14 * v }); // warm low A3
  s.tone('triangle', [[0, noteFreq(64)]], t + 0.16, 0.5, { peak: 0.1 * v });
  for (let i = 0; i < 10; i++) {
    const at = t + 0.2 + i * 0.045 + Math.random() * 0.02;
    s.burst(at, 0.06, 'highpass', 6000 + Math.random() * 3000, 5000, 0.7, 0.05 * v * (1 - i / 12), 0.002);
  }
}

/** A happy "woo-hoo!" for big air. */
function whoop(s: Synth, t: number, v: number): void {
  voice(s, t, 0.45, [[0, 330], [0.3, 620], [0.45, 560]], [[0, 'u'], [0.4, 'u']], 0.6 * v);
  voice(s, t + 0.42, 0.55, [[0, 700], [0.1, 760], [0.55, 520]], [[0, 'u'], [0.2, 'o'], [0.55, 'u']], 0.55 * v);
  s.burst(t, 0.9, 'bandpass', 500, 2400, 1.0, 0.1 * v, 0.3);
}

/** Crowd-style "yaaay!" plus a patter of claps. */
function cheer(s: Synth, t: number, v: number): void {
  const n = 9;
  for (let i = 0; i < n; i++) {
    const base = 240 + Math.random() * 280; // mix of voices
    const at = t + Math.random() * 0.12;
    const dur = 0.9 + Math.random() * 0.4;
    voice(
      s,
      at,
      dur,
      [[0, base], [0.18, base * 1.5], [dur, base * 1.25]],
      [[0, 'i'], [0.15, 'e'], [0.3, 'a'], [dur * 0.85, 'a'], [dur, 'i']],
      (0.2 * v) / Math.sqrt(n / 4),
    );
  }
  // Crowd breath + claps.
  s.burst(t, 1.3, 'bandpass', 1200, 900, 0.6, 0.1 * v, 0.1);
  for (let i = 0; i < 18; i++) {
    const at = t + 0.15 + Math.random() * 1.3;
    s.burst(at, 0.035, 'bandpass', 1400 + Math.random() * 900, 1100, 1.3, (0.12 + 0.18 * Math.random()) * v, 0.001);
  }
}

/** Play an extra reward sound; returns its rough duration (s). */
export function playExtra(s: Synth, name: ExtraSfx, t: number, volume: number, step = 0): number {
  s.end = 0;
  s.origin = t;
  switch (name) {
    case 'combo':
      combo(s, t, volume, step);
      break;
    case 'kaching':
      kaching(s, t, volume);
      break;
    case 'whoop':
      whoop(s, t, volume);
      break;
    case 'cheer':
      cheer(s, t, volume);
      break;
  }
  return s.end;
}
