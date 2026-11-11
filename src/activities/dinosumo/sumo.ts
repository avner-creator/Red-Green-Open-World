/**
 * Dino Sumo round logic (pure, no three.js). Four wobbly inflatable dinosaurs on a round mat bump
 * each other out of a pool-noodle ring. Out means a giggly roll to the mat edge and a waddle back;
 * nobody is ever hurt. Space swings your tail: it bumps dinos near you and pops the water balloons
 * hanging overhead. Ordinary balloons splash the popper (+1); the weak-eye-only balloons (only the
 * player's tail can pop them: the friends can't see them) soak everybody else (+3). Knocking a friend out of the ring scores +2 for whoever bumped them last.
 * Ring space: origin at the ring centre, metres, x/z on the mat (+Z = the booth side's far end).
 */
import { collideBodies, integrate, makeBody, steerToward } from '../bubbleball/bodies';
import type { Body, Contact } from '../bubbleball/bodies';

export const RING = { r: 4.4, mat: 5.7 } as const;
export const DINO = { r: 0.72, m: 1, playerM: 1.25, bounce: 0.75, drag: 2.2, h: 2 } as const;
export const SUMO = { seconds: 45, countdown: 3, endPause: 1.6 } as const;
export const MOVE = { speed: 4.3, sprint: 5.6, accel: 13 } as const;
export const AI = { speed: 3.5, accel: 9, think: [0.35, 0.8] as const } as const;
export const TAIL = { seconds: 0.5, cooldown: 0.85, reach: 2.05, push: 6.2, popReach: 2.15 } as const;
export const OUT = { roll: 1.1, back: 1.6, points: 2 } as const;
export const BALLOON = { respawn: 3.5, weakMax: 2, splashSlow: 0.8, soakSlow: 1.4 } as const;
export const POINTS = { out: 2, balloon: 1, weakBalloon: 3 } as const;
/**
 * Glasses "time it": a weak-eye ring pulses round the player's dino, shrinking in to the dino once
 * per `period`. A tail swing in the last `window` seconds (when the ring hugs the dino) is a super
 * swing: a bigger shove and +1. With the weak eye shut the beat is invisible.
 */
export const BEAT = { period: 1.5, window: 0.32, push: 1.6, reach: 1.15, points: 1 } as const;

/** 0 → 1 through each beat (the ring shrinks as it goes). */
export function beatPhase(t: number): number {
  return (((t % BEAT.period) + BEAT.period) % BEAT.period) / BEAT.period;
}

/** Is `t` inside the "now!" window at the end of a beat? */
export function isPerfect(t: number): boolean {
  return beatPhase(t) * BEAT.period >= BEAT.period - BEAT.window;
}

export type DinoState = 'ok' | 'rolling' | 'waddle';

export interface Dino {
  body: Body;
  human: boolean;
  state: DinoState;
  stateT: number;
  /** Facing (ring-space yaw, atan2(x, z)). */
  yaw: number;
  /** Tail swing: seconds left (> 0 while spinning) and cooldown. */
  swing: number;
  swingCd: number;
  points: number;
  /** Who bumped this dino last and how long ago (for knock-out credit). */
  lastHitBy: number;
  lastHitT: number;
  /** Slowed by a splash / soak (seconds left). */
  wet: number;
  /** AI wish. */
  think: number;
  tx: number;
  tz: number;
  wantSwing: boolean;
  skill: number;
  /** Visual squash spring. */
  squash: number;
  squashV: number;
  /** Times this dino was pushed out (for fun stats). */
  outs: number;
}

export interface BalloonSlot {
  x: number;
  z: number;
  /** Height of the balloon's centre above the mat. */
  y: number;
  kind: 'none' | 'plain' | 'weak';
  /** Seconds until it is refilled (when 'none'). */
  refill: number;
  /** 0..1 lowering-in animation. */
  grow: number;
}

export interface SumoState {
  dinos: Dino[];
  balloons: BalloonSlot[];
  clock: number;
  phase: 'countdown' | 'play' | 'end' | 'over';
  phaseT: number;
  weakPops: number;
  /** Seconds of play (drives the weak-eye beat ring). */
  beat: number;
  /** Super swings the player timed on the beat. */
  perfects: number;
}

export type SumoEvent =
  | { kind: 'bump'; a: number; b: number; speed: number }
  | { kind: 'swing'; dino: number }
  | { kind: 'perfect' }
  | { kind: 'tailHit'; from: number; to: number }
  | { kind: 'out'; dino: number; by: number }
  | { kind: 'back'; dino: number }
  | { kind: 'pop'; dino: number; slot: number; weak: boolean }
  | { kind: 'start' }
  | { kind: 'over' };

