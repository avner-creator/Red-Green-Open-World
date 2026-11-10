import { SESSION } from './config';
import type { EventBus, SessionApi, SessionPhase, SessionState, SettingsApi } from './types';

export interface SessionSystem extends SessionApi {
  update(dt: number): void;
}

export function createSession(events: EventBus, settings: SettingsApi): SessionSystem {
  const state: SessionState = {
    phase: 'title',
    remaining: settings.get().sessionMinutes * 60,
    total: settings.get().sessionMinutes * 60,
    gems: 0,
    gemsTotal: 0,
    chests: 0,
    chestsTotal: 0,
    stars: 0,
    bestStunts: {},
    outfits: [],
    earned: 0,
    bestCombo: 0,
    megaGems: 0,
    missionsDone: 0,
    spent: 0,
  };
  let tickAcc = 0;

  const setPhase = (phase: SessionPhase): void => {
    if (state.phase === phase) return;
    const previous = state.phase;
    state.phase = phase;
    events.emit('session:phase', { phase, previous });
  };

  events.on('gem:collected', (e) => {
    state.gems = e.count;
    state.gemsTotal = e.total;
  });
  events.on('chest:opened', () => {
    state.chests += 1;
  });
  events.on('outfit:unlocked', (e) => {
    if (!state.outfits.includes(e.outfitId)) state.outfits.push(e.outfitId);
  });
  events.on('stunt', (e) => {
    state.stars += e.stars;
    state.bestStunts[e.kind] = Math.max(state.bestStunts[e.kind] ?? 0, e.value);
  });

  // Economy counters (stream C). 'test' wallet changes (test hooks, profile reset) are not counted.
  events.on('wallet:changed', (e) => {
    if (e.reason === 'test') return;
    if (e.delta > 0) state.earned = (state.earned ?? 0) + e.delta;
    else if (e.delta < 0) state.spent = (state.spent ?? 0) - e.delta;
  });
  events.on('combo:changed', (e) => {
    state.bestCombo = Math.max(state.bestCombo ?? 0, e.multiplier);
  });
  events.on('gem:collected', (e) => {
    if (e.mega) state.megaGems = (state.megaGems ?? 0) + 1;
  });
  events.on('mission:completed', () => {
    state.missionsDone = (state.missionsDone ?? 0) + 1;
  });

  return {
    state,
    start() {
      state.total = settings.get().sessionMinutes * 60;
      state.remaining = state.total;
      state.gems = 0;
      state.chests = 0;
      state.stars = 0;
      state.bestStunts = {};
      state.outfits = [];
      state.earned = 0;
      state.bestCombo = 0;
      state.megaGems = 0;
      state.missionsDone = 0;
      state.spent = 0;
      tickAcc = 0;
      setPhase('playing');
      events.emit('session:tick', { remaining: state.remaining, total: state.total });
    },
    pause() {
      if (state.phase === 'playing') setPhase('paused');
    },
    resume() {
      if (state.phase === 'paused') setPhase('playing');
    },
    end() {
      if (state.phase === 'playing' || state.phase === 'paused') setPhase('ended');
    },
    toTitle() {
      setPhase('title');
    },
    setTotals(totals) {
      if (totals.gems !== undefined) state.gemsTotal = totals.gems;
      if (totals.chests !== undefined) state.chestsTotal = totals.chests;
    },
    setRemaining(seconds) {
      state.remaining = Math.max(0, seconds);
      events.emit('session:tick', { remaining: state.remaining, total: state.total });
    },
    update(dt) {
      if (state.phase !== 'playing') return;
      state.remaining = Math.max(0, state.remaining - dt);
      tickAcc += dt;
      if (tickAcc >= SESSION.tickInterval || state.remaining === 0) {
        tickAcc = 0;
        events.emit('session:tick', { remaining: state.remaining, total: state.total });
      }
      if (state.remaining === 0) setPhase('ended');
    },
  };
}
