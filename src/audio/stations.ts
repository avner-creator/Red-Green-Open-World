/**
 * Procedural radio stations: one small step-sequencer (16 steps per bar, look-ahead scheduling)
 * driven by data. Each station is a `GenSpec` with its own tempo, chords, drum patterns and
 * timbres, so they sound clearly different. Everything is synthesized; no files.
 */
import { mulberry32, noteFreq } from './music-theory';
import type { GenStationId } from './radio';

interface Chord {
  bass: number;
  tones: readonly number[];
}

export interface GenSpec {
  bpm: number;
  /** Delay of odd 16th steps as a fraction of a step (0 = straight). */
  swing: number;
  chords: readonly Chord[];
  /** Pattern strings, 16 chars: 'x' hit, 'X' accent, '.' rest. */
  kick: string;
  snare: string;
  hat: string;
  openHat: string;
  /** Bass: 'x' root, 'o' octave up, '5' fifth. */
  bass: string;
  /** Chord stab on these steps. */
  stab: string;
  /** Arpeggio: digits index the chord tones (+1 octave), '.' rest. */
  arp: string;
  /** Lead may play on 'x' steps with `leadChance`. */
  leadSteps: string;
  leadChance: number;
  scale: readonly number[];
  leadRoot: number;
  wave: { bass: OscillatorType; stab: OscillatorType; arp: OscillatorType; lead: OscillatorType };
  /** Peak levels. */
  mix: { bass: number; stab: number; arp: number; lead: number; kick: number; snare: number; hat: number };
  /** Lead notes slide up into pitch by this ratio (silly "boing"); 1 = none. */
  leadSlide?: number;
  /** Overall level trim. */
  level: number;
}

const SPECS: Record<GenStationId, GenSpec> = {
  // Bouncy oompah with a calliope tune.
  carnival: {
    bpm: 126,
    swing: 0.12,
    chords: [
      { bass: 36, tones: [60, 64, 67] },
      { bass: 41, tones: [60, 65, 69] },
      { bass: 43, tones: [59, 62, 67] },
      { bass: 36, tones: [60, 64, 67] },
    ],
    kick: 'x...........x...',
    snare: '....x.......x...',
    hat: 'x.x.x.x.x.x.x.x.',
    openHat: '................',
    bass: 'x.......x.......',
    stab: '....x.......x...',
    arp: '................',
    leadSteps: 'x.x.x.x.x.x.x.x.',
    leadChance: 0.8,
    scale: [0, 2, 4, 5, 7, 9, 11],
    leadRoot: 72,
    wave: { bass: 'triangle', stab: 'square', arp: 'triangle', lead: 'square' },
    mix: { bass: 0.14, stab: 0.035, arp: 0.03, lead: 0.05, kick: 0.22, snare: 0.1, hat: 0.04 },
    level: 0.9,
  },
  // Slow, sunny and swingy.
  beach: {
    bpm: 94,
    swing: 0.22,
    chords: [
      { bass: 36, tones: [59, 64, 67, 71] },
      { bass: 33, tones: [57, 60, 64, 67] },
      { bass: 38, tones: [57, 60, 65, 69] },
      { bass: 43, tones: [59, 62, 65, 69] },
    ],
    kick: 'x.......x.x.....',
    snare: '................',
    hat: 'x.x.x.x.x.x.x.x.',
    openHat: '................',
    bass: 'x.....5.x.......',
    stab: '................',
    arp: '0.1.2.3.2.1.2.3.',
    leadSteps: 'x...x...x...x...',
    leadChance: 0.5,
    scale: [0, 2, 4, 7, 9],
    leadRoot: 72,
    wave: { bass: 'sine', stab: 'sine', arp: 'sine', lead: 'triangle' },
    mix: { bass: 0.16, stab: 0.03, arp: 0.045, lead: 0.07, kick: 0.16, snare: 0.0, hat: 0.022 },
    level: 1,
  },
  // Four on the floor, bouncing bass, offbeat stabs.
  disco: {
    bpm: 118,
    swing: 0,
    chords: [
      { bass: 33, tones: [57, 60, 64, 67] },
      { bass: 38, tones: [57, 62, 66, 69] },
      { bass: 31, tones: [55, 59, 62, 66] },
      { bass: 36, tones: [55, 59, 64, 67] },
    ],
    kick: 'x...x...x...x...',
    snare: '....x.......x...',
    hat: '................',
    openHat: '..x...x...x...x.',
    bass: 'xxoxxxoxxxoxxxox',
    stab: '..x...x...x...x.',
    arp: '................',
    leadSteps: 'x..x..x.x..x..x.',
    leadChance: 0.55,
    scale: [0, 3, 5, 7, 10],
    leadRoot: 69,
    wave: { bass: 'sawtooth', stab: 'sawtooth', arp: 'triangle', lead: 'square' },
    mix: { bass: 0.09, stab: 0.03, arp: 0.03, lead: 0.045, kick: 0.26, snare: 0.1, hat: 0.05 },
    level: 0.9,
  },
  // Spooky but silly: plinky tiptoe bass, boingy lead.
  spooky: {
    bpm: 100,
    swing: 0.1,
    chords: [
      { bass: 33, tones: [57, 60, 64] },
      { bass: 32, tones: [56, 60, 63] },
      { bass: 29, tones: [53, 57, 60] },
      { bass: 31, tones: [55, 58, 62] },
    ],
    kick: 'x.......x.......',
    snare: '................',
    hat: '....x.......x...',
    openHat: '................',
    bass: 'x..x..x.x..x..5.',
    stab: '..x.......x.....',
    arp: '0..1..2..3..2.1.',
    leadSteps: 'x...x.x...x.x...',
    leadChance: 0.6,
    scale: [0, 2, 3, 6, 7, 8, 11],
    leadRoot: 69,
    wave: { bass: 'triangle', stab: 'triangle', arp: 'sine', lead: 'triangle' },
    mix: { bass: 0.13, stab: 0.05, arp: 0.04, lead: 0.08, kick: 0.15, snare: 0.0, hat: 0.05 },
    leadSlide: 0.94,
    level: 1,
  },
  // Chiptune: squares, fast arps, tiny drums.
  arcade: {
    bpm: 142,
    swing: 0,
    chords: [
      { bass: 36, tones: [60, 64, 67] },
      { bass: 43, tones: [59, 62, 67] },
      { bass: 33, tones: [57, 60, 64] },
      { bass: 41, tones: [57, 60, 65] },
    ],
    kick: 'x.....x.x.....x.',
    snare: '....x.......x...',
    hat: 'x.x.x.x.x.x.x.x.',
    openHat: '................',
    bass: 'x.x.o.x.x.x.o.x.',
    stab: '................',
    arp: '0120120201201202',
    leadSteps: 'x.xxx.x.x.xxx.x.',
    leadChance: 0.6,
    scale: [0, 2, 4, 7, 9],
    leadRoot: 76,
    wave: { bass: 'triangle', stab: 'square', arp: 'square', lead: 'square' },
    mix: { bass: 0.15, stab: 0.03, arp: 0.022, lead: 0.035, kick: 0.2, snare: 0.08, hat: 0.03 },
    level: 0.85,
  },
};