export interface SumoInput {
  x: number;
  z: number;
  sprint: boolean;
  swing: boolean;
}

/** Balloon slots: on the two crossing ropes, at three distances from the centre. */
export function balloonSlots(): BalloonSlot[] {
  const out: BalloonSlot[] = [];
  const dists = [1.25, 2.55, 3.7];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    dists.forEach((d, i) => {
      out.push({ x: Math.sin(a) * d, z: Math.cos(a) * d, y: 1.55 + ((i + k) % 2) * 0.25, kind: 'none', refill: 0, grow: 1 });
    });
  }
  return out;
}

/** Start spots: the player on the near side, friends round the ring. */
export function startSpots(): [number, number][] {
  return [
    [0, -2.6],
    [2.6, 0],
    [0, 2.6],
    [-2.6, 0],
  ];
}

export function createSumo(seconds: number = SUMO.seconds, skills: readonly number[] = [0.74, 0.68, 0.62]): SumoState {
  const dinos: Dino[] = startSpots().map(([x, z], i) => ({
    body: makeBody({ x, z, r: DINO.r, m: i === 0 ? DINO.playerM : DINO.m, bounce: DINO.bounce, drag: DINO.drag, h: DINO.h }),
    human: i === 0,
    state: 'ok',
    stateT: 0,
    yaw: Math.atan2(-x, -z),
    swing: 0,
    swingCd: 0,
    points: 0,
    lastHitBy: -1,
    lastHitT: 99,
    wet: 0,
    think: 0.3 + i * 0.1,
    tx: 0,
    tz: 0,
    wantSwing: false,
    skill: i === 0 ? 1 : skills[(i - 1) % skills.length],
    squash: 0,
    squashV: 0,
    outs: 0,
  }));
  const balloons = balloonSlots();
  // Seven plain and two weak balloons to start (deterministic pattern).
  balloons.forEach((b, i) => {
    b.kind = i % 4 === 1 ? 'weak' : i % 3 === 2 ? 'none' : 'plain';
    if (b.kind === 'none') b.refill = 1 + (i % 3);
  });
  let weak = balloons.filter((b) => b.kind === 'weak').length;
  for (const b of balloons) {
    if (b.kind === 'weak' && weak > BALLOON.weakMax) {
      b.kind = 'plain';
      weak--;
    }
  }
  return { dinos, balloons, clock: seconds, phase: 'countdown', phaseT: 0, weakPops: 0, beat: 0, perfects: 0 };
}

/** Rank of the player among all dinos (1 = top; ties go to the player). */
export function playerRank(s: SumoState): number {
  const me = s.dinos[0].points;
  return 1 + s.dinos.slice(1).filter((d) => d.points > me).length;
}

export function sumoStars(rank: number): number {
  return rank <= 1 ? 3 : rank === 2 ? 2 : 1;
}

export function sumoPrize(stars: number, weakPops: number): number {
  return 2 * stars + Math.min(3, weakPops);
}

/** Rubber band: friends ease off while they are ahead of the player. */
export function friendSkillScale(friendPoints: number, playerPoints: number): number {
  const lead = friendPoints - playerPoints;
  return lead > 2 ? Math.max(0.55, 1 - 0.08 * (lead - 2)) : 1;
}

/** Is a dino (centre) outside the noodle ring? */
export function isOut(x: number, z: number): boolean {
  return Math.hypot(x, z) > RING.r;
}

function refillKind(s: SumoState, rand: () => number): 'plain' | 'weak' {
  const weak = s.balloons.filter((b) => b.kind === 'weak').length;
  return weak < BALLOON.weakMax && rand() < 0.4 ? 'weak' : 'plain';
}

export interface SumoStepOptions {
  rand: () => number;
  input: SumoInput;
}

const contacts: Contact[] = [];

