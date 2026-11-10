/**
 * What the UI remembers about this session's economy, from events (the HUD cards and the end
 * screen both read it): the three missions, the jackpot, the best combo and what was unlocked.
 */
import type { GameContext, MissionState } from '../types';

export interface EconTracker {
  readonly missions: readonly MissionState[];
  /** Jackpot paid this session (0 = not yet). */
  readonly jackpot: number;
  /** Item ids unlocked this session from the shop or chests (not starters), in order. */
  readonly unlocked: readonly string[];
  bestCombo(): number;
  /** Pick up missions the economy created after the session started. Returns true if changed. */
  sync(): boolean;
}

export function createEconTracker(ctx: GameContext): EconTracker {
  let missions: MissionState[] = [];
  let jackpot = 0;
  let unlocked: string[] = [];
  let combo = 1;

  const load = (): void => {
    missions = ctx.economy.missions.map((m) => ({ ...m }));
  };

  ctx.events.on('session:phase', (e) => {
    if (e.phase === 'playing' && e.previous !== 'paused') {
      jackpot = 0;
      unlocked = [];
      combo = 1;
      load();
    }
  });
  const put = (index: number, m: MissionState): void => {
    if (index < 0 || index > 5) return;
    while (missions.length < index) missions.push({ ...m, progress: 0, done: false });
    missions[index] = { ...m };
  };
  ctx.events.on('mission:progress', (e) => put(e.index, e.mission));
  ctx.events.on('mission:completed', (e) => put(e.index, { ...e.mission, done: true }));
  ctx.events.on('mission:jackpot', (e) => {
    jackpot = Math.max(1, e.reward);
  });
  ctx.events.on('combo:changed', (e) => {
    combo = Math.max(combo, e.multiplier);
  });
  ctx.events.on('item:unlocked', (e) => {
    if (e.source !== 'starter' && !unlocked.includes(e.itemId)) unlocked.push(e.itemId);
  });

  return {
    get missions() {
      return missions;
    },
    get jackpot() {
      return jackpot;
    },
    get unlocked() {
      return unlocked;
    },
    bestCombo: () => Math.max(combo, ctx.session.state.bestCombo ?? 0, 1),
    sync() {
      if (missions.length === 0 && ctx.economy.missions.length > 0) {
        load();
        return true;
      }
      return false;
    },
  };
}
