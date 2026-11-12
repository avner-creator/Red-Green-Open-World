/**
 * Dino Sumo round logic (pure, no three.js). Four wobbly inflatable dinosaurs on a round mat try to
 * bump each other out of a pool-noodle ring. Best of 5 bouts: the first dino to 3 points wins.
 *
 * A bout: everybody hops in, then pushes and belly-charges. Space = belly charge: a short visible
 * wind-up (crouch back), then a bouncy lunge; whoever it hits is shoved (a braced dino much less).
 * Charges recharge on a cooldown, so timing matters. A dino pushed onto the rim teeters there,
 * windmilling: mash Space (or push back in) to hop back in, or a bump finishes the job. Ring-out =
 * a comic tumble and a point to the last dino who bumped them; a short cheer, then everybody hops
 * back to their spot for the next bout. Nobody is ever hurt.
 *
 * The three friends have personalities: shy (dodges, keeps to the middle, great at recovering),
 * bouncy (charges a lot, counter-charges, wobbly on the rim) and sneaky (braces, waits for you to
 * use your charge, then picks on whoever is teetering). A rubber band eases them off while they
 * lead and sharpens them while the player leads, so a weak player still wins bouts and a strong one
 * gets a fight.
 *
 * Water balloons hang over the ring: charging under one boinks it with your belly. Plain ones
 * splash the dinos near you (soaked dinos are slow and slippery: easy to bump out). The weak-eye
 * balloons (only the player can see them, so only the player's charge pops them) soak everybody
 * else. And a weak-eye beat ring pulses round your dino: charge while it hugs the dino for a super
 * charge (a much bigger shove).
 * Ring space: origin at the ring centre, metres, x/z on the mat (+Z = the booth side's far end).
 */
import { collideBodies, integrate, makeBody, steerToward } from '../bubbleball/bodies';
import type { Body, Contact } from '../bubbleball/bodies';

export const RING = { r: 4.4, mat: 5.7 } as const;
export const DINO = { r: 0.72, m: 1.5, playerM: 1.6, bounce: 0.5, drag: 3.0, h: 2 } as const;
/**
 * Round clock: it runs through the bouts and the cheer/hop pauses between them, so a whole round
 * (3-2-1, clock, end) is about a minute (QA8 m8: 75 s of live play made 92 s rounds). Best of 5 =
 * first to `target` points. `pointPause`: the cheer after a ring-out; `hop`: everybody hops back.
 */
export const SUMO = { seconds: 54, countdown: 3, endPause: 2.6, target: 3, pointPause: 2.4, hop: 1.0 } as const;
export const MOVE = { speed: 3.9, sprint: 4.9, accel: 12 } as const;
export const AI = { speed: 3.5, accel: 10, think: [0.22, 0.5] as const } as const;
/**
 * Belly charge: wind-up (the visible crouch), lunge speed and time, cooldown, the shove given to
 * whoever it hits, the charger's belly bounce back, how close a balloon must hang over the charge
 * path to be popped, and the friends' share of the player's shove.
 */
export const DASH = {
  windup: 0.3,
  speed: 7.2,
  seconds: 0.3,
  cooldown: 1.5,
  vy: 2.2,
  shove: 4.1,
  bounceBack: 2.6,
  popReach: 1.15,
  aiShove: 0.85,
} as const;
/** Kept for the visuals (the tail flick during a charge). */
export const TAIL = { seconds: DASH.seconds } as const;
/** Brace: plant your feet (heavier, a charge shoves you much less) for a moment. */
export const BRACE = { seconds: 0.6, mass: 3, shoveCut: 0.35, cooldown: 1.4 } as const;
/**
 * The rim: a dino crossing the noodle slower than `fast` teeters for up to `seconds`. Recover
 * meter: each charge-key tap adds `tap`, pushing back in adds `hold` per second; full = hop back in.
 */
export const TEETER = { fast: 4.8, seconds: 1.4, tap: 0.24, hold: 0.5, inset: 0.75, grace: 0.8 } as const;
export const OUT = { roll: 1.1, back: 1.6 } as const;
/** Soaked dinos are slower and get shoved further. */
export const BALLOON = { respawn: 3.5, weakMax: 2, splashSlow: 1.4, soakSlow: 2.6, splashReach: 2.4, wetShove: 1.35 } as const;
export const POINTS = { out: 1 } as const;
/**
 * Glasses "time it": a weak-eye ring pulses round the player's dino, shrinking in to the dino once
 * per `period`. A charge in the last `window` seconds (when the ring hugs the dino) is a super
 * charge: a much bigger shove. With the weak eye shut the beat is invisible.
 */
