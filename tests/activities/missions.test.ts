import { describe, expect, it } from 'vitest';
import {
  availablePool, MISSION_LAND_RINGS_ENABLED, MissionTracker, mulberry32, pickMissions,
} from '../../src/activities/economy/missions';
import { createEventBus } from '../../src/events';
import { createProfile } from '../../src/profile';
import { createEconomyRules } from '../../src/activities/economy/rules';
import { ECONOMY } from '../../src/config';
import type { GameEvents, Mission } from '../../src/types';
import type * as THREE from 'three';

const NOWHERE = undefined as unknown as THREE.Vector3;

describe('mission pool and picker', () => {
  it('keeps land-on-rings out until the flag is flipped', () => {
    expect(MISSION_LAND_RINGS_ENABLED).toBe(false);
    expect(availablePool().some((m) => m.kind === 'landRings')).toBe(false);
    expect(availablePool(true).some((m) => m.kind === 'landRings')).toBe(true);
  });

  it('always gives three different kinds, for many seeds', () => {
    for (let seed = 0; seed < 300; seed++) {
      const list = pickMissions(mulberry32(seed));
      expect(list).toHaveLength(ECONOMY.missionsPerSession);
      expect(new Set(list.map((m) => m.kind)).size).toBe(3);
      expect(list.every((m) => m.target > 0 && m.reward > 0)).toBe(true);
    }
  });

  it('is deterministic for the same seed', () => {
    expect(pickMissions(mulberry32(7))).toEqual(pickMissions(mulberry32(7)));
  });
});

const mk = (kind: Mission['kind'], target: number): Mission => ({ id: kind, kind, icon: 'gem', target, reward: 5 });

describe('MissionTracker', () => {
  it('counts gems, megas and driving gems', () => {
    const t = new MissionTracker();
    t.start([mk('collectGems', 3), mk('megaGems', 1), mk('driveGems', 2)]);
    t.note({ type: 'gem', mega: false, driving: true });
    t.note({ type: 'gem', mega: true, driving: false });
    expect(t.missions.map((x) => x.progress)).toEqual([2, 1, 1]);
    expect(t.missions[1].done).toBe(true);
  });

  it('combo and bounce keep the best value; stars add up; progress caps at target', () => {
    const t = new MissionTracker();
    t.start([mk('combo', 3), mk('bounceHeight', 30), mk('stars', 3)]);
    t.note({ type: 'combo', multiplier: 2 });
    t.note({ type: 'combo', multiplier: 1 });
    t.note({ type: 'bounce', height: 21.7 });
    t.note({ type: 'bounce', height: 12 });
    t.note({ type: 'stars', amount: 2 });
    t.note({ type: 'stars', amount: 5 });
    expect(t.missions.map((x) => x.progress)).toEqual([2, 21, 3]);
    expect(t.missions.map((x) => x.done)).toEqual([false, false, true]);
  });

  it('a finished mission stops changing', () => {
    const t = new MissionTracker();
    t.start([mk('openChest', 1)]);
    expect(t.note({ type: 'chest' })[0].completed).toBe(true);
    expect(t.note({ type: 'chest' })).toEqual([]);
    expect(t.allDone).toBe(true);
  });
});

describe('missions in the economy', () => {
  function setup(seed = 1) {
    const events = createEventBus();
    const profile = createProfile(events, { storage: null });
    const sounds: string[] = [];
    const eco = createEconomyRules(events, profile, { rand: mulberry32(seed), play: (n) => sounds.push(n) });
    const jackpot: GameEvents['mission:jackpot'][] = [];
    const done: GameEvents['mission:completed'][] = [];
    events.on('mission:completed', (e) => done.push(e));
    events.on('mission:jackpot', (e) => jackpot.push(e));
    return { events, profile, eco, done, jackpot, sounds };
  }

  it('has none before the first session, three after it starts, and keeps them over a pause', () => {
    const { events, eco } = setup();
    expect(eco.missions).toHaveLength(0);
    events.emit('session:phase', { phase: 'playing', previous: 'title' });
    expect(eco.missions).toHaveLength(3);
    const ids = eco.missions.map((x) => x.id);
    events.emit('session:phase', { phase: 'paused', previous: 'playing' });
    events.emit('session:phase', { phase: 'playing', previous: 'paused' });
    expect(eco.missions.map((x) => x.id)).toEqual(ids);
  });

  it('pays each reward and the jackpot once, with the right reasons', () => {
    const { events, profile, eco, done, jackpot, sounds } = setup();
    const reasons: string[] = [];
    events.on('wallet:changed', (e) => reasons.push(e.reason));
    events.emit('session:phase', { phase: 'playing', previous: 'title' });
    const rewards = eco.missions.reduce((s, x) => s + x.reward, 0);
    events.emit('player:mode', { mode: 'driving', previous: 'walk' });
    for (let i = 0; i < 12; i++) {
      events.emit('gem:collected', { id: `g${i}`, count: i + 1, total: 99, position: NOWHERE, mega: i < 3, value: 1 });
    }
    events.emit('combo:changed', { multiplier: 3, streak: 3 });
    events.emit('stunt', { kind: 'bigBounce', value: 35, stars: 3 });
    events.emit('chest:opened', { chestId: 'c', outfitId: 'o' });
    expect(eco.missions.every((x) => x.done)).toBe(true);
    expect(done).toHaveLength(3);
    expect(jackpot).toEqual([{ reward: ECONOMY.jackpot }]);
    expect(profile.wallet).toBe(rewards + ECONOMY.jackpot);
    expect(reasons.filter((r) => r === 'mission')).toHaveLength(3);
    expect(reasons.filter((r) => r === 'jackpot')).toHaveLength(1);
    expect(sounds).toContain('fanfare');
    events.emit('chest:opened', { chestId: 'c2', outfitId: 'o' });
    expect(profile.wallet).toBe(rewards + ECONOMY.jackpot);
    expect(jackpot).toHaveLength(1);
  });

  it('driving gems only count while driving', () => {
    let found = false;
    for (let seed = 0; seed < 50 && !found; seed++) {
      const { events, eco } = setup(seed);
      events.emit('session:phase', { phase: 'playing', previous: 'title' });
      const idx = eco.missions.findIndex((x) => x.kind === 'driveGems');
      if (idx < 0) continue;
      found = true;
      events.emit('gem:collected', { id: 'a', count: 1, total: 9, position: NOWHERE });
      expect(eco.missions[idx].progress).toBe(0);
      events.emit('player:mode', { mode: 'driving', previous: 'walk' });
      events.emit('gem:collected', { id: 'b', count: 2, total: 9, position: NOWHERE });
      expect(eco.missions[idx].progress).toBe(1);
    }
    expect(found).toBe(true);
  });

  it('a new session draws fresh missions with zero progress', () => {
    const { events, eco } = setup();
    events.emit('session:phase', { phase: 'playing', previous: 'title' });
    events.emit('chest:opened', { chestId: 'c', outfitId: 'o' });
    events.emit('session:phase', { phase: 'title', previous: 'ended' });
    events.emit('session:phase', { phase: 'playing', previous: 'title' });
    expect(eco.missions.every((x) => x.progress === 0 && !x.done)).toBe(true);
  });
});