export function genSpec(id: GenStationId): GenSpec {
  return SPECS[id];
}

export const GEN_STATION_IDS = Object.keys(SPECS) as GenStationId[];

const LOOKAHEAD = 1.0;

/** One procedural station. Silent until `setOn(true)`; keeps scheduling only while audible. */
export class StationPlayer {
  private on = false;
  private nextTime = 0;
  private step = 0;
  private bar = 0;
  private leadIdx = 2;
  private readonly rng: () => number;
  private readonly gate: GainNode;
  private readonly spec: GenSpec;

  constructor(
    private readonly ctx: AudioContext,
    out: AudioNode,
    private readonly noise: AudioBuffer,
    id: GenStationId,
    seed: number,
  ) {
    this.spec = SPECS[id];
    this.rng = mulberry32(seed);
    this.gate = ctx.createGain();
    this.gate.gain.value = 0;
    this.gate.connect(out);
  }

  setOn(on: boolean, fade = 0.6): void {
    if (on === this.on) return;
    this.on = on;
    const now = this.ctx.currentTime;
    this.gate.gain.cancelScheduledValues(now);
    this.gate.gain.setTargetAtTime(on ? this.spec.level : 0, now, Math.max(0.02, fade / 3));
    if (on) {
      this.nextTime = now + 0.08;
      this.step = 0;
      this.bar = 0;
    }
  }

  get isOn(): boolean {
    return this.on;
  }

  update(): void {
    const now = this.ctx.currentTime;
    if (!this.on) return; // fading out: no new notes
    if (this.nextTime < now) this.nextTime = now + 0.05;
    const stepDur = 60 / this.spec.bpm / 4;
    while (this.nextTime < now + LOOKAHEAD) {
      const swung = this.step % 2 === 1 ? stepDur * this.spec.swing : 0;
      this.playStep(this.step, this.bar, this.nextTime + swung, stepDur);
      this.nextTime += stepDur;
      this.step++;
      if (this.step >= 16) {
        this.step = 0;
        this.bar++;
      }
    }
  }