export const BEAT = { period: 1.5, window: 0.32, push: 1.7 } as const;

export type Personality = 'shy' | 'bouncy' | 'sneaky';
export interface Traits {
  /** How keen to charge (0..1). */
  aggro: number;
  /** Reactions to a charge aimed at them (chances, before skill and rubber band). */
  dodge: number;
  brace: number;
  counter: number;
  /** Rim recovery per second (AI's mash rate). */
  recover: number;
  speed: number;
  /** How far from the rim they like to stay (m). */
  edge: number;
}
export const TRAITS: Record<Personality, Traits> = {
  shy: { aggro: 0.4, dodge: 0.4, brace: 0.15, counter: 0.08, recover: 0.8, speed: 0.95, edge: 1.3 },
  bouncy: { aggro: 0.85, dodge: 0.08, brace: 0.08, counter: 0.45, recover: 0.45, speed: 1.06, edge: 0.6 },
  sneaky: { aggro: 0.6, dodge: 0.2, brace: 0.3, counter: 0.18, recover: 0.6, speed: 1, edge: 1.0 },
};
export const PERSONALITIES: readonly Personality[] = ['shy', 'bouncy', 'sneaky'];

/** 0 → 1 through each beat (the ring shrinks as it goes). */
export function beatPhase(t: number): number {
  return (((t % BEAT.period) + BEAT.period) % BEAT.period) / BEAT.period;
}

/** Is `t` inside the "now!" window at the end of a beat? */
export function isPerfect(t: number): boolean {
  return beatPhase(t) * BEAT.period >= BEAT.period - BEAT.window;
}

export type DinoState = 'ok' | 'teeter' | 'rolling' | 'waddle' | 'hop';

export interface Dino {
  body: Body;
  human: boolean;
  personality: Personality | null;
  state: DinoState;
  stateT: number;
  /** Facing (ring-space yaw, atan2(x, z)). */
  yaw: number;
  /** Wind-up seconds left (> 0 while crouching back before the lunge). */
  windup: number;
  /** Belly charge: seconds left (> 0 while lunging), cooldown, direction, super (on the beat). */
  swing: number;
  swingCd: number;
  dashX: number;
  dashZ: number;
  superDash: boolean;
  /** Brace seconds left and its cooldown. */
  brace: number;
  braceCd: number;
  /** Rim recovery meter 0..1 (while teetering). */
  recover: number;
  /** Seconds of rim grace after a recovery (no instant re-teeter). */
  grace: number;
  /** Ring-outs credited to this dino (the score). */
  points: number;
  /** Who bumped this dino last and how long ago (for ring-out credit). */
  lastHitBy: number;
  lastHitT: number;
  /** Slowed and slippery from a splash / soak (seconds left). */
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
  /** Hop-back start spot (bout reset). */
  hopX: number;
  hopZ: number;
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
  /** countdown → play → (point → hop → play)* → end → over. */
  phase: 'countdown' | 'play' | 'point' | 'hop' | 'end' | 'over';
  phaseT: number;
  weakPops: number;
  /** Seconds of play (drives the weak-eye beat ring). */
  beat: number;
  /** Super charges the player timed on the beat. */
  perfects: number;
  /** Bouts played (ring-outs that ended a bout). */
  bouts: number;
  /** The last bout's ring-out: who went out and who scored (-1 = nobody). */
  lastOut: { dino: number; by: number } | null;
  /** Seconds of live play so far (for stats and tests). */
  played: number;
}

export type SumoEvent =
  | { kind: 'bump'; a: number; b: number; speed: number }
  /** A belly charge winds up (visible crouch). */
  | { kind: 'windup'; dino: number }
  /** A belly charge lunges. */
  | { kind: 'swing'; dino: number }
  | { kind: 'perfect' }
  /** A charge hit someone (big shove); `braced` = they planted their feet. */
  | { kind: 'tailHit'; from: number; to: number; braced: boolean }
  /** Two charges met head on: both bounce back. */
  | { kind: 'bonk'; a: number; b: number }
  | { kind: 'brace'; dino: number }
  | { kind: 'dodge'; dino: number }
  /** On the rim, windmilling. */
  | { kind: 'teeter'; dino: number }
  /** Hopped back in from the rim. */
  | { kind: 'recover'; dino: number }
  | { kind: 'out'; dino: number; by: number }
  /** The bout is over: a point (by = -1: nobody scores). */
  | { kind: 'point'; dino: number; by: number }
  /** Everybody hops back to their spot. */
  | { kind: 'hop' }
  | { kind: 'back'; dino: number }
  | { kind: 'pop'; dino: number; slot: number; weak: boolean }
  /** A bout starts (bout 0 = the first GO). */
  | { kind: 'start'; bout: number }
  | { kind: 'over' };

