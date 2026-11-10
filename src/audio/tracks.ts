/**
 * Streams in the CC0 music loops lazily (fetch + decode, only after Play), loops them
 * sample-accurately with AudioBufferSourceNode and equal-power cross-fades between them.
 * Never throws; a track that fails to load is remembered so callers can fall back.
 */

export type TrackId = 'explore' | 'action' | 'air' | 'urgent' | 'jingle';

export const TRACK_FILES: Record<TrackId, string> = {
  explore: 'assets/audio/music-explore.ogg',
  action: 'assets/audio/music-action.ogg',
  air: 'assets/audio/music-air.ogg',
  urgent: 'assets/audio/music-urgent.ogg',
  jingle: 'assets/audio/jingle-win.ogg',
};

/** Per-track level trims (the files are already loudness-matched). */
const TRACK_GAIN: Record<TrackId, number> = { explore: 1, action: 0.95, air: 1.05, urgent: 1, jingle: 1.2 };
/** Cues that start from the top every time instead of resuming. */
const RESTART: ReadonlySet<TrackId> = new Set<TrackId>(['urgent', 'jingle']);

interface Voice {
  id: TrackId;
  src: AudioBufferSourceNode;
  /** Each fade gets its own GainNode, so a fade-out never overlaps a running fade-in curve. */
  fadeIn: GainNode;
  fadeOut: GainNode;
  startedAt: number;
  offset: number;
  duration: number;
}

const CURVE_POINTS = 48;
function equalPowerCurve(fadeIn: boolean, level = 1): Float32Array {
  const c = new Float32Array(CURVE_POINTS);
  for (let i = 0; i < CURVE_POINTS; i++) {
    const x = i / (CURVE_POINTS - 1);
    c[i] = level * (fadeIn ? Math.sin((x * Math.PI) / 2) : Math.cos((x * Math.PI) / 2));
  }
  return c;
}

export class TrackPlayer {
  private readonly buffers = new Map<TrackId, AudioBuffer>();
  private readonly loading = new Map<TrackId, Promise<AudioBuffer | null>>();
  private readonly failed = new Set<TrackId>();
  private readonly offsets = new Map<TrackId, number>();
  private current: Voice | null = null;
  private wanted: TrackId | null = null;
  private wantedFade = 1.5;

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
    private readonly baseUrl: string,
  ) {}

  hasFailed(id: TrackId): boolean {
    return this.failed.has(id);
  }

  isLoaded(id: TrackId): boolean {
    return this.buffers.has(id);
  }

  /** The loop that is playing (or about to play once loaded). */
  get target(): TrackId | null {
    return this.wanted;
  }

  load(id: TrackId): Promise<AudioBuffer | null> {
    const have = this.buffers.get(id);
    if (have) return Promise.resolve(have);
    const pending = this.loading.get(id);
    if (pending) return pending;
    const p = this.fetchDecode(id)
      .then((buf) => {
        this.buffers.set(id, buf);
        // It arrived while wanted: start it now.
        if (this.wanted === id && this.current?.id !== id) this.startVoice(id, this.wantedFade);
        return buf;
      })
      .catch(() => {
        this.failed.add(id);
        return null;
      });
    this.loading.set(id, p);
    return p;
  }

  private async fetchDecode(id: TrackId): Promise<AudioBuffer> {
    const res = await fetch(this.baseUrl + TRACK_FILES[id]);
    if (!res.ok) throw new Error(`music ${id}: HTTP ${res.status}`);
    const data = await res.arrayBuffer();
    // Callback form for old Safari, promise form everywhere else.
    return await new Promise<AudioBuffer>((resolve, reject) => {
      const r = this.ctx.decodeAudioData(data, resolve, reject) as Promise<AudioBuffer> | undefined;
      r?.then(resolve, reject);
    });
  }

  /** Cross-fade to a loop (null = fade to silence). Keeps the old loop until the new one is ready. */
  play(id: TrackId | null, fade = 1.5): void {
    if (id === this.wanted && (id === null || this.current?.id === id)) return;
    this.wanted = id;
    this.wantedFade = fade;
    if (id !== null && this.current?.id === id) return; // already playing: cancel any pending switch
    if (id === null) {
      this.fadeOut(fade);
      return;
    }
    if (this.buffers.has(id)) this.startVoice(id, fade);
    else void this.load(id);
  }

  /** One-shot (the win jingle). Returns false when it is not loaded. */
  oneShot(id: TrackId): boolean {
    const buf = this.buffers.get(id);
    if (!buf) return false;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    const g = this.ctx.createGain();
    src.buffer = buf;
    g.gain.value = TRACK_GAIN[id];
    src.connect(g);
    g.connect(this.out);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
    src.start(now + 0.02);
    return true;
  }

  private startVoice(id: TrackId, fade: number): void {
    const buf = this.buffers.get(id);
    if (!buf) return;
    const now = this.ctx.currentTime;
    this.fadeOut(fade);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = id !== 'jingle';
    const fadeIn = this.ctx.createGain();
    const fadeOut = this.ctx.createGain();
    fadeIn.gain.setValueAtTime(0, now);
    fadeIn.gain.setValueCurveAtTime(equalPowerCurve(true, TRACK_GAIN[id]), now + 0.01, Math.max(0.05, fade));
    src.connect(fadeIn);
    fadeIn.connect(fadeOut);
    fadeOut.connect(this.out);
    const offset = RESTART.has(id) ? 0 : (this.offsets.get(id) ?? 0) % buf.duration;
    src.start(now + 0.01, offset);
    this.current = { id, src, fadeIn, fadeOut, startedAt: now + 0.01, offset, duration: buf.duration };
  }

  private fadeOut(fade: number): void {
    const v = this.current;
    if (!v) return;
    this.current = null;
    const now = this.ctx.currentTime;
    const played = Math.max(0, now - v.startedAt);
    this.offsets.set(v.id, (v.offset + played) % v.duration);
    try {
      v.fadeOut.gain.setValueAtTime(1, now);
      v.fadeOut.gain.setValueCurveAtTime(equalPowerCurve(false), now + 0.005, Math.max(0.05, fade));
      v.src.stop(now + fade + 0.1);
    } catch {
      v.src.stop();
    }
    v.src.onended = () => {
      v.src.disconnect();
      v.fadeIn.disconnect();
      v.fadeOut.disconnect();
    };
  }

  stopAll(fade = 0.4): void {
    this.wanted = null;
    this.fadeOut(fade);
  }
}