  private playStep(s: number, bar: number, t: number, stepDur: number): void {
    const sp = this.spec;
    const chord = sp.chords[bar % sp.chords.length];
    if (!chord) return;
    const hit = (p: string): string => p.charAt(s);
    if (hit(sp.kick) !== '.') this.kick(t, sp.mix.kick * (hit(sp.kick) === 'X' ? 1.2 : 1));
    if (sp.mix.snare > 0 && hit(sp.snare) !== '.') this.snare(t, sp.mix.snare);
    if (hit(sp.hat) !== '.') this.hat(t, sp.mix.hat, 0.04);
    if (hit(sp.openHat) !== '.') this.hat(t, sp.mix.hat * 1.1, 0.18);
    const b = hit(sp.bass);
    if (b !== '.') {
      const m = b === 'o' ? chord.bass + 12 : b === '5' ? chord.bass + 7 : chord.bass;
      this.note(sp.wave.bass, noteFreq(m), t, stepDur * 2.6, sp.mix.bass, 0.01);
    }
    if (hit(sp.stab) !== '.') for (const m of chord.tones) this.note(sp.wave.stab, noteFreq(m), t, stepDur * 1.6, sp.mix.stab, 0.004);
    const a = hit(sp.arp);
    if (a !== '.') {
      const i = Number(a) % chord.tones.length;
      this.note(sp.wave.arp, noteFreq((chord.tones[i] ?? 60) + 12), t, stepDur * 2.2, sp.mix.arp, 0.004);
    }
    if (hit(sp.leadSteps) === 'x' && this.rng() < sp.leadChance * (bar % 4 === 3 ? 0.5 : 1)) {
      const walk = [-2, -1, -1, 0, 1, 1, 2];
      this.leadIdx = Math.min(8, Math.max(-2, this.leadIdx + (walk[Math.floor(this.rng() * walk.length)] ?? 0)));
      const len = sp.scale.length;
      const oct = Math.floor(this.leadIdx / len);
      const midi = sp.leadRoot + 12 * oct + (sp.scale[this.leadIdx - oct * len] ?? 0);
      this.note(sp.wave.lead, noteFreq(midi), t, stepDur * 3, sp.mix.lead, 0.006, sp.leadSlide);
    }
  }

  private note(type: OscillatorType, freq: number, at: number, dur: number, peak: number, attack: number, slide = 1): void {
    if (peak <= 0) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    if (slide !== 1) {
      osc.frequency.setValueAtTime(freq * slide, at);
      osc.frequency.exponentialRampToValueAtTime(freq, at + 0.07);
    } else {
      osc.frequency.value = freq;
    }
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

  private kick(at: number, peak: number): void {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, at);
    osc.frequency.exponentialRampToValueAtTime(45, at + 0.12);
    g.gain.setValueAtTime(peak, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
    osc.connect(g);
    g.connect(this.gate);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
    osc.start(at);
    osc.stop(at + 0.25);
  }

  private snare(at: number, peak: number): void {
    this.noiseHit(at, peak, 0.12, 1800, 'bandpass');
  }

  private hat(at: number, peak: number, dur: number): void {
    this.noiseHit(at, peak, dur, 7000, 'highpass');
  }

  private noiseHit(at: number, peak: number, dur: number, freq: number, type: BiquadFilterType): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.gate);
    src.onended = () => {
      src.disconnect();
      f.disconnect();
      g.disconnect();
    };
    src.start(at, Math.random() * 0.5);
    src.stop(at + dur + 0.02);
  }
}

/** All procedural stations, created lazily; at most one is on at a time. */
export class StationBank {
  private readonly players = new Map<GenStationId, StationPlayer>();
  private active: GenStationId | null = null;

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
    private readonly noise: AudioBuffer,
  ) {}

  /** Switch to a procedural station (null = none). Previous one fades out over `fade`. */
  play(id: GenStationId | null, fade: number): void {
    if (id === this.active) return;
    if (this.active) this.players.get(this.active)?.setOn(false, fade);
    this.active = id;
    if (id === null) return;
    let p = this.players.get(id);
    if (!p) {
      p = new StationPlayer(this.ctx, this.out, this.noise, id, (Date.now() & 0xffff) + GEN_STATION_IDS.indexOf(id) + 1);
      this.players.set(id, p);
    }
    p.setOn(true, fade);
  }

  get current(): GenStationId | null {
    return this.active;
  }

  update(): void {
    if (this.active) this.players.get(this.active)?.update();
  }
}
