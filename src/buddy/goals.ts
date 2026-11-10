/**
 * Pip's "next goal" (pure). Derived from existing state only, so a later "Fun Pass" stamp card can
 * replace this module without touching the rest: session missions from the economy first, else
 * try each attraction, open a chest, earn some gems.
 */
import type { MissionKind, MissionState } from '../types';
import type { ScriptLine } from './script';
import { ATTRACTIONS } from './script';
import type { Attraction } from './types';

export interface GoalState {
  missions: readonly MissionState[];
  visited: ReadonlySet<Attraction>;
  /** Attractions that exist in this build, in suggestion order. */
  attractions: readonly Attraction[];
  chestsOpened: number;
  earned: number;
}

export const EARN_GOAL = 20;

const MISSION_TEXT: Record<MissionKind, (n: number) => string> = {
  collectGems: (n) => `Collect ${n} Glow Gems!`,
  megaGems: (n) => `Find ${n} mega gems!`,
  combo: (n) => `Get a x${n} combo!`,
  bounceHeight: (n) => `Bounce ${n} meters high!`,
  openChest: () => 'Open a treasure chest!',
  driveGems: (n) => `Grab ${n} gems while driving!`,
  landRings: (n) => `Land in ${n} rings!`,
  stars: (n) => `Earn ${n} stars!`,
};

export interface Goal {
  id: string;
  line: ScriptLine;
}

export function missionGoal(m: MissionState): Goal {
  return { id: `mission:${m.id}`, line: { text: MISSION_TEXT[m.kind](m.target), icon: m.icon, mood: 'excited' } };
}

export function currentGoal(s: GoalState): Goal {
  const m = s.missions.find((x) => !x.done);
  if (m) return missionGoal(m);
  const next = s.attractions.find((a) => !s.visited.has(a));
  if (next) return { id: `visit:${next}`, line: { text: `Try the ${ATTRACTIONS[next].name}!`, icon: ATTRACTIONS[next].icon, mood: 'curious' } };
  if (s.chestsOpened === 0) return { id: 'chest', line: { text: 'Open a treasure chest!', icon: 'chest', mood: 'curious' } };
  if (s.earned < EARN_GOAL) return { id: 'earn', line: { text: `Earn ${EARN_GOAL} gems today!`, icon: 'gem', mood: 'excited' } };
  return { id: 'free', line: { text: 'You rock! Play anything!', icon: 'star', mood: 'proud' } };
}

/** The attraction nearest to a point, preferring ones not visited yet. */
export function nearestAttraction(
  from: { x: number; z: number },
  places: readonly { name: Attraction; x: number; z: number }[],
  visited: ReadonlySet<Attraction>,
): Attraction | null {
  let best: Attraction | null = null;
  let bestD = Infinity;
  for (const p of places) {
    const d = Math.hypot(p.x - from.x, p.z - from.z) + (visited.has(p.name) ? 1000 : 0);
    if (d < bestD) {
      bestD = d;
      best = p.name;
    }
  }
  return best;
}
