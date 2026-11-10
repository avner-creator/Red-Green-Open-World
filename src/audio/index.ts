import type { AudioApi, GameContext, SfxName } from '../types';
import { landVolume, volumeToGain } from './gain';
import { RateLimiter, StreakTracker, VoiceCounter } from './limiter';
import { Loops, type LoopName } from './loops';
import { Music } from './music';
import { streakPitch } from './music-theory';
import { createNoiseBuffer, playSfx, Synth } from './synth';

const MAX_VOICES = 12;
const MIN_GAP = 0.04;
const MUSIC_LEVEL = 0.55;
const FANFARE_MUSIC_OFF_DELAY = 2.6;

interface Engine {
  ctx: AudioContext;
  master: GainNode;
  sfxBus: GainNode;
  musicBus: GainNode;
  synth: Synth;
  loops: Loops;
  music: Music;
}

type AudioCtor = new () => AudioContext;

function findAudioContext(): AudioCtor | null {
  if (typeof globalThis === 'undefined') return null;
  const g = globalThis as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

export function createAudio(ctx: Pick<GameContext, 'settings' | 'events' | 'testMode'>): AudioApi {
  let engine: Engine | null = null;
  let failed = false;
  let musicWanted = false;
  let ducked = false;
  /** Pending delayed actions, ticked from update(dt). */
  let timers: Array<{ left: number; run: () => void }> = [];
  const limiter = new RateLimiter(MIN_GAP);
  const voices = new VoiceCounter(MAX_VOICES);
  const gemStreak = new StreakTracker(3);

  function applyVolumes(): void {
    if (!engine) return;
    const s = ctx.settings.get();
    const now = engine.ctx.currentTime;
    engine.master.gain.setTargetAtTime(volumeToGain(s.volumeMaster), now, 0.03);
    engine.sfxBus.gain.setTargetAtTime(volumeToGain(s.volumeSfx), now, 0.03);
    engine.musicBus.gain.setTargetAtTime(volumeToGain(s.volumeMusic) * MUSIC_LEVEL, now, 0.05);
  }

  function applyMusic(): void {
    if (!engine) return;
    try {
      engine.music.setOn(musicWanted);
      if (musicWanted && ducked) engine.music.setDuck(0.3);
    } catch {
      /* never throw */
    }
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
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.knee.value = 12;
      comp.ratio.value = 10;
      comp.attack.value = 0.003;
      comp.release.value = 0.2;
      master.connect(comp);
      comp.connect(ac.destination);
      const sfxBus = ac.createGain();
      const musicBus = ac.createGain();
      sfxBus.connect(master);
      musicBus.connect(master);
      const noise = createNoiseBuffer(ac);
      engine = {
        ctx: ac,
        master,
        sfxBus,
        musicBus,
        synth: new Synth(ac, sfxBus, noise),
        loops: new Loops(ac, sfxBus, noise),
        music: new Music(ac, musicBus, (Date.now() & 0xffff) + 1),
      };
      applyVolumes();
      applyMusic();
    } catch {
      engine = null;
      failed = true;
    }
  }

  function play(name: SfxName, opts?: { volume?: number; pitch?: number }): void {
    if (!engine || engine.ctx.state !== 'running') return;
    try {
      const now = engine.ctx.currentTime;
      if (!limiter.allow(name, now)) return;
      const volume = opts?.volume ?? 1;
      if (!(volume > 0.001)) return;
      const pitch = Math.min(4, Math.max(0.25, opts?.pitch ?? 1));
      // Reserve first with a rough duration, then trust the recipe's own duration for the record.
      if (voices.active(now) >= MAX_VOICES) return;
      const dur = playSfx(engine.synth, name, now + 0.005, Math.min(2, volume), pitch);
      voices.tryAdd(now, dur);
    } catch {
      /* never throw */
    }
  }

  function after(seconds: number, run: () => void): void {
    timers.push({ left: seconds, run });
  }

  const ev = ctx.events;
  ev.on('settings:changed', () => applyVolumes());
  ev.on('gem:collected', () => {
    const now = engine ? engine.ctx.currentTime : 0;
    play('gem', { pitch: streakPitch(gemStreak.hit(now)) });
  });
  ev.on('gem:near', () => play('gemNear'));
  ev.on('player:jump', () => play('jump'));
  ev.on('player:land', (e) => {
    const v = landVolume(e.speed);
    if (v > 0) play('land', { volume: v });
  });
  ev.on('player:flop', () => play('flop'));
  ev.on('chest:key', () => play('key'));
  ev.on('chest:opened', () => play('chest'));
  ev.on('stunt', () => play('star'));
  ev.on('vehicle:bump', (e) => play('bump', { volume: Math.min(1, 0.4 + e.speed / 12) }));
  ev.on('session:phase', ({ phase, previous }) => {
    timers = [];
    if (phase === 'playing') {
      ducked = false;
      if (previous !== 'paused') play('start');
      if (!ctx.testMode) musicWanted = true;
      if (engine && musicWanted) engine.music.setDuck(1);
      applyMusic();
    } else if (phase === 'paused') {
      ducked = true;
      applyMusic();
    } else if (phase === 'ended') {
      ducked = false;
      engine?.loops.stopAll();
      play('fanfare');
      after(FANFARE_MUSIC_OFF_DELAY, () => {
        musicWanted = false;
        applyMusic();
      });
    } else {
      ducked = false;
      musicWanted = false;
      engine?.loops.stopAll();
      applyMusic();
    }
  });

  return {
    unlock() {
      try {
        build();
        if (engine && engine.ctx.state === 'suspended') void engine.ctx.resume().catch(() => undefined);
      } catch {
        /* never throw */
      }
    },
    play,
    setLoop(name: LoopName, intensity: number, pitch = 1) {
      if (!engine || engine.ctx.state !== 'running') return;
      try {
        engine.loops.set(name, intensity, pitch);
      } catch {
        /* never throw */
      }
    },
    setMusic(on: boolean) {
      musicWanted = on;
      ducked = false;
      applyMusic();
    },
    update(dt: number) {
      if (timers.length > 0) {
        const due = timers.filter((t) => (t.left -= dt) <= 0);
        timers = timers.filter((t) => t.left > 0);
        for (const t of due) t.run();
      }
      if (!engine) return;
      try {
        engine.loops.update(dt);
        engine.music.update();
      } catch {
        /* never throw */
      }
    },
  };
}