export function stepSumo(s: SumoState, dt: number, o: SumoStepOptions, out: SumoEvent[]): void {
  out.length = 0;
  s.phaseT += dt;
  for (const d of s.dinos) {
    d.squashV += (-80 * d.squash - 7 * d.squashV) * dt;
    d.squash += d.squashV * dt;
  }
  if (s.phase === 'countdown') {
    if (s.phaseT >= SUMO.countdown) {
      s.phase = 'play';
      s.phaseT = 0;
      out.push({ kind: 'start' });
    }
    return;
  }
  if (s.phase === 'over') return;
  const live = s.phase === 'play';
  if (live) {
    s.beat += dt;
    s.clock = Math.max(0, s.clock - dt);
    if (s.clock <= 0) {
      s.phase = 'end';
      s.phaseT = 0;
    }
  } else if (s.phaseT >= SUMO.endPause) {
    s.phase = 'over';
    out.push({ kind: 'over' });
    return;
  }

  const me = s.dinos[0];
  s.dinos.forEach((d, i) => {
    const b = d.body;
    d.stateT += dt;
    d.lastHitT += dt;
    d.swingCd = Math.max(0, d.swingCd - dt);
    d.wet = Math.max(0, d.wet - dt);
    if (d.swing > 0) {
      d.swing = Math.max(0, d.swing - dt);
    }
    if (d.state === 'rolling') {
      // Roll out to the mat edge, giggling, then waddle back in.
      if (d.stateT >= OUT.roll) {
        d.state = 'waddle';
        d.stateT = 0;
      }
      return;
    }
    if (d.state === 'waddle') {
      const l = Math.hypot(b.x, b.z) || 1;
      steerToward(b, (-b.x / l) * 2.4, (-b.z / l) * 2.4, 8, dt);
      d.yaw = Math.atan2(-b.x, -b.z);
      if (l < RING.r - 0.9 || d.stateT > 4) {
        d.state = 'ok';
        d.stateT = 0;
        b.ghost = 0;
        out.push({ kind: 'back', dino: i });
      }
      return;
    }
    const slow = d.wet > 0 ? 0.55 : 1;
    if (d.human) {
      const sp = (o.input.sprint ? MOVE.sprint : MOVE.speed) * slow;
      steerToward(b, o.input.x * sp, o.input.z * sp, MOVE.accel, dt);
      if (o.input.swing && live) startSwing(s, i, out);
    } else {
      d.think -= dt;
      if (d.think <= 0 && live) {
        d.think = AI.think[0] + o.rand() * (AI.think[1] - AI.think[0]);
        aiThink(s, i, o.rand);
      }
      const scale = friendSkillScale(d.points, me.points);
      const dx = d.tx - b.x;
      const dz = d.tz - b.z;
      const dist = Math.hypot(dx, dz);
      const sp = AI.speed * d.skill * scale * slow * Math.min(1, dist / 0.8);
      steerToward(b, dist > 0.01 ? (dx / dist) * sp : 0, dist > 0.01 ? (dz / dist) * sp : 0, AI.accel * d.skill, dt);
      if (d.wantSwing && live) {
        startSwing(s, i, out);
        d.wantSwing = false;
      }
    }
    const v = Math.hypot(b.vx, b.vz);
    if (v > 0.4 && d.swing <= 0) {
      const want = Math.atan2(b.vx, b.vz);
      let dy = want - d.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      d.yaw += dy * Math.min(1, dt * 10);
    }
  });

  const bodies = s.dinos.map((d) => d.body);
  for (const b of bodies) integrate(b, dt);
  collideBodies(bodies, contacts);
  for (const c of contacts) {
    const a = s.dinos[c.a];
    const b = s.dinos[c.b];
    a.squashV -= c.impulse * 1.6;
    b.squashV -= c.impulse * 1.6;
    // Credit: the one moving harder into the contact is the bumper.
    a.lastHitBy = c.b;
    a.lastHitT = 0;
    b.lastHitBy = c.a;
    b.lastHitT = 0;
    if (c.speed > 1.2) out.push({ kind: 'bump', a: c.a, b: c.b, speed: c.speed });
  }
  // The mat edge is a soft round wall.
  for (const d of s.dinos) {
    const b = d.body;
    const l = Math.hypot(b.x, b.z);
    const max = RING.mat - b.r;
    if (l > max) {
      const nx = b.x / l;
      const nz = b.z / l;
      b.x = nx * max;
      b.z = nz * max;
      const vn = b.vx * nx + b.vz * nz;
      if (vn > 0) {
        b.vx -= 1.6 * vn * nx;
        b.vz -= 1.6 * vn * nz;
      }
    }
  }
  // Out of the ring?
  s.dinos.forEach((d, i) => {
    if (d.state !== 'ok' || !live) return;
    const b = d.body;
    if (!isOut(b.x, b.z)) return;
    d.state = 'rolling';
    d.stateT = 0;
    d.outs++;
    b.ghost = 99; // no bumping while rolling and waddling back
    const l = Math.hypot(b.x, b.z) || 1;
    b.vx = (b.x / l) * 2.2;
    b.vz = (b.z / l) * 2.2;
    b.vy = 3;
    const by = d.lastHitT < 2.5 ? d.lastHitBy : -1;
    if (by >= 0 && by !== i) s.dinos[by].points += POINTS.out;
    out.push({ kind: 'out', dino: i, by });
  });

  // Balloons refill.
  for (const bl of s.balloons) {
    if (bl.kind === 'none') {
      bl.refill -= dt;
      if (bl.refill <= 0 && live) {
        bl.kind = refillKind(s, o.rand);
        bl.grow = 0;
      }
    } else bl.grow = Math.min(1, bl.grow + dt / 0.7);
  }
}

