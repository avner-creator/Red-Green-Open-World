import { generateMelodyBar, mulberry32, noteFreq, PROGRESSION } from './music-theory';

const BPM = 100;
const BEAT = 60 / BPM;
const EIGHTH = BEAT / 2;
const BAR = BEAT * 4;
const LOOKAHEAD = 1.2;

/** Generative pentatonic loop scheduled bar by bar with look-ahead. */
export class Music {
  private on = false;
  private nextBar = 0;
  private barIndex = 0;
  private melodyIdx = 0;
  private readonly rng: () => number;
  private readonly gate: GainNode;

  constructor(
    private readonly ctx: AudioContext,
    out: AudioNode,
    seed: number,
  ) {
    this.rng = mulberry32(seed);
    this.gate = ctx.createGain();
    this.gate.gain.value = 0;
    this.gate.connect(out);
  }

  setOn(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    const now = this.ctx.currentTime;
    this.gate.gain.cancelScheduledValues(now);
    this.gate.gain.setTargetAtTime(on ? 1 : 0, now, on ? 0.4 : 0.6);
    if (on) this.nextBar = now + 0.1;
  }

  /** 0..1 level multiplier (ducking while paused). */
  setDuck(level: number): void {
    if (!this.on) return;
    const now = this.ctx.currentTime;
    this.gate.gain.cancelScheduledValues(now);
    this.gate.gain.setTargetAtTime(level, now, 0.3);
  }

  update(): void {
    if (!this.on) return;
    const now = this.ctx.currentTime;
    if (this.nextBar < now) this.nextBar = now + 0.05; // recover after a stall
    while (this.nextBar < now + LOOKAHEAD) {
      this.scheduleBar(this.nextBar);
      this.nextBar += BAR;
      this.barIndex++;
    }
  }

  private scheduleBar(t: number): void {
    const chord = PROGRESSION[this.barIndex % PROGRESSION.length];
    if (!chord) return;
    // Pad: soft sines swelling across the bar.
    for (const m of chord.pad) this.note('sine', noteFreq(m), t, BAR * 1.1, 0.05, BAR * 0.4);
    // Bass: beats 1 and 3, every other bar on beat 3 only for breathing room.
    this.note('sine', noteFreq(chord.bass), t, BEAT * 1.6, 0.11, 0.02);
    if (this.barIndex % 2 === 0) this.note('sine', noteFreq(chord.bass + 7), t + BEAT * 2, BEAT * 1.2, 0.07, 0.02);
    // Music-box arpeggio: chord tones an octave up, gently rising and falling in eighths.
    const arp = [...chord.pad, (chord.pad[0] ?? 60) + 12];
    const order = [0, 1, 2, 3, 2, 1, 2, 3];
    order.forEach((k, i) => {
      const m = (arp[k] ?? 60) + 12;
      this.note('sine', noteFreq(m), t + i * EIGHTH, 0.45, i % 2 === 0 ? 0.03 : 0.02, 0.004);
    });
    // Melody: sparse; every 4th bar thinner.
    const density = this.barIndex % 4 === 3 ? 0.25 : 0.5;
    const bar = generateMelodyBar(this.rng, this.melodyIdx, density);
    this.melodyIdx = bar.lastIndex;
    for (const n of bar.notes) {
      const at = t + n.step * EIGHTH;
      const f = noteFreq(n.midi);
      this.note('triangle', f, at, n.length * EIGHTH + 0.5, 0.09, 0.008);
      this.note('sine', f * 2, at, 0.3, 0.02, 0.004);
    }
  }

  private note(type: OscillatorType, freq: number, at: number, dur: number, peak: number, attack: number): void {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const atk = Math.min(attack, dur * 0.5);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g);
    g.connect(this.gate);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }
}
