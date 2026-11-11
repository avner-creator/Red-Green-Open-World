import type { AudioApi, GameContext, SfxName } from '../types';
import { mountRadio } from '../ui/radio';
import { GemCombo, isBigGem } from './combo';
import { playExtra, type ExtraSfx } from './fx';
import { landVolume, volumeToGain } from './gain';
import { RateLimiter, VoiceCounter } from './limiter';
import { Loops, type LoopName } from './loops';
import { Music } from './music';
import { MusicDirector, type MusicCue } from './music-state';
import { getRadio, RADIO_FADE, type GenStationId } from './radio';
import { StationBank } from './stations';
import { TrackPlayer, type TrackId } from './tracks';
import { createNoiseBuffer, playSfx, Synth } from './synth';

const MAX_VOICES = 14;
const MIN_GAP = 0.04;
/** Level of the soft generative title theme. */
const GEN_LEVEL = 0.55;
/** Level of the streamed loops (loudness-matched files, about -16 dBFS RMS). */
const TRACK_LEVEL = 0.42;
const CROSSFADE = 1.5;
/** Seconds left when the urgent loop is fetched ahead of time. */
const URGENT_PRELOAD_AT = 75;
const WHOOP_HEIGHT = 30;
/** Car-radio low-pass (Hz): wide open on foot, a little boxy in the buggy. */
const CAR_OPEN = 20000;
const CAR_CLOSED = 3200;

/** Music ducking under big moments: [level, hold seconds]. */
const DUCK: Partial<Record<SfxName | ExtraSfx, readonly [number, number]>> = {
  fanfare: [0.35, 2.4],
  chest: [0.55, 0.9],
  cheer: [0.5, 1.2],
  kaching: [0.55, 0.7],
  whoop: [0.6, 0.8],
  bigBoing: [0.65, 0.6],
  star: [0.7, 0.5],
};

const CUE_TRACK: Partial<Record<MusicCue, TrackId>> = {
  explore: 'explore',
  action: 'action',
  air: 'air',
  urgent: 'urgent',
};

interface Engine {
  ctx: AudioContext;
  master: GainNode;
  sfxBus: GainNode;
  musicBus: GainNode;
  pauseGain: GainNode;
  duckGain: GainNode;
  synth: Synth;
  loops: Loops;
  music: Music;
  tracks: TrackPlayer;
  stations: StationBank;
  /** Low-pass on all music: the car-radio sound while driving. */
  carFilter: BiquadFilterNode;
}

type AudioCtor = new () => AudioContext;

