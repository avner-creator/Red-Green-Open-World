/** Pure music helpers (no WebAudio): note frequencies, seeded RNG, pentatonic melody generation. */

/** MIDI note number to frequency in Hz (A4 = 69 = 440 Hz). */
export function noteFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Small deterministic RNG returning [0,1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Major pentatonic semitone offsets. */
export const PENTATONIC: readonly number[] = [0, 2, 4, 7, 9];

/** Map a (possibly negative) scale index to a MIDI note in the pentatonic scale of `root`. */
export function scaleToMidi(index: number, root: number): number {
  const oct = Math.floor(index / PENTATONIC.length);
  const deg = index - oct * PENTATONIC.length;
  return root + 12 * oct + (PENTATONIC[deg] ?? 0);
}

export interface MelodyNote {
  /** Start in eighth notes within a 4/4 bar (0..7). */
  step: number;
  /** Length in eighth notes. */
  length: number;
  midi: number;
}

export interface MelodyBar {
  notes: MelodyNote[];
  lastIndex: number;
}

export const MELODY_ROOT = 72; // C5
export const MELODY_MIN_INDEX = -3;
export const MELODY_MAX_INDEX = 6;

/** Sparse random-walk melody for one bar. `density` 0..1 is the chance of a note per beat. */
export function generateMelodyBar(rng: () => number, prevIndex: number, density = 0.55): MelodyBar {
  const notes: MelodyNote[] = [];
  let idx = Math.min(MELODY_MAX_INDEX, Math.max(MELODY_MIN_INDEX, prevIndex));
  if (rng() < 0.18) return { notes, lastIndex: idx }; // a rest bar keeps it airy
  const steps = [-2, -1, -1, 0, 1, 1, 2];
  for (let beat = 0; beat < 4; beat++) {
    if (rng() > density) continue;
    const off = rng() < 0.25 ? 1 : 0; // occasional off-beat
    const step = Math.min(7, beat * 2 + off);
    idx += steps[Math.floor(rng() * steps.length)] ?? 0;
    idx = Math.min(MELODY_MAX_INDEX, Math.max(MELODY_MIN_INDEX, idx));
    notes.push({ step, length: rng() < 0.5 ? 2 : 3, midi: scaleToMidi(idx, MELODY_ROOT) });
  }
  return { notes, lastIndex: idx };
}

export interface Chord {
  /** Bass root, MIDI. */
  bass: number;
  /** Pad notes, MIDI. */
  pad: readonly number[];
}

/** C - Am - F - G, soft voicings. */
export const PROGRESSION: readonly Chord[] = [
  { bass: 36, pad: [55, 60, 64] },
  { bass: 33, pad: [52, 57, 60] },
  { bass: 41, pad: [53, 57, 60] },
  { bass: 43, pad: [55, 59, 62] },
];

/** Pitch multiplier for the nth consecutive gem pickup (0-based): up a semitone each, capped. */
export function streakPitch(streak: number): number {
  return Math.pow(2, Math.min(Math.max(streak, 0), 7) / 12);
}
