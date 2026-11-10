/**
 * Missions (pure): a pool of wordless goals (icon + number), a deterministic-able picker that
 * always returns different kinds, and a tracker that turns game events into progress.
 */
import { ECONOMY } from '../../config';
import type { IconName, Mission, MissionKind, MissionState } from '../../types';

/**
 * The balloon and its landing rings are not on this branch yet, so the "land on rings" mission
 * stays out of the draw. Flip this to true once the rings exist.
 */
export const MISSION_LAND_RINGS_ENABLED = false;

export interface MissionDef {
  kind: MissionKind;
  icon: IconName;
  target: number;
  reward: number;
}

export const MISSION_POOL: readonly MissionDef[] = [
  { kind: 'collectGems', icon: 'gem', target: 10, reward: 5 },
  { kind: 'megaGems', icon: 'megaGem', target: 2, reward: 8 },
  { kind: 'combo', icon: 'combo', target: 3, reward: 5 },
  { kind: 'bounceHeight', icon: 'trampoline', target: 30, reward: 8 },
  { kind: 'openChest', icon: 'chest', target: 1, reward: 10 },
  { kind: 'driveGems', icon: 'car', target: 5, reward: 8 },
  { kind: 'stars', icon: 'star', target: 3, reward: 6 },
  { kind: 'landRings', icon: 'parachute', target: 3, reward: 10 },
];

export function availablePool(landRings: boolean = MISSION_LAND_RINGS_ENABLED): MissionDef[] {
  return MISSION_POOL.filter((m) => landRings || m.kind !== 'landRings');
}

/** Small seeded generator (deterministic tests and `?test=1`). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pick `count` missions of different kinds from the pool. */
export function pickMissions(
  rand: () => number,
  count: number = ECONOMY.missionsPerSession,
  pool: readonly MissionDef[] = availablePool(),
): Mission[] {
  const left = [...pool];
  const out: Mission[] = [];
  while (out.length < count && left.length > 0) {
    const i = Math.min(left.length - 1, Math.floor(rand() * left.length));
    const [d] = left.splice(i, 1);
    out.push({ id: `m${out.length}-${d.kind}`, kind: d.kind, icon: d.icon, target: d.target, reward: d.reward });
  }
  return out;
}

/** What happened in the game, as far as missions care. */
export type MissionEvent =
  | { type: 'gem'; mega: boolean; driving: boolean }
  | { type: 'combo'; multiplier: number }
  | { type: 'bounce'; height: number }
  | { type: 'chest' }
  | { type: 'stars'; amount: number }
  | { type: 'ring' };

export interface MissionChange {
  index: number;
  mission: MissionState;
  /** True if this event completed the mission. */
  completed: boolean;
}

function advance(kind: MissionKind, ev: MissionEvent, progress: number): number {
  switch (kind) {
    case 'collectGems': return ev.type === 'gem' ? progress + 1 : progress;
    case 'megaGems': return ev.type === 'gem' && ev.mega ? progress + 1 : progress;
    case 'driveGems': return ev.type === 'gem' && ev.driving ? progress + 1 : progress;
    case 'combo': return ev.type === 'combo' ? Math.max(progress, ev.multiplier) : progress;
    case 'bounceHeight': return ev.type === 'bounce' ? Math.max(progress, Math.floor(ev.height)) : progress;
    case 'openChest': return ev.type === 'chest' ? progress + 1 : progress;
    case 'stars': return ev.type === 'stars' ? progress + ev.amount : progress;
    case 'landRings': return ev.type === 'ring' ? progress + 1 : progress;
  }
}

export class MissionTracker {
  missions: MissionState[] = [];

  start(list: readonly Mission[]): void {
    this.missions = list.map((m) => ({ ...m, progress: 0, done: false }));
  }

  /** Feed an event. Returns the missions that changed. Completed missions stop changing. */
  note(ev: MissionEvent): MissionChange[] {
    const out: MissionChange[] = [];
    this.missions.forEach((m, index) => {
      if (m.done) return;
      const next = Math.min(m.target, advance(m.kind, ev, m.progress));
      if (next === m.progress) return;
      m.progress = next;
      const completed = next >= m.target;
      if (completed) m.done = true;
      out.push({ index, mission: { ...m }, completed });
    });
    return out;
  }

  get allDone(): boolean {
    return this.missions.length > 0 && this.missions.every((m) => m.done);
  }
}