function startSwing(s: SumoState, i: number, out: SumoEvent[]): void {
  const d = s.dinos[i];
  if (d.swingCd > 0 || d.swing > 0) return;
  d.swing = TAIL.seconds;
  d.swingCd = TAIL.cooldown;
  out.push({ kind: 'swing', dino: i });
  const b = d.body;
  const perfect = d.human && isPerfect(s.beat);
  if (perfect) {
    d.points += BEAT.points;
    s.perfects++;
    out.push({ kind: 'perfect' });
  }
  const reach = TAIL.reach * (perfect ? BEAT.reach : 1);
  // The tail sweeps a full circle: bump everyone close, pop every balloon in reach.
  s.dinos.forEach((o, j) => {
    if (j === i || o.state !== 'ok') return;
    const dx = o.body.x - b.x;
    const dz = o.body.z - b.z;
    const dist = Math.hypot(dx, dz);
    if (dist > reach + o.body.r * 0.5 || dist < 1e-6) return;
    const k = TAIL.push * (d.human ? 1 : 0.8) * (perfect ? BEAT.push : 1);
    o.body.vx += (dx / dist) * k;
    o.body.vz += (dz / dist) * k;
    o.body.vy = Math.max(o.body.vy, 2.2);
    o.squashV -= 4;
    o.lastHitBy = i;
    o.lastHitT = 0;
    out.push({ kind: 'tailHit', from: i, to: j });
  });
  s.balloons.forEach((bl, k) => {
    if (bl.kind === 'none' || bl.grow < 0.6) return;
    // The friends can't see the magic (weak-eye) balloons, so their tails swish right past them.
    if (bl.kind === 'weak' && !d.human) return;
    if (Math.hypot(bl.x - b.x, bl.z - b.z) > TAIL.popReach) return;
    const weak = bl.kind === 'weak';
    bl.kind = 'none';
    bl.refill = 2.5 + ((k * 7) % 5) * 0.4;
    if (weak) {
      d.points += POINTS.weakBalloon;
      if (d.human) s.weakPops++;
      // Soak everybody else, and a little whoosh outward.
      s.dinos.forEach((o, j) => {
        if (j === i) return;
        o.wet = Math.max(o.wet, BALLOON.soakSlow);
        o.squashV -= 3;
      });
    } else {
      d.points += POINTS.balloon;
      d.wet = Math.max(d.wet, BALLOON.splashSlow);
    }
    out.push({ kind: 'pop', dino: i, slot: k, weak });
  });
}

function aiThink(s: SumoState, i: number, rand: () => number): void {
  const d = s.dinos[i];
  const b = d.body;
  // Mostly go for the closest dino (the player a bit more often); sometimes a plain balloon.
  let best = -1;
  let bestScore = Infinity;
  s.dinos.forEach((o, j) => {
    if (j === i || o.state !== 'ok') return;
    const dist = Math.hypot(o.body.x - b.x, o.body.z - b.z);
    const score = dist - (o.human ? 0.8 : 0) + rand() * 1.5;
    if (score < bestScore) {
      bestScore = score;
      best = j;
    }
  });
  const plain = s.balloons
    .map((bl, k) => ({ bl, k, dist: Math.hypot(bl.x - b.x, bl.z - b.z) }))
    .filter((e) => e.bl.kind === 'plain' && e.bl.grow >= 1)
    .sort((a, c) => a.dist - c.dist)[0];
  if (plain && (best < 0 || rand() < 0.3)) {
    d.tx = plain.bl.x;
    d.tz = plain.bl.z;
    d.wantSwing = plain.dist < TAIL.popReach * 0.8 && rand() < 0.7;
    return;
  }
  if (best >= 0) {
    const t = s.dinos[best].body;
    // Aim a bit past the target (a shove), wobbling off line.
    const dx = t.x - b.x;
    const dz = t.z - b.z;
    const dist = Math.hypot(dx, dz) || 1;
    d.tx = t.x + (dx / dist) * 0.8 + (rand() - 0.5) * 1.4;
    d.tz = t.z + (dz / dist) * 0.8 + (rand() - 0.5) * 1.4;
    d.wantSwing = dist < TAIL.reach * 0.9 && rand() < 0.35;
  } else {
    d.tx = (rand() - 0.5) * 2;
    d.tz = (rand() - 0.5) * 2;
  }
  // Stay off the very edge.
  const l = Math.hypot(d.tx, d.tz);
  if (l > RING.r - 1) {
    d.tx *= (RING.r - 1) / l;
    d.tz *= (RING.r - 1) / l;
  }
}