function findAudioContext(): AudioCtor | null {
  if (typeof globalThis === 'undefined') return null;
  const g = globalThis as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

function baseUrl(): string {
  try {
    return import.meta.env.BASE_URL ?? './';
  } catch {
    return './';
  }
}

const ATTRACTION_STUNTS: ReadonlySet<string> = new Set(['carnival', 'scoops', 'race', 'sky', 'bumper', 'foam']);

export function createAudio(ctx: Pick<GameContext, 'settings' | 'events' | 'testMode'>): AudioApi {
  let engine: Engine | null = null;
  let failed = false;
  /** setMusic(false) from outside mutes music regardless of the director. */
  let musicEnabled = true;
  let appliedCue: MusicCue = 'none';
  /** Station the music was last synced to (re-sync when the radio changes). */
  let appliedStation = getRadio().current;
  let inCar = false;
  /** Seconds since creation (driven by update), used for combos and the music director. */
  let clock = 0;
  let urgentRequested = false;
  const limiter = new RateLimiter(MIN_GAP);
  const voices = new VoiceCounter(MAX_VOICES);
  const combo = new GemCombo();
  const director = new MusicDirector();

  function applyVolumes(): void {
    if (!engine) return;
    const s = ctx.settings.get();
    const now = engine.ctx.currentTime;
    engine.master.gain.setTargetAtTime(volumeToGain(s.volumeMaster), now, 0.03);
    engine.sfxBus.gain.setTargetAtTime(volumeToGain(s.volumeSfx), now, 0.03);
    engine.musicBus.gain.setTargetAtTime(volumeToGain(s.volumeMusic), now, 0.05);
  }

  function applyPause(): void {
    if (!engine) return;
    engine.pauseGain.gain.setTargetAtTime(director.level(), engine.ctx.currentTime, 0.25);
  }

  function duck(name: SfxName | ExtraSfx): void {
    const d = DUCK[name];
    if (!engine || !d) return;
    const g = engine.duckGain.gain;
    const now = engine.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(d[0], now, 0.04);
    g.setTargetAtTime(1, now + d[1], 0.35);
  }

  /** Music under a voice line: down to `level`, back to 1 after `seconds`. */
  function duckMusic(level: number, seconds: number): void {
    if (!engine || !Number.isFinite(level) || !Number.isFinite(seconds)) return;
    const g = engine.duckGain.gain;
    const now = engine.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setTargetAtTime(Math.max(0, Math.min(1, level)), now, 0.06);
    g.setTargetAtTime(1, now + Math.max(0, seconds), 0.35);
  }

  function build(): void {
    if (engine || failed || ctx.testMode) return;
    const Ctor = findAudioContext();
    if (!Ctor) {
      failed = true;
      return;
    }
    try {
      const ac = new Ctor();
      const master = ac.createGain();
      // Glue compressor, then a fast brick-wall-ish limiter so stacked rewards never clip.
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 12;
      comp.ratio.value = 6;
      comp.attack.value = 0.004;
      comp.release.value = 0.2;
      const limit = ac.createDynamicsCompressor();
      limit.threshold.value = -2;
      limit.knee.value = 0;
      limit.ratio.value = 20;
      limit.attack.value = 0.001;
      limit.release.value = 0.08;
      master.connect(comp);
      comp.connect(limit);
      limit.connect(ac.destination);
      const sfxBus = ac.createGain();
      const musicBus = ac.createGain();
      const pauseGain = ac.createGain();
      const duckGain = ac.createGain();
      sfxBus.connect(master);
      const carFilter = ac.createBiquadFilter();
      carFilter.type = 'lowpass';
      carFilter.frequency.value = CAR_OPEN;
      carFilter.Q.value = 0.7;
      musicBus.connect(carFilter);
      carFilter.connect(pauseGain);
      pauseGain.connect(duckGain);
      duckGain.connect(master);
      const genGain = ac.createGain();
      genGain.gain.value = GEN_LEVEL;
      genGain.connect(musicBus);
      const trackGain = ac.createGain();
      trackGain.gain.value = TRACK_LEVEL;
      trackGain.connect(musicBus);
      const noise = createNoiseBuffer(ac);
      engine = {
        ctx: ac,
        master,
        sfxBus,
        musicBus,
        pauseGain,
        duckGain,
        synth: new Synth(ac, sfxBus, noise),
        loops: new Loops(ac, sfxBus, noise),
        music: new Music(ac, genGain, (Date.now() & 0xffff) + 1),
        tracks: new TrackPlayer(ac, trackGain, baseUrl()),
        stations: new StationBank(ac, genGain, noise),
        carFilter,
      };
      director.unlock();
      applyCar();
      applyVolumes();
      applyPause();
    } catch {
      engine = null;
      failed = true;
    }
  }

  const running = (): boolean => !!engine && engine.ctx.state === 'running';

  function play(name: SfxName, opts?: { volume?: number; pitch?: number }): void {
    if (name === 'boing') director.bounce(1, clock);
    else if (name === 'bigBoing') director.bounce(2, clock);
    if (!engine || !running()) return;
    try {
      const now = engine.ctx.currentTime;
      if (!limiter.allow(name, now)) return;
      const volume = opts?.volume ?? 1;
      if (!(volume > 0.001)) return;
      const pitch = Math.min(4, Math.max(0.25, opts?.pitch ?? 1));
      if (voices.active(now) >= MAX_VOICES) return;
      const dur = playSfx(engine.synth, name, now + 0.005, Math.min(2, volume), pitch);
      voices.tryAdd(now, dur);
      duck(name);
    } catch {
      /* never throw */
    }
  }

  function playX(name: ExtraSfx, volume = 1, step = 0): void {
    if (!engine || !running()) return;
    try {
      const now = engine.ctx.currentTime;
      if (!limiter.allow(name, now)) return;
      if (voices.active(now) >= MAX_VOICES) return;
      const dur = playExtra(engine.synth, name, now + 0.005, volume, step);
      voices.tryAdd(now, dur);
      duck(name);
    } catch {
      /* never throw */
    }
  }

  /** Make the music match the director's cue and the radio (idempotent, called every frame). */
  function syncMusic(): void {
    if (!engine) return;
    const cue = musicEnabled ? director.update(clock) : 'none';
    const station = getRadio().station;
    // A chosen station replaces the in-game music, but not the quiet before the first gesture,
    // the title theme or the moment after the end jingle.
    const override = station.kind !== 'auto' && cue !== 'none' && cue !== 'title';
    const { tracks, music, stations } = engine;
    const track: TrackId | undefined = override ? (station.kind === 'track' ? station.track : undefined) : CUE_TRACK[cue];
    if (cue !== appliedCue || station.id !== appliedStation) {
      const gen: GenStationId | null = override && station.kind === 'gen' ? (station.id as GenStationId) : null;
      const fade = station.id !== appliedStation ? RADIO_FADE : cue === 'none' ? 0.6 : cue === 'urgent' ? 1 : CROSSFADE;
      tracks.play(track ?? null, fade);
      stations.play(gen, fade);
      appliedCue = cue;
      appliedStation = station.id;
    }
    // The soft generative theme plays on the title, and stands in if a loop cannot load.
    const failed = track !== undefined && tracks.hasFailed(track);
    music.setOn(override ? failed : cue === 'title' || failed);
  }

  /** Short tuning blip when the station changes. */
  function tuningBlip(): void {
    if (!engine || !running()) return;
    try {
      const ac = engine.ctx;
      const now = ac.currentTime + 0.01;
      const chirps: [number, number][] = [[700, 1500], [1100, 520]];
      chirps.forEach(([f0, f1], i) => {
        const at = now + i * 0.07;
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(f0, at);
        osc.frequency.exponentialRampToValueAtTime(f1, at + 0.06);
        g.gain.setValueAtTime(0.0001, at);
        g.gain.linearRampToValueAtTime(0.05, at + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.07);
        osc.connect(g);
        g.connect(engine!.sfxBus);
        osc.onended = () => {
          osc.disconnect();
          g.disconnect();
        };
        osc.start(at);
        osc.stop(at + 0.09);
      });
    } catch {
      /* never throw */
    }
  }

  function applyCar(): void {
    if (!engine) return;
    engine.carFilter.frequency.setTargetAtTime(inCar ? CAR_CLOSED : CAR_OPEN, engine.ctx.currentTime, 0.2);
  }

  function preloadSession(): void {
    if (!engine) return;
    const t = engine.tracks;
    // Explore first (it plays right away), then the small ones, then the action loop.
    void t
      .load('explore')
      .then(() => t.load('jingle'))
      .then(() => t.load('air'))
      .then(() => t.load('action'));
  }

  const ev = ctx.events;
  ev.on('settings:changed', () => applyVolumes());
  ev.on('gem:collected', (e) => {
    const hit = combo.hit(clock);
    playX('combo', 1, hit.step);
    if (isBigGem(e.count, e.total, hit)) playX('kaching', 0.9);
  });
  ev.on('gem:near', () => play('gemNear'));
  ev.on('player:jump', () => play('jump'));
  ev.on('player:land', (e) => {
    const v = landVolume(e.speed);
    if (v > 0) play('land', { volume: v });
  });
  ev.on('player:flop', () => play('flop'));
  ev.on('player:mode', (e) => {
    director.setMode(e.mode);
    if (e.mode !== 'flop') {
      inCar = e.mode === 'driving';
      applyCar();
    }
  });
  getRadio().subscribe(() => {
    try {
      syncMusic();
      tuningBlip();
    } catch {
      /* never throw */
    }
  });
  ev.on('chest:key', () => play('key'));
  ev.on('chest:opened', () => {
    play('chest');
    playX('cheer', 0.9);
  });
  ev.on('stunt', (e) => {
    director.stunt(e.kind, clock);
    play('star');
    if (e.kind === 'bigBounce' && e.value >= WHOOP_HEIGHT) playX('whoop');
    // Hitting a target, or finishing an attraction round with stars: the crowd cheers.
    if (e.kind === 'bullseye' || (e.stars > 0 && ATTRACTION_STUNTS.has(e.kind))) playX('cheer');
  });
  ev.on('vehicle:bump', (e) => play('bump', { volume: Math.min(1, 0.4 + e.speed / 12) }));
  ev.on('session:tick', (e) => {
    director.tick(e.remaining);
    if (engine && !urgentRequested && e.remaining <= URGENT_PRELOAD_AT) {
      urgentRequested = true;
      void engine.tracks.load('urgent');
    }
  });
  ev.on('session:phase', ({ phase, previous }) => {
    director.setPhase(phase, previous, clock);
    if (phase === 'playing' && previous !== 'paused') {
      combo.reset();
      urgentRequested = false;
      play('start');
      preloadSession();
    } else if (phase === 'ended') {
      engine?.loops.stopAll();
      // Cut the loop quickly so the win jingle owns the moment.
      engine?.tracks.stopAll(0.35);
      engine?.stations.play(null, 0.35);
      appliedCue = 'none';
      if (!engine?.tracks.oneShot('jingle')) play('fanfare');
      else duck('fanfare');
      playX('cheer', 0.55);
    } else if (phase === 'title') {
      engine?.loops.stopAll();
    }
    applyPause();
    syncMusic();
  });

  const api: AudioApi = {
    unlock() {
      try {
        build();
        if (engine && engine.ctx.state === 'suspended') void engine.ctx.resume().catch(() => undefined);
        syncMusic();
      } catch {
        /* never throw */
      }
    },
    play,
    duckMusic(level: number, seconds: number) {
      try {
        duckMusic(level, seconds);
      } catch {
        /* never throw */
      }
    },
    setLoop(name: LoopName, intensity: number, pitch = 1) {
      if (!engine || !running()) return;
      try {
        engine.loops.set(name, intensity, pitch);
      } catch {
        /* never throw */
      }
    },
    setMusic(on: boolean) {
      musicEnabled = on;
      try {
        syncMusic();
      } catch {
        /* never throw */
      }
    },
    update(dt: number) {
      if (Number.isFinite(dt) && dt > 0) clock += Math.min(dt, 1);
      if (!engine) return;
      try {
        engine.loops.update(dt);
        syncMusic();
        engine.music.update();
        engine.stations.update();
      } catch {
        /* never throw */
      }
    },
  };

  // Title music starts with the very first click or key press, not only with Play.
  if (!ctx.testMode && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
    const kinds = ['pointerdown', 'keydown', 'touchend'] as const;
    const first = (): void => {
      for (const k of kinds) window.removeEventListener(k, first, true);
      api.unlock();
    };
    for (const k of kinds) window.addEventListener(k, first, true);
  }

  if (typeof document !== 'undefined') {
    try {
      mountRadio(ctx.testMode);
    } catch {
      /* the radio button is optional */
    }
  }

  return api;
}