export interface SumoInput {
  x: number;
  z: number;
  sprint: boolean;
  /** Charge pressed this frame. */
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
    [0, -2.4],
    [2.4, 0],
    [0, 2.4],
    [-2.4, 0],
  ];
}

export function createSumo(seconds: number = SUMO.seconds, skills: readonly number[] = [0.82, 0.86, 0.84]): SumoState {
  const dinos: Dino[] = startSpots().map(([x, z], i) => ({
    body: makeBody({ x, z, r: DINO.r, m: i === 0 ? DINO.playerM : DINO.m, bounce: DINO.bounce, drag: DINO.drag, h: DINO.h }),
    human: i === 0,
    personality: i === 0 ? null : PERSONALITIES[(i - 1) % PERSONALITIES.length],
    state: 'ok',
    stateT: 0,
    yaw: Math.atan2(-x, -z),
    windup: 0,
    swing: 0,
    swingCd: 0,
    dashX: 0,
    dashZ: 1,
    superDash: false,
    brace: 0,
    braceCd: 0,
    recover: 0,
    grace: 0,
    points: 0,
    lastHitBy: -1,
    lastHitT: 99,
    wet: 0,
    think: 0.4 + i * 0.15,
    tx: 0,
    tz: 0,
    wantSwing: false,
    skill: i === 0 ? 1 : skills[(i - 1) % skills.length],
    squash: 0,
    squashV: 0,
    outs: 0,
    hopX: x,
    hopZ: z,
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
  return { dinos, balloons, clock: seconds, phase: 'countdown', phaseT: 0, weakPops: 0, beat: 0, perfects: 0, bouts: 0, lastOut: null, played: 0 };
}

/** Rank of the player among all dinos (1 = top; ties go to the player). */
export function playerRank(s: SumoState): number {
  const me = s.dinos[0].points;
  return 1 + s.dinos.slice(1).filter((d) => d.points > me).length;
}

export function sumoStars(rank: number): number {
  return rank <= 1 ? 3 : rank === 2 ? 2 : 1;
}

/** Gems: 2 / 4 / 6 by stars, plus one per magic balloon or super charge (max 3). */
export function sumoPrize(stars: number, bonus: number): number {
  return 2 * stars + Math.min(3, bonus);
}

/**
 * Rubber band for a friend: < 1 eases off while they lead the player, > 1 sharpens up while the
 * player leads (a strong player gets a fight).
 */
export function friendSkillScale(friendPoints: number, playerPoints: number): number {
  const lead = friendPoints - playerPoints;
  return lead > 0 ? Math.max(0.6, 1 - 0.18 * lead) : lead < 0 ? Math.min(1.18, 1 - 0.09 * lead) : 1;
}

/** Is a dino (centre) outside the noodle ring? */
export function isOut(x: number, z: number): boolean {
  return Math.hypot(x, z) > RING.r;
}

/** Points the player needs to be "behind" (for the player's own rim help). */
function playerBehind(s: SumoState): number {
  const me = s.dinos[0].points;
  return Math.max(0, Math.max(...s.dinos.slice(1).map((d) => d.points)) - me);
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
const SUB_DT = 1 / 120;
const subOut: SumoEvent[] = [];

/** Advance the round by dt (sub-stepped, so a fast charge never tunnels). `out` is cleared first. */
export function stepSumo(s: SumoState, dt: number, o: SumoStepOptions, out: SumoEvent[]): void {
  out.length = 0;
  const n = Math.max(1, Math.ceil(dt / SUB_DT - 1e-9));
  const h = dt / n;
  const press = o.input.swing;
  for (let k = 0; k < n; k++) {
    const sub: SumoStepOptions = k === 0 || !press ? o : { ...o, input: { ...o.input, swing: false } };
    stepOnce(s, h, sub, subOut);
    for (const e of subOut) out.push(e);
    if (s.phase === 'over') break;
  }
}

function resetForBout(s: SumoState): void {
  s.dinos.forEach((d) => {
    const b = d.body;
    d.state = 'ok';
    d.stateT = 0;
    d.windup = d.swing = d.swingCd = d.brace = d.braceCd = d.recover = d.grace = 0;
    d.wantSwing = false;
    d.lastHitBy = -1;
    d.lastHitT = 99;
    b.x = d.hopX;
    b.z = d.hopZ;
    b.vx = b.vz = b.vy = b.y = 0;
    b.ghost = 0;
    d.yaw = Math.atan2(-b.x, -b.z);
    d.think = 0.25 + 0.12 * s.dinos.indexOf(d);
  });
}

function stepOnce(s: SumoState, dt: number, o: SumoStepOptions, out: SumoEvent[]): void {
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
      out.push({ kind: 'start', bout: 0 });
    }
    return;
  }
  if (s.phase === 'over') return;
  if (s.phase === 'end') {
    stepPhysics(s, dt, o, out, false);
    if (s.phaseT >= SUMO.endPause) {
      s.phase = 'over';
      out.push({ kind: 'over' });
    }
    return;
  }
  if (s.phase === 'point') {
    s.clock = Math.max(0, s.clock - dt);
    stepPhysics(s, dt, o, out, false);
    if (s.phaseT >= SUMO.pointPause) {
      if (s.dinos.some((d) => d.points >= SUMO.target) || s.clock <= 0) {
        s.phase = 'end';
        s.phaseT = 0;
        return;
      }
      s.phase = 'hop';
      s.phaseT = 0;
      s.dinos.forEach((d) => {
        // Remember where each dino hops from (stored in tx/tz) to arc back to its spot.
        d.tx = d.body.x;
        d.tz = d.body.z;
        d.state = 'hop';
        d.stateT = 0;
        d.body.ghost = 99;
      });
      out.push({ kind: 'hop' });
    }
    return;
  }
  if (s.phase === 'hop') {
    s.clock = Math.max(0, s.clock - dt);
    const k = Math.min(1, s.phaseT / SUMO.hop);
    const e = k * k * (3 - 2 * k);
    s.dinos.forEach((d) => {
      const b = d.body;
      b.x = d.tx + (d.hopX - d.tx) * e;
      b.z = d.tz + (d.hopZ - d.tz) * e;
      b.y = 4 * 1.4 * k * (1 - k);
      b.vx = (d.hopX - d.tx) / SUMO.hop;
      b.vz = (d.hopZ - d.tz) / SUMO.hop;
      d.yaw = Math.atan2(-b.x, -b.z);
    });
    if (k >= 1 && s.clock <= 0) {
      s.phase = 'end';
      s.phaseT = 0;
      return;
    }
    if (k >= 1) {
      resetForBout(s);
      s.phase = 'play';
      s.phaseT = 0;
      out.push({ kind: 'start', bout: s.bouts });
    }
    return;
  }
  // Live bout.
  s.beat += dt;
  s.played += dt;
  s.clock = Math.max(0, s.clock - dt);
  stepPhysics(s, dt, o, out, true);
  if (s.phase === 'play' && s.clock <= 0) {
    s.phase = 'end';
    s.phaseT = 0;
  }
}

function stepPhysics(s: SumoState, dt: number, o: SumoStepOptions, out: SumoEvent[], live: boolean): void {
  const me = s.dinos[0];
  const behind = playerBehind(s);
  s.dinos.forEach((d, i) => {
    const b = d.body;
    d.stateT += dt;
    d.lastHitT += dt;
    d.swingCd = Math.max(0, d.swingCd - dt);
    d.braceCd = Math.max(0, d.braceCd - dt);
    d.brace = Math.max(0, d.brace - dt);
    d.grace = Math.max(0, d.grace - dt);
    d.wet = Math.max(0, d.wet - dt);
    b.m = (d.human ? DINO.playerM : DINO.m) * (d.brace > 0 ? BRACE.mass : 1);
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
    if (d.state === 'teeter') {
      // Windmilling on the rim: stuck in place; mash (or push in) to hop back.
      b.vx = b.vz = 0;
      const l = Math.hypot(b.x, b.z) || 1;
      d.yaw = Math.atan2(-b.x, -b.z);
      if (!live) return;
      if (d.human) {
        if (o.input.swing) d.recover += TEETER.tap;
        const inward = -(o.input.x * b.x + o.input.z * b.z) / l;
        if (inward > 0.3) d.recover += TEETER.hold * inward * dt;
        d.recover += 0.12 * behind * dt; // a little help while behind
      } else {
        const t = TRAITS[d.personality ?? 'sneaky'];
        d.recover += t.recover * d.skill * friendSkillScale(d.points, me.points) * dt;
      }
      if (d.recover >= 1) {
        d.state = 'ok';
        d.stateT = 0;
        d.recover = 0;
        d.grace = TEETER.grace;
        b.x = (b.x / l) * (RING.r - TEETER.inset);
        b.z = (b.z / l) * (RING.r - TEETER.inset);
        b.vx = (-b.x / l) * 1.5;
        b.vz = (-b.z / l) * 1.5;
        b.vy = 3.2;
        d.squashV += 6;
        out.push({ kind: 'recover', dino: i });
      } else if (d.stateT >= TEETER.seconds) ringOut(s, i, out);
      return;
    }
    if (d.windup > 0) {
      // Crouching back before the lunge (visible tell): slows down; the player can still aim.
      steerToward(b, 0, 0, 14, dt);
      if (d.human && Math.hypot(o.input.x, o.input.z) > 0.2) {
        const l = Math.hypot(o.input.x, o.input.z);
        d.dashX = o.input.x / l;
        d.dashZ = o.input.z / l;
      }
      d.yaw = Math.atan2(d.dashX, d.dashZ);
      d.windup = Math.max(0, d.windup - dt);
      if (d.windup <= 0 && live) lunge(s, i, out);
      return;
    }
    if (d.swing > 0) {
      // Charging: a fast lunge, no steering; boink any balloon hanging over the path.
      d.swing = Math.max(0, d.swing - dt);
      const sp = DASH.speed * (d.human ? 1 : 0.86 + 0.14 * d.skill) * (d.wet > 0 ? 0.8 : 1);
      steerToward(b, d.dashX * sp, d.dashZ * sp, 80, dt);
      d.yaw = Math.atan2(d.dashX, d.dashZ);
      if (live) popUnder(s, i, out);
      return;
    }
    const slow = (d.wet > 0 ? 0.6 : 1) * (d.brace > 0 ? 0.15 : 1);
    if (!live) {
      steerToward(b, 0, 0, 6, dt);
    } else if (d.human) {
      const sp = (o.input.sprint ? MOVE.sprint : MOVE.speed) * slow;
      steerToward(b, o.input.x * sp, o.input.z * sp, MOVE.accel * (d.wet > 0 ? 0.6 : 1), dt);
      if (o.input.swing) startWindup(s, i, o.input.x, o.input.z, o.rand, out);
    } else {
      d.think -= dt;
      if (d.think <= 0) {
        d.think = AI.think[0] + o.rand() * (AI.think[1] - AI.think[0]);
        aiThink(s, i, o.rand);
      }
      const t = TRAITS[d.personality ?? 'sneaky'];
      const scale = friendSkillScale(d.points, me.points);
      const dx = d.tx - b.x;
      const dz = d.tz - b.z;
      const dist = Math.hypot(dx, dz);
      const sp = AI.speed * t.speed * d.skill * Math.min(1.05, scale) * slow * Math.min(1, dist / 0.8);
      steerToward(b, dist > 0.01 ? (dx / dist) * sp : 0, dist > 0.01 ? (dz / dist) * sp : 0, AI.accel * d.skill, dt);
      if (d.wantSwing) {
        d.wantSwing = false;
        const tgt = nearestOther(s, i);
        if (tgt >= 0) startWindup(s, i, s.dinos[tgt].body.x - b.x, s.dinos[tgt].body.z - b.z, o.rand, out);
      }
    }
    const v = Math.hypot(b.vx, b.vz);
    if (v > 0.4) {
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
    a.squashV -= c.impulse * 2;
    b.squashV -= c.impulse * 2;
    a.lastHitBy = c.b;
    a.lastHitT = 0;
    b.lastHitBy = c.a;
    b.lastHitT = 0;
    if (!live) continue;
    // A bump on a teetering dino tips it over the rim.
    if (a.state === 'teeter' || b.state === 'teeter') {
      if (a.state === 'teeter' && c.speed > 0.3) ringOut(s, c.a, out);
      if (b.state === 'teeter' && c.speed > 0.3) ringOut(s, c.b, out);
      continue;
    }
    const da = a.swing > 0;
    const db = b.swing > 0;
    if (da && db) {
      // Head-on belly bonk: both bounce back, boing.
      for (const [d, sgn] of [
        [a, -1],
        [b, 1],
      ] as const) {
        d.swing = 0;
        d.body.vx += sgn * c.nx * DASH.bounceBack * 1.3;
        d.body.vz += sgn * c.nz * DASH.bounceBack * 1.3;
        d.body.vy = Math.max(d.body.vy, DASH.vy);
        d.squashV -= 6;
      }
      out.push({ kind: 'bonk', a: c.a, b: c.b });
      continue;
    }
    if (da || db) {
      const from = da ? c.a : c.b;
      const to = da ? c.b : c.a;
      const hitter = s.dinos[from];
      const hit = s.dinos[to];
      const sgn = da ? 1 : -1; // normal points from a to b
      const braced = hit.brace > 0;
      const k =
        DASH.shove *
        (hitter.human ? 1 : DASH.aiShove * Math.min(1.1, friendSkillScale(hitter.points, me.points))) *
        (hitter.superDash ? BEAT.push : 1) *
        (hit.wet > 0 ? BALLOON.wetShove : 1) *
        (braced ? BRACE.shoveCut : 1);
      hit.body.vx += sgn * c.nx * k;
      hit.body.vz += sgn * c.nz * k;
      hit.body.vy = Math.max(hit.body.vy, braced ? 0.8 : 2.4);
      hit.squashV -= 8;
      hit.lastHitBy = from;
      hit.lastHitT = 0;
      // The charger belly-bounces back (much more off a braced dino).
      hitter.swing = 0;
      const back = DASH.bounceBack * (braced ? 1.8 : 1);
      hitter.body.vx -= sgn * c.nx * back;
      hitter.body.vz -= sgn * c.nz * back;
      hitter.body.vy = Math.max(hitter.body.vy, DASH.vy);
      hitter.squashV -= 6;
      out.push({ kind: 'tailHit', from, to, braced });
      continue;
    }
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
  if (!live) return;
  // On the rim: a slow crossing teeters, a fast one flies straight out.
  s.dinos.forEach((d, i) => {
    if (d.state !== 'ok' || s.phase !== 'play') return;
    const b = d.body;
    const l = Math.hypot(b.x, b.z);
    if (l <= RING.r) return;
    const vOut = (b.vx * b.x + b.vz * b.z) / (l || 1);
    if (vOut > TEETER.fast || d.grace > 0) {
      ringOut(s, i, out);
      return;
    }
    d.state = 'teeter';
    d.stateT = 0;
    d.recover = 0;
    d.windup = d.swing = d.brace = 0;
    b.x = (b.x / l) * (RING.r + 0.05);
    b.z = (b.z / l) * (RING.r + 0.05);
    b.vx = b.vz = 0;
    d.squashV -= 4;
    out.push({ kind: 'teeter', dino: i });
  });

  // Balloons refill.
  for (const bl of s.balloons) {
    if (bl.kind === 'none') {
      bl.refill -= dt;
      if (bl.refill <= 0) {
        bl.kind = refillKind(s, o.rand);
        bl.grow = 0;
      }
    } else bl.grow = Math.min(1, bl.grow + dt / 0.7);
  }
}

/** Over the noodle: a tumble, a point for the last bumper, and the bout ends. */
function ringOut(s: SumoState, i: number, out: SumoEvent[]): void {
  const d = s.dinos[i];
  if (d.state === 'rolling' || d.state === 'waddle' || s.phase !== 'play') return;
  const b = d.body;
  d.state = 'rolling';
  d.stateT = 0;
  d.swing = d.windup = d.brace = 0;
  d.outs++;
  b.ghost = 99; // no bumping while rolling
  const l = Math.hypot(b.x, b.z) || 1;
  b.vx = (b.x / l) * 2.2;
  b.vz = (b.z / l) * 2.2;
  b.vy = 3;
  const by = d.lastHitT < 4 && d.lastHitBy !== i ? d.lastHitBy : -1;
  if (by >= 0) s.dinos[by].points += POINTS.out;
  out.push({ kind: 'out', dino: i, by });
  s.bouts++;
  s.lastOut = { dino: i, by };
  s.phase = 'point';
  s.phaseT = 0;
  out.push({ kind: 'point', dino: i, by });
}

function nearestOther(s: SumoState, i: number): number {
  const b = s.dinos[i].body;
  let best = -1;
  let bd = Infinity;
  s.dinos.forEach((o, j) => {
    if (j === i || (o.state !== 'ok' && o.state !== 'teeter')) return;
    const d = Math.hypot(o.body.x - b.x, o.body.z - b.z);
    if (d < bd) {
      bd = d;
      best = j;
    }
  });
  return best;
}

/** Start a belly charge's wind-up toward (dx, dz) (falls back to the facing direction). */
function startWindup(s: SumoState, i: number, dx: number, dz: number, rand: () => number, out: SumoEvent[]): void {
  const d = s.dinos[i];
  if (d.swingCd > 0 || d.swing > 0 || d.windup > 0 || d.state !== 'ok') return;
  let l = Math.hypot(dx, dz);
  if (l < 0.2) {
    dx = Math.sin(d.yaw);
    dz = Math.cos(d.yaw);
    l = 1;
  }
  d.dashX = dx / l;
  d.dashZ = dz / l;
  d.windup = DASH.windup;
  d.swingCd = DASH.cooldown + DASH.windup;
  d.squashV -= 4; // crouch
  out.push({ kind: 'windup', dino: i });
  react(s, i, rand, out);
}

/** The friends see a wind-up aimed at them: dodge, brace or counter-charge (by personality). */
function react(s: SumoState, from: number, rand: () => number, out: SumoEvent[]): void {
  const a = s.dinos[from];
  const me = s.dinos[0];
  s.dinos.forEach((d, j) => {
    if (j === from || d.human || d.state !== 'ok' || d.swing > 0 || d.windup > 0) return;
    const rx = d.body.x - a.body.x;
    const rz = d.body.z - a.body.z;
    const dist = Math.hypot(rx, rz);
    if (dist > 3.6 || dist < 1e-3) return;
    if ((rx * a.dashX + rz * a.dashZ) / dist < 0.75) return; // not aimed at them
    const t = TRAITS[d.personality ?? 'sneaky'];
    // Rubber band: when the player is the attacker and behind, the friends react less.
    const band = from === 0 ? friendSkillScale(d.points, me.points) : 1;
    const k = d.skill * band;
    const roll = rand();
    if (roll < t.dodge * k) {
      // Sidestep (toward the middle side).
      let px = -a.dashZ;
      let pz = a.dashX;
      if (px * -d.body.x + pz * -d.body.z < 0) {
        px = -px;
        pz = -pz;
      }
      d.body.vx += px * 4.2;
      d.body.vz += pz * 4.2;
      d.tx = d.body.x + px * 1.6;
      d.tz = d.body.z + pz * 1.6;
      d.think = 0.45;
      out.push({ kind: 'dodge', dino: j });
    } else if (roll < (t.dodge + t.brace) * k && d.braceCd <= 0) {
      d.brace = BRACE.seconds;
      d.braceCd = BRACE.cooldown;
      d.squashV -= 5;
      out.push({ kind: 'brace', dino: j });
    } else if (roll < (t.dodge + t.brace + t.counter) * k && d.swingCd <= 0) {
      d.wantSwing = false;
      startWindup(s, j, -rx, -rz, rand, out);
    }
  });
}

/** The wind-up is over: lunge. */
function lunge(s: SumoState, i: number, out: SumoEvent[]): void {
  const d = s.dinos[i];
  d.swing = DASH.seconds;
  d.body.vy = Math.max(d.body.vy, DASH.vy * 0.6);
  d.squashV += 7; // stretch as it springs off
  d.superDash = d.human && isPerfect(s.beat);
  out.push({ kind: 'swing', dino: i });
  if (d.superDash) {
    s.perfects++;
    out.push({ kind: 'perfect' });
  }
}

/** A charging dino boinks the balloons hanging over it. */
function popUnder(s: SumoState, i: number, out: SumoEvent[]): void {
  const d = s.dinos[i];
  const b = d.body;
  s.balloons.forEach((bl, k) => {
    if (bl.kind === 'none' || bl.grow < 0.6) return;
    // The friends can't see the magic (weak-eye) balloons, so they charge right past them.
    if (bl.kind === 'weak' && !d.human) return;
    if (Math.hypot(bl.x - b.x, bl.z - b.z) > DASH.popReach) return;
    const weak = bl.kind === 'weak';
    bl.kind = 'none';
    bl.refill = 2.5 + ((k * 7) % 5) * 0.4;
    s.dinos.forEach((o, j) => {
      if (j === i) return;
      if (weak) {
        // Magic balloon: soak everybody else.
        o.wet = Math.max(o.wet, BALLOON.soakSlow);
        o.squashV -= 3;
      } else if (Math.hypot(o.body.x - b.x, o.body.z - b.z) < BALLOON.splashReach) {
        o.wet = Math.max(o.wet, BALLOON.splashSlow);
        o.squashV -= 2;
      }
    });
    if (weak && d.human) s.weakPops++;
    out.push({ kind: 'pop', dino: i, slot: k, weak });
  });
}

function aiThink(s: SumoState, i: number, rand: () => number): void {
  const d = s.dinos[i];
  const b = d.body;
  const t = TRAITS[d.personality ?? 'sneaky'];
  const me = s.dinos[0];
  const band = friendSkillScale(d.points, me.points);
  const l = Math.hypot(b.x, b.z);
  // Too near the rim: get back to the middle first (everybody recovers from the edge).
  if (l > RING.r - t.edge * 0.75) {
    d.tx = (-b.x / (l || 1)) * 0.6;
    d.tz = (-b.z / (l || 1)) * 0.6;
    d.wantSwing = false;
    return;
  }
  // Pick a target: close, near the edge, teetering (sneaky loves those), the player a little
  // (more while the player leads).
  let best = -1;
  let bestScore = Infinity;
  s.dinos.forEach((o, j) => {
    if (j === i || (o.state !== 'ok' && o.state !== 'teeter')) return;
    const dist = Math.hypot(o.body.x - b.x, o.body.z - b.z);
    const edge = Math.hypot(o.body.x, o.body.z) / RING.r;
    let score = dist - edge * 1.2 + rand() * 1.6;
    if (o.human) score -= band > 1 ? 1.2 : band < 1 ? -0.6 : 0.4;
    if (o.state === 'teeter') score -= d.personality === 'sneaky' ? 3 : 1.2;
    if (d.personality === 'sneaky' && o.swingCd > 0.4) score -= 0.8;
    if (score < bestScore) {
      bestScore = score;
      best = j;
    }
  });
  const plain = s.balloons
    .map((bl, k) => ({ bl, k, dist: Math.hypot(bl.x - b.x, bl.z - b.z) }))
    .filter((e) => e.bl.kind === 'plain' && e.bl.grow >= 1)
    .sort((a, c) => a.dist - c.dist)[0];
  if (plain && (best < 0 || rand() < 0.1)) {
    d.tx = plain.bl.x;
    d.tz = plain.bl.z;
    d.wantSwing = false;
  } else if (best >= 0) {
    const o = s.dinos[best];
    const tb = o.body;
    const dx = tb.x - b.x;
    const dz = tb.z - b.z;
    const dist = Math.hypot(dx, dz) || 1;
    if (d.personality === 'shy' && o.state !== 'teeter' && Math.hypot(tb.x, tb.z) < RING.r - 1.4 && dist < 2.2) {
      // Shy: keep a polite distance unless the target is near the rim.
      d.tx = b.x - (dx / dist) * 0.8 + (rand() - 0.5);
      d.tz = b.z - (dz / dist) * 0.8 + (rand() - 0.5);
    } else {
      // Get on the middle side of the target, then push it outward.
      const tl = Math.hypot(tb.x, tb.z) || 1;
      const sx = tb.x - (tb.x / tl) * 1.2;
      const sz = tb.z - (tb.z / tl) * 1.2;
      const lined = Math.hypot(sx - b.x, sz - b.z) < 1.1 || dist < 1.6;
      d.tx = (lined ? tb.x + (dx / dist) * 0.6 : sx) + (rand() - 0.5) * 0.8;
      d.tz = (lined ? tb.z + (dz / dist) * 0.6 : sz) + (rand() - 0.5) * 0.8;
    }
    const keen = t.aggro * (0.55 + 0.45 * d.skill) * Math.min(1.1, band) * (o.state === 'teeter' ? 1.6 : 1);
    // Sneaky waits until the player has used their charge.
    const wait = d.personality === 'sneaky' && o.human && o.swingCd <= 0 && rand() < 0.5;
    d.wantSwing = !wait && dist < 2.5 && rand() < keen * 0.55;
    return;
  } else {
    d.tx = (rand() - 0.5) * 2;
    d.tz = (rand() - 0.5) * 2;
  }
  // Stay off the very edge.
  const tl = Math.hypot(d.tx, d.tz);
  if (tl > RING.r - 1) {
    d.tx *= (RING.r - 1) / tl;
    d.tz *= (RING.r - 1) / tl;
  }
}
