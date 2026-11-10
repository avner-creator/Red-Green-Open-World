/**
 * Pure adaptive-music state machine (no WebAudio, time injected in seconds).
 *
 * Inputs are the game's existing events; the output is which music cue should play now:
 *   title    soft generative theme on the title screen (after the first user gesture) and
 *            a few seconds after the win jingle on the end screen
 *   explore  upbeat main loop while walking around
 *   action   faster loop while driving / riding, or while bouncing (trampoline, launch pads)
 *   air      light, airy loop while an external controller flies the player (balloon, skydive)
 *   urgent   the last 30 s: the same happy song, faster and brighter
 *   none     silence (before unlock, right after the end of a session while the jingle plays)
 * Raising the energy switches at once; calming down waits until the cue has played a while,
 * so quick in-and-out of a car does not flap the music.
 */
import type { PlayerMode, SessionPhase, StuntKind } from '../types';

export type MusicCue = 'none' | 'title' | 'explore' | 'action' | 'air' | 'urgent';

const PRIORITY: Record<MusicCue, number> = { none: 0, title: 1, explore: 2, action: 3, air: 4, urgent: 5 };

export const MUSIC_TUNING = {
  /** Seconds left in the session when the urgent cue takes over. */
  urgentAt: 30,
  /** A calmer cue may replace the current one only after this many seconds. */
  minDwell: 4,
  /** Bounce energy half-life (s) and the level that counts as "bouncing". */
  energyHalfLife: 5,
  energyThreshold: 1.5,
  /** How long the action cue holds after the last bounce/stunt (s). */
  actionHold: 8,
  /** Silence on the end screen while the win jingle plays, then the soft title theme (s). */
  endedQuiet: 4.5,
  /** Music level while paused. */
  pausedDuck: 0.35,
} as const;

export class MusicDirector {
  private phase: SessionPhase = 'title';
  private mode: PlayerMode = 'walk';
  private remaining = Infinity;
  private energy = 0;
  private energyAt = 0;
  private actionUntil = -Infinity;
  private endedAt = -Infinity;
  private unlocked = false;
  private cue: MusicCue = 'none';
  private cueSince = -Infinity;

  /** The first user gesture happened (audio may play). */
  unlock(): void {
    this.unlocked = true;
  }

  setPhase(phase: SessionPhase, previous: SessionPhase, now: number): void {
    this.phase = phase;
    if (phase === 'ended') this.endedAt = now;
    if (phase === 'playing' && previous !== 'paused') {
      // A fresh session: forget the old clock and any bounce energy.
      this.remaining = Infinity;
      this.energy = 0;
      this.actionUntil = -Infinity;
      this.mode = 'walk';
    }
    if (phase === 'title') this.remaining = Infinity;
  }

  /** Ragdoll flops keep whatever the player was doing before. */
  setMode(mode: PlayerMode): void {
    if (mode !== 'flop') this.mode = mode;
  }

  tick(remaining: number): void {
    if (Number.isFinite(remaining)) this.remaining = remaining;
  }

  /** A trampoline / pad bounce (1 = normal, 2 = big). */
  bounce(strength: number, now: number): void {
    this.pulse(strength, now);
  }

  stunt(_kind: StuntKind, now: number): void {
    this.pulse(2, now);
  }

  private pulse(amount: number, now: number): void {
    const dt = Math.max(0, now - this.energyAt);
    this.energy = this.energy * Math.pow(0.5, dt / MUSIC_TUNING.energyHalfLife) + amount;
    this.energyAt = now;
    if (this.energy >= MUSIC_TUNING.energyThreshold) this.actionUntil = now + MUSIC_TUNING.actionHold;
  }

  /** The cue the situation asks for right now, before hysteresis. */
  desired(now: number): MusicCue {
    if (!this.unlocked) return 'none';
    switch (this.phase) {
      case 'title':
        return 'title';
      case 'ended':
        return now - this.endedAt >= MUSIC_TUNING.endedQuiet ? 'title' : 'none';
      case 'paused':
        return this.cue === 'none' ? 'explore' : this.cue;
      case 'playing':
        break;
    }
    if (this.remaining <= MUSIC_TUNING.urgentAt) return 'urgent';
    if (this.mode === 'external') return 'air';
    if (this.mode === 'driving' || this.mode === 'riding' || now < this.actionUntil) return 'action';
    return 'explore';
  }

  /** Advance and return the cue that should be playing. */
  update(now: number): MusicCue {
    const want = this.desired(now);
    if (want === this.cue) return this.cue;
    const calmer = PRIORITY[want] < PRIORITY[this.cue];
    const gameplayCalmDown = calmer && this.phase === 'playing' && want !== 'none';
    if (!gameplayCalmDown || now - this.cueSince >= MUSIC_TUNING.minDwell) {
      this.cue = want;
      this.cueSince = now;
    }
    return this.cue;
  }

  /** 0..1 music level (ducked while paused). */
  level(): number {
    return this.phase === 'paused' ? MUSIC_TUNING.pausedDuck : 1;
  }

  get current(): MusicCue {
    return this.cue;
  }
}
