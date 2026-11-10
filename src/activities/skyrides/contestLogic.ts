/**
 * Sky contest rules (pure): scoring, the friends' AI pilots with rubber-banding, raft bullseyes,
 * the podium and the prize. No three, no DOM.
 */
import { clamp } from './flightModel';
import type { V3 } from './flightModel';

export const CONTEST = {
  seconds: 90,
  countdown: 3,
  /** Points for each thing. */
  points: { hoop: 1, bonusHoop: 3, cloud: 1, golden: 3, trick: 1, duck: 5 } as const,
  /** Hoop pass radius (ring radius ~4.5 m) and re-arm time for the next lap. */
  hoopRadius: 5.2,
  hoopRearm: 6,
  cloudRadius: 3.6,
  cloudRespawn: 18,
  /** Raft bullseye rings (m from the centre) → 3 / 2 / 1 points. */
  raftRings: [2.2, 4.4, 6.6] as readonly number[],
  duckRadius: 4,
  dropCooldown: 0.55,
  maxBalloons: 6,
  /** Prize gems for 1st / 2nd / 3rd. */
  prize: [6, 4, 2] as readonly number[],
  /** Score thresholds for 1 / 2 / 3 result stars. */
  stars: [8, 20, 35] as readonly number[],
  overtakeCooldown: 6,
} as const;

/** Points for a water balloon landing at (x, z) on a raft centred at (cx, cz). 0 = missed. */
export function raftPoints(x: number, z: number, cx: number, cz: number): number {
  const d = Math.hypot(x - cx, z - cz);
  const rings = CONTEST.raftRings;
  if (d <= rings[0]) return 3;
  if (d <= rings[1]) return 2;
  if (d <= rings[2]) return 1;
  return 0;
}

export function resultStars(score: number): number {
  const s = CONTEST.stars;
  return score >= s[2] ? 3 : score >= s[1] ? 2 : score >= s[0] ? 1 : 0;
}

/** Deterministic little PRNG (mulberry32) so friends behave the same in tests. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RivalDef {
  /** Catalog character id of the friend in the cockpit. */
  character: string;
  /** Chance to get each hoop / cloud right (they are a bit clumsy). */
  skill: number;
  /** Lateral lane offset, metres. */
  lane: number;
  seed: number;
}

export interface Rival {
  def: RivalDef;
  /** Unwrapped progress along the course, metres. */
  s: number;
  speed: number;
  score: number;
  /** Next hoop index (unwrapped count of hoops passed). */
  nextHoop: number;
  /** Seconds until the next silly wobble. */
  wobbleT: number;
  rand: () => number;
  /** Seconds left before this friend may confetti-puff the player again. */
  puffCooldown: number;
}

export function createRival(def: RivalDef, startS: number): Rival {
  return { def, s: startS, speed: 0, score: 0, nextHoop: 0, wobbleT: 0, rand: rng(def.seed), puffCooldown: 0 };
}

/**
 * Rubber-band speed: friends speed up when far behind the player and ease off when far ahead,
 * so the race is always close, but never by more than ±25 %.
 */
export function rubberBandSpeed(base: number, rivalS: number, playerS: number): number {
  const gap = playerS - rivalS; // + = player ahead
  return base * (1 + clamp(gap / 160, -0.25, 0.25));
}

/**
 * Advance a friend along the course. `hoopAt(i)` is the arc length of hoop i (unwrapped, for any
 * i ≥ 0). Returns the points scored this step.
 */
export function stepRival(r: Rival, dt: number, base: number, playerS: number, hoopAt: (i: number) => number, flying: boolean): number {
  r.puffCooldown = Math.max(0, r.puffCooldown - dt);
  if (!flying) return 0;
  const want = rubberBandSpeed(base, r.s, playerS);
  r.speed += (want - r.speed) * (1 - Math.exp(-1.5 * dt));
  r.s += r.speed * dt;
  let pts = 0;
  while (hoopAt(r.nextHoop) <= r.s) {
    // A clumsy friend: sometimes they clip the hoop and miss it.
    if (r.rand() < r.def.skill) pts += CONTEST.points.hoop;
    // ...and now and then pop a cloud-balloon or splash a raft on the way.
    if (r.rand() < r.def.skill * 0.35) pts += CONTEST.points.cloud;
    r.nextHoop++;
  }
  r.score += pts;
  return pts;
}

/** Did the friend just overtake the player (progress crossed from behind)? */
export function overtook(prevRivalS: number, rivalS: number, playerS: number): boolean {
  return prevRivalS < playerS && rivalS >= playerS;
}

export interface Standing {
  id: string;
  score: number;
  /** 1-based place. */
  place: number;
}

/** Rank by score (ties: the player wins, then the earlier entry). */
export function standings(entries: readonly { id: string; score: number }[]): Standing[] {
  const sorted = entries
    .map((e, i) => ({ ...e, i }))
    .sort((a, b) => b.score - a.score || (a.id === 'you' ? -1 : b.id === 'you' ? 1 : a.i - b.i));
  return sorted.map((e, k) => ({ id: e.id, score: e.score, place: k + 1 }));
}

export function prizeFor(place: number): number {
  return CONTEST.prize[place - 1] ?? 1;
}

/** Is p inside the disc of a hoop: within `radius` of its centre and crossing its plane? */
export function throughHoop(prev: V3, cur: V3, centre: V3, normal: V3, radius: number): boolean {
  const da = (prev.x - centre.x) * normal.x + (prev.y - centre.y) * normal.y + (prev.z - centre.z) * normal.z;
  const db = (cur.x - centre.x) * normal.x + (cur.y - centre.y) * normal.y + (cur.z - centre.z) * normal.z;
  if ((da > 0 && db > 0) || (da < 0 && db < 0)) return false;
  const t = da === db ? 0 : da / (da - db);
  const x = prev.x + (cur.x - prev.x) * t - centre.x;
  const y = prev.y + (cur.y - prev.y) * t - centre.y;
  const z = prev.z + (cur.z - prev.z) * t - centre.z;
  return x * x + y * y + z * z <= radius * radius;
}

/** Ticket rule: the first ride of each kind per session is free, then `price` gems. */
export function ticketPrice(ridesThisSession: number, price = 3): number {
  return ridesThisSession === 0 ? 0 : price;
}
