/**
 * Gems-per-minute simulation of a player against the real round machine (pure; used by the unit
 * tests to tune prize tables). A player answers each try after `tryTime` s, right with probability
 * `hitP` (1/3 = a random-guess bot in a pick-one-of-three game), needs `backTime` s after an
 * answer to be back on the pad (rules with `between: 'pad'`) and `restart` s to start the next
 * round once the booth is idle again.
 */
import type { GlassesTier } from '../../../types';
import { RoundMachine } from './round';
import type { RoundRules } from './types';

export interface SimPlayer {
  hitP: number;
  tryTime: number;
  backTime?: number;
  restart?: number;
  /** Keep the tier fixed (else the round's staircase runs). */
  fixedTier?: GlassesTier;
  minutes: number;
  seed?: number;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulate(rules: RoundRules, p: SimPlayer): { gemsPerMinute: number; rounds: number; tierEnd: GlassesTier } {
  const m = new RoundMachine(rules);
  const r = rng(p.seed ?? 1);
  const dt = 1 / 20;
  const total = p.minutes * 60;
  let gems = 0;
  let sinceTry = 0;
  let sinceAnswer = Infinity;
  let idleFor = 0;
  for (let t = 0; t < total; t += dt) {
    if (p.fixedTier) m.tier = p.fixedTier;
    if (m.phase === 'idle') {
      idleFor += dt;
      if (idleFor >= (p.restart ?? p.backTime ?? 0)) {
        m.start();
        idleFor = 0;
      }
      continue;
    }
    if (m.phase === 'play') {
      sinceTry += dt;
      if (sinceTry >= p.tryTime) {
        m.report(r() < p.hitP);
        sinceAnswer = 0;
      }
    } else sinceAnswer += dt;
    const ready = sinceAnswer >= (p.backTime ?? 0);
    for (const e of m.step(dt, ready)) {
      if (e.type === 'try') sinceTry = 0;
      if (e.type === 'pay') gems += e.gems;
    }
  }
  return { gemsPerMinute: gems / p.minutes, rounds: m.rounds, tierEnd: m.tier };
}
