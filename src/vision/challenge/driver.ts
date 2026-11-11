/**
 * Wires the pure staircase + tally to the game events. Created by `createVision`.
 *
 * - Inputs (counted only while the session is playing): every `glasses:result`, plus
 *   `gem:collected`, `chest:key` (find, tier 1) and `chest:opened` (line it up, tier 1) as hits.
 * - Playing time comes from `session:tick` (total − remaining), so it is deterministic under
 *   `rg.step`; one tick never adds more than `maxTickDelta` (timer skips are not play).
 * - The staircase only moves while `settings.autoChallenge === true`; off → identity at once.
 * - Read-only on settings: never calls `settings.set`, never writes storage.
 */
import { CHALLENGE } from './constants';
import {
  IDENTITY_MODIFIERS,
  createStaircase,
  easeModifiers,
  forcedModifiers,
  levelModifiers,
  resetStaircase,
  staircaseElapse,
  staircaseResult,
} from './staircase';
import type { ForcedPatch, StaircaseState, StepDir } from './staircase';
import { SessionTally } from './tally';
import type { GlassesResult } from './tally';
import type { ChallengeModifiers, GameContext, GlassesSummary, SessionPhase } from '../../types';

export interface ChallengeDriverState extends StaircaseState {
  enabled: boolean;
  forced: boolean;
  phase: SessionPhase;
  /** Playing seconds of the current (or last) session. */
  seconds: number;
}

export interface ChallengeDriver {
  /** Applied (eased, or forced) modifiers: what the compositor uses. */
  modifiers(): Readonly<ChallengeModifiers>;
  /** Where the staircase is heading (the level's exact modifiers, or the forced ones). */
  target(): Readonly<ChallengeModifiers>;
  /** Ease the applied modifiers toward the target. */
  update(dt: number): void;
  /** Jump the easing to its target (test/debug). */
  settle(): void;
  setForced(mods: ForcedPatch | null): void;
  summary(): GlassesSummary;
  state(): ChallengeDriverState;
  dispose(): void;
}

export function createChallengeDriver(ctx: Pick<GameContext, 'settings' | 'events'>): ChallengeDriver {
  const stair = createStaircase();
  const tally = new SessionTally();
  let phase: SessionPhase = 'title';
  let seconds = 0;
  let lastElapsed = 0;
  let enabledDuring = false;
  let forced: ChallengeModifiers | null = null;
  let applied: ChallengeModifiers = { ...IDENTITY_MODIFIERS };

  const enabled = (): boolean => ctx.settings.get().autoChallenge === true;
  const target = (): Readonly<ChallengeModifiers> => forced ?? (enabled() ? levelModifiers(stair.level) : IDENTITY_MODIFIERS);
  const announce = (): void => ctx.events.emit('glasses:challenge', { modifiers: { ...target() } });
  const moved = (dir: StepDir): void => {
    if (dir !== 0) announce();
  };

  const onResult = (r: GlassesResult): void => {
    if (phase !== 'playing') return;
    tally.record(r);
    if (enabled()) moved(staircaseResult(stair, r.hit));
  };

  const offs = [
    ctx.events.on('glasses:result', onResult),
    ctx.events.on('gem:collected', () => onResult({ mechanic: 'gems', kind: 'find', tier: 1, hit: true })),
    ctx.events.on('chest:key', () => onResult({ mechanic: 'chestKeys', kind: 'find', tier: 1, hit: true })),
    ctx.events.on('chest:opened', () => onResult({ mechanic: 'chests', kind: 'lineUp', tier: 1, hit: true })),
    ctx.events.on('session:phase', (e) => {
      phase = e.phase;
      if (e.phase === 'playing' && e.previous === 'title') {
        tally.clear();
        resetStaircase(stair);
        seconds = 0;
        lastElapsed = 0;
        enabledDuring = enabled();
        if (!forced) applied = { ...IDENTITY_MODIFIERS };
        if (enabled()) announce();
      }
    }),
    ctx.events.on('session:tick', (e) => {
      const elapsed = Math.max(0, e.total - e.remaining);
      const d = Math.min(CHALLENGE.maxTickDelta, Math.max(0, elapsed - lastElapsed));
      lastElapsed = elapsed;
      if (phase !== 'playing') return;
      seconds = elapsed;
      if (enabled()) moved(staircaseElapse(stair, d));
    }),
    ctx.events.on('settings:changed', () => {
      const on = enabled();
      if (on) {
        if (phase === 'playing' || phase === 'paused') enabledDuring = true;
        return;
      }
      // Off: back to the calibrated picture at once.
      const wasLevel = stair.level;
      stair.level = 0;
      stair.streak = 0;
      stair.sinceHit = 0;
      if (!forced) applied = { ...IDENTITY_MODIFIERS };
      if (wasLevel !== 0) announce();
    }),
  ];

  return {
    modifiers: () => applied,
    target,
    update(dt) {
      if (forced) {
        applied = { ...forced };
        return;
      }
      if (!enabled()) {
        applied = { ...IDENTITY_MODIFIERS };
        return;
      }
      applied = easeModifiers(applied, target(), dt);
    },
    settle() {
      applied = { ...target() };
    },
    setForced(mods) {
      const before = target().level;
      forced = mods ? forcedModifiers(mods) : null;
      // Test/debug: both forcing and releasing apply at once (releasing lands on the staircase's own target).
      applied = { ...target() };
      if (target().level !== before) announce();
    },
    summary() {
      return {
        rows: tally.rows(),
        seconds,
        challenge: {
          enabled: enabledDuring || enabled(),
          level: stair.level,
          maxLevel: stair.maxLevel,
          stepsUp: stair.stepsUp,
          stepsDown: stair.stepsDown,
        },
      };
    },
    state: () => ({ ...stair, enabled: enabled(), forced: forced !== null, phase, seconds }),
    dispose() {
      for (const off of offs) off();
    },
  };
}
