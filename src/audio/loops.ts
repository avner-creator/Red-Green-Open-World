import { clamp01 } from './gain';

export type LoopName = 'wind' | 'engine' | 'gallop';

interface LoopNodes {
  gain: GainNode;
  /** Update continuous params. */
  set(intensity: number, pitch: number, now: number): void;
  stop(): void;
}

interface LoopState {
  nodes: LoopNodes;
  /** Context time after which the (faded-out) nodes are freed. */
  killAt: number | null;
}

const RAMP = 0.12; // smoothing time constant

function makeWind(ctx: AudioContext, out: AudioNode, noise: AudioBuffer): LoopNodes {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.Q.value = 0.9;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  src.connect(filt);
  filt.connect(gain);
  gain.connect(out);
  src.start();
  return {
    gain,
    set(i, _p, now) {
      gain.gain.setTargetAtTime(0.5 * i * i + 0.05 * i, now, RAMP);
      filt.frequency.setTargetAtTime(250 + 2600 * i, now, RAMP);
    },
    stop() {
      src.stop();
      src.disconnect();
      filt.disconnect();
      gain.disconnect();
    },
  };
}

function makeEngine(ctx: AudioContext, out: AudioNode): LoopNodes {
  const a = ctx.createOscillator();
  const b = ctx.createOscillator();
  a.type = 'sawtooth';
  b.type = 'square';
  b.detune.value = 9;
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 420;
  filt.Q.value = 1.2;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  a.connect(filt);
  b.connect(filt);
  filt.connect(gain);
  gain.connect(out);
  a.start();
  b.start();
  return {
    gain,
    set(i, p, now) {
      const f = 38 + 55 * p;
      a.frequency.setTargetAtTime(f, now, RAMP);
      b.frequency.setTargetAtTime(f * 1.003, now, RAMP);
      filt.frequency.setTargetAtTime(300 + 400 * p, now, RAMP);
      gain.gain.setTargetAtTime(0.07 + 0.06 * i, now, RAMP);
    },
    stop() {
      a.stop();
      b.stop();
      a.disconnect();
      b.disconnect();
      filt.disconnect();
      gain.disconnect();
    },
  };
}

/** Gallop is clip-clops scheduled from `tick`; its bus is a plain gain node. */
function makeGallop(ctx: AudioContext, out: AudioNode): LoopNodes {
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(out);
  return {
    gain,
    set(i, _p, now) {
      gain.gain.setTargetAtTime(i, now, RAMP);
    },
    stop() {
      gain.disconnect();
    },
  };
}

/** Manages the continuous sounds; call `update` every frame. */
export class Loops {
  private readonly loops = new Map<LoopName, LoopState>();
  private readonly params = new Map<LoopName, { intensity: number; pitch: number }>();
  private gallopTimer = 0;
  private gallopStep = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
    private readonly noise: AudioBuffer,
  ) {}

  set(name: LoopName, intensity: number, pitch: number): void {
    const i = clamp01(intensity);
    const p = Math.min(2.5, Math.max(0.3, Number.isFinite(pitch) ? pitch : 1));
    const now = this.ctx.currentTime;
    let st = this.loops.get(name);
    if (i < 0.001) {
      this.params.delete(name);
      if (st && st.killAt === null) {
        st.nodes.gain.gain.cancelScheduledValues(now);
        st.nodes.gain.gain.setTargetAtTime(0, now, 0.08);
        st.killAt = now + 0.6;
      }
      return;
    }
    this.params.set(name, { intensity: i, pitch: p });
    if (!st) {
      st = { nodes: this.build(name), killAt: null };
      this.loops.set(name, st);
    }
    st.killAt = null;
    st.nodes.set(i, p, now);
  }

  private build(name: LoopName): LoopNodes {
    switch (name) {
      case 'wind':
        return makeWind(this.ctx, this.out, this.noise);
      case 'engine':
        return makeEngine(this.ctx, this.out);
      case 'gallop':
        return makeGallop(this.ctx, this.out);
    }
  }

  /** Free faded-out loops and run the gallop rhythm. */
  update(dt: number): void {
    const now = this.ctx.currentTime;
    for (const [name, st] of this.loops) {
      if (st.killAt !== null && now >= st.killAt) {
        st.nodes.stop();
        this.loops.delete(name);
      }
    }
    const g = this.params.get('gallop');
    const gl = this.loops.get('gallop');
    if (g && gl && gl.killAt === null) {
      this.gallopTimer -= dt;
      if (this.gallopTimer <= 0) {
        this.gallopTimer += 0.16 / g.pitch;
        if (this.gallopTimer < 0) this.gallopTimer = 0;
        this.clop(gl.nodes.gain, now + 0.01, this.gallopStep % 4);
        this.gallopStep++;
      }
    } else {
      this.gallopTimer = 0;
    }
  }

  /** One soft hoof: a short woody blip plus a dull noise tap. Beat 3 of 4 is a rest. */
  private clop(bus: AudioNode, at: number, beat: number): void {
    if (beat === 3) return;
    const f = beat === 0 ? 210 : beat === 1 ? 260 : 235;
    const c = this.ctx;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f * 1.6, at);
    osc.frequency.exponentialRampToValueAtTime(f, at + 0.04);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(0.35, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
    osc.connect(g);
    g.connect(bus);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
    osc.start(at);
    osc.stop(at + 0.1);
  }

  stopAll(): void {
    for (const name of ['wind', 'engine', 'gallop'] as const) this.set(name, 0, 1);
  }

  dispose(): void {
    for (const st of this.loops.values()) st.nodes.stop();
    this.loops.clear();
    this.params.clear();
  }
}
