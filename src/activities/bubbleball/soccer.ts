/**
 * Bubble Ball match logic (pure, no three.js): 3-a-side soccer in giant bubbles on a small walled
 * pitch. Pitch space: +X is the home team's attack direction (the player's team), Z across, metres,
 * origin at the centre spot. The friends are cheerful and a bit clumsy: they react late, wobble
 * off line, fall over a lot and ease off when they lead, so a child who tries will win.
 */
import { collideBodies, collideWalls, integrate, makeBody, steerToward } from './bodies';
import type { Body, Contact, Segment } from './bodies';

export const PITCH = { hx: 9.6, hz: 5.4, goalHalf: 2.5, goalDepth: 1.5, goalHeight: 2.3, corner: 1.3 } as const;
export const BUBBLE = { r: 0.9, m: 1, bounce: 0.92, h: 2.1, drag: 1.6 } as const;
export const BALL = { r: 0.72, m: 0.4, bounce: 0.86, drag: 0.4 } as const;
/** A ball resting against a puffy wall this long gets puffed back into play. */
export const UNSTICK = { seconds: 1.4, speed: 1.6, push: 4.5 } as const;
export const MATCH = { seconds: 60, countdown: 3, goalPause: 2.6, endPause: 1.6 } as const;
export const MOVE = { speed: 6.4, sprint: 8.2, accel: 18, hopVy: 5.4, hopBoost: 3.2, hopCooldown: 0.8 } as const;
export const AI = { speed: 4.6, accel: 11, think: [0.28, 0.6] as const } as const;
export const FLIP = { impulse: 4.6, seconds: 0.95 } as const;
export const RING = { r: 1.25, cy: 1.2, life: 9, gap: [3, 6] as const, pass: 1.05, chargeSeconds: 14, drift: 1.3, driftRate: 1.1 } as const;

/** Where a drifting hoop is across the pitch at `age` (stays inside the side walls). */
export function ringZ(z0: number, age: number): number {
  const lim = PITCH.hz - RING.r - 0.2;
  return Math.max(-lim, Math.min(lim, z0 + Math.sin(age * RING.driftRate) * RING.drift));
}

export type Team = 'home' | 'away';
export type Role = 'striker' | 'support' | 'keeper';

export interface Agent {
  body: Body;
  team: Team;
  role: Role;
  human: boolean;
  /** 0..1 clumsiness-adjusted ability (1 = the player's top speed and accel). */
  skill: number;
  /** Seconds left of a head-over-heels flip (no control while > 0). */
  flipT: number;
  /** Unit direction (pitch x, z) the flip tumbles toward (the push). */
  pushX: number;
  pushZ: number;
  /** Seconds until the next hop is allowed. */
  hopCd: number;
  /** AI: seconds until it looks at the game again, and its current wish. */
  think: number;
  tx: number;
  tz: number;
  wantHop: boolean;
  /** Seconds left of a goal celebration (cheer animation). */
  cheer: number;
  /** Squash spring for the bubble (visual): value and velocity. */
  squash: number;
  squashV: number;
}

export interface Ring {
  x: number;
  z: number;
  /** Centre of its slow side-to-side drift (a moving target to follow with the weak eye). */
  z0: number;
  age: number;
  /** Pops (0..1 animation) once the ball went through. */
  popT: number;
  alive: boolean;
}

export interface MatchState {
  agents: Agent[];
  ball: Body;
  score: Record<Team, number>;
  /** Seconds of play left. */
  clock: number;
  phase: 'countdown' | 'play' | 'goal' | 'over';
  phaseT: number;
  /** Team that kicks off next. */
  kickoff: Team;
  ring: Ring | null;
  /** Seconds until the next ring appears. */
  ringGap: number;
  /** Seconds the ball stays charged (next goal counts double). */
  charged: number;
  /** Who charged it (only their goal doubles). */
  chargedBy: Team | null;
  /** Last team to touch the ball. */
  lastTouch: Team | null;
  /** Double goals scored, per team. */
  doubles: Record<Team, number>;
  /** Seconds the ball has been resting against a wall. */
  stuck: number;
}

export type MatchEvent =
  | { kind: 'goal'; team: Team; points: number; double: boolean }
  | { kind: 'bump'; a: number; b: number; speed: number }
  | { kind: 'flip'; agent: number }
  | { kind: 'kick'; agent: number; speed: number }
  | { kind: 'wall'; speed: number }
  | { kind: 'ring' }
  | { kind: 'charge'; team: Team }
  | { kind: 'ringPop' }
  | { kind: 'kickoff' }
  | { kind: 'over' };

export interface HumanInput {
  /** Wanted direction in pitch space (length ≤ 1). */
  x: number;
  z: number;
  sprint: boolean;
  hop: boolean;
}

/** Wall segments of the pitch: sidelines, end lines with goal mouths, goal boxes, corner cut-offs. */
export function pitchWalls(): Segment[] {
  const { hx, hz, goalHalf: g, goalDepth: d, corner: c } = PITCH;
  const w: Segment[] = [];
  const seg = (ax: number, az: number, bx: number, bz: number): void => void w.push({ ax, az, bx, bz });
  seg(-hx + c, -hz, hx - c, -hz);
  seg(-hx + c, hz, hx - c, hz);
  for (const s of [-1, 1]) {
    // End line either side of the goal mouth, and the corner cut-offs.
    seg(s * hx, -hz + c, s * hx, -g);
    seg(s * hx, g, s * hx, hz - c);
    seg(s * hx, -hz + c, s * (hx - c), -hz);
    seg(s * hx, hz - c, s * (hx - c), hz);
    // Goal box.
    seg(s * hx, -g, s * (hx + d), -g);
    seg(s * hx, g, s * (hx + d), g);
    seg(s * (hx + d), -g, s * (hx + d), g);
  }
  return w;
}

/** Kick-off spots: [x, z] per agent index (0 = the player, 1-2 home friends, 3-5 away). */
export function kickoffSpots(kickoff: Team): [number, number][] {
  const near = kickoff === 'home' ? -1.4 : -2.6;
  const farAway = kickoff === 'away' ? 1.4 : 2.6;
  return [
    [near, 0],
    [-4.6, -3],
    [-7.8, 1.2],
    [farAway, 0],
    [4.6, 3],
    [7.8, -1.2],
  ];
}

export function createMatch(seconds: number = MATCH.seconds): MatchState {
  const roles: Role[] = ['striker', 'support', 'keeper'];
  const agents: Agent[] = [];
  for (let i = 0; i < 6; i++) {
    const team: Team = i < 3 ? 'home' : 'away';
    agents.push({
      body: makeBody({ x: 0, z: 0, r: BUBBLE.r, m: BUBBLE.m, bounce: BUBBLE.bounce, h: BUBBLE.h, drag: BUBBLE.drag }),
      team,
      role: roles[i % 3],
      human: i === 0,
      // Friends: teammates a little better than rivals, rivals clearly slower than the player.
      skill: i === 0 ? 1 : team === 'home' ? 0.78 : [0.8, 0.72, 0.68][i - 3],
      flipT: 0,
      pushX: 1,
      pushZ: 0,
      hopCd: 0,
      think: 0,
      tx: 0,
      tz: 0,
      wantHop: false,
      cheer: 0,
      squash: 0,
      squashV: 0,
    });
  }
  const m: MatchState = {
    agents,
    ball: makeBody({ x: 0, z: 0, r: BALL.r, m: BALL.m, bounce: BALL.bounce, drag: BALL.drag, h: 2 * BALL.r }),
    score: { home: 0, away: 0 },
    clock: seconds,
    phase: 'countdown',
    phaseT: 0,
    kickoff: 'home',
    ring: null,
    ringGap: 4,
    charged: 0,
    chargedBy: null,
    lastTouch: null,
    doubles: { home: 0, away: 0 },
    stuck: 0,
  };
  resetPositions(m);
  return m;
}

export function resetPositions(m: MatchState): void {
  const spots = kickoffSpots(m.kickoff);
  m.agents.forEach((a, i) => {
    const b = a.body;
    b.x = spots[i][0];
    b.z = spots[i][1];
    b.vx = b.vz = b.vy = b.y = 0;
    a.flipT = 0;
    a.think = 0.2 + i * 0.07;
  });
  const ball = m.ball;
  ball.x = ball.z = ball.vx = ball.vz = ball.y = ball.vy = 0;
  m.lastTouch = null;
}

/** Stars for the result: win 3, draw 2, otherwise 1 (everybody gets something). */
export function matchStars(home: number, away: number): number {
  return home > away ? 3 : home === away ? 2 : 1;
}

/** Gem prize: 2 / 4 / 6 by stars, plus one per double goal by the player's team. */
export function matchPrize(stars: number, homeDoubles: number): number {
  return 2 * stars + Math.min(3, homeDoubles);
}

/**
 * Rubber band for the rivals: they ease off while leading and never get faster than 0.8 of the
 * player, so the child stays in the game.
 */
export function rivalSkillScale(home: number, away: number): number {
  const lead = away - home;
  if (lead > 0) return Math.max(0.6, 1 - 0.16 * lead);
  if (lead < -2) return Math.min(1.12, 1 + 0.04 * (-lead - 2));
  return 1;
}

/** Point behind the ball on the line from `goalX` through the ball, `back` metres behind it. */
export function behindBall(bx: number, bz: number, goalX: number, back: number, goalZ = 0): { x: number; z: number } {
  const dx = goalX - bx;
  const dz = goalZ - bz;
  const l = Math.hypot(dx, dz) || 1;
  return { x: bx - (dx / l) * back, z: bz - (dz / l) * back };
}

/**
 * Where to push the ball for `team`: the far goal, or, when the ball is jammed beside the goal
 * against the end line, back out toward the penalty spot so it can come round.
 */
export function aimPoint(team: Team, bx: number, bz: number): { x: number; z: number } {
  const dir = team === 'home' ? 1 : -1;
  if (bx * dir > PITCH.hx - 2.2 && Math.abs(bz) > PITCH.goalHalf - 0.3) return { x: dir * (PITCH.hx - 3.5), z: 0 };
  return { x: dir * (PITCH.hx + 1), z: 0 };
}

/** Where an AI friend wants to go (pitch space). `noise` is -1..1 pairs for clumsiness. */
export function aiTarget(a: Agent, m: MatchState, nx: number, nz: number): { x: number; z: number; hop: boolean } {
  const dir = a.team === 'home' ? 1 : -1;
  const ball = m.ball;
  const aim = aimPoint(a.team, ball.x, ball.z);
  const me = a.body;
  const toBall = Math.hypot(ball.x - me.x, ball.z - me.z);
  let chase = a.role === 'striker';
  if (a.role === 'support' && toBall < 3.2) chase = true;
  if (a.role === 'keeper' && toBall < 3.6 && Math.sign(ball.x) !== dir) chase = true;
  if (chase) {
    const back = behindBall(ball.x, ball.z, aim.x, ball.r + me.r * 0.7, aim.z);
    // Behind the ball (on the far side from the aim point)? Then push straight through it.
    const ahead = (ball.x - me.x) * (aim.x - ball.x) + (ball.z - me.z) * (aim.z - ball.z) > 0;
    const dBack = Math.hypot(back.x - me.x, back.z - me.z);
    if (ahead && dBack < 1.6) {
      return { x: aim.x + nx * 1.5, z: aim.z + nz * 1.5, hop: toBall < 2.2 && nx > 0.85 };
    }
    // Go round the ball rather than through it: sidestep while on the wrong side.
    const side = me.z >= ball.z ? 1 : -1;
    const around = ahead ? 0 : 1.9 * side;
    return { x: back.x + nx * 0.8, z: back.z + around + nz * 0.8, hop: false };
  }
  if (a.role === 'support') {
    const x = Math.max(-PITCH.hx + 2, Math.min(PITCH.hx - 2, ball.x - dir * 4.2));
    const z = Math.max(-PITCH.hz + 1.5, Math.min(PITCH.hz - 1.5, ball.z * 0.5 + (a.team === 'home' ? -1.6 : 1.6)));
    return { x: x + nx, z: z + nz, hop: false };
  }
  // Keeper: stay on the goal line between ball and goal.
  const x = -dir * (PITCH.hx - 1.6);
  const z = Math.max(-PITCH.goalHalf, Math.min(PITCH.goalHalf, ball.z * 0.6));
  return { x: x + nx * 0.4, z: z + nz * 0.6, hop: false };
}

function hop(a: Agent): void {
  const b = a.body;
  if (a.hopCd > 0 || b.y > 0.05 || a.flipT > 0) return;
  b.vy = MOVE.hopVy;
  const s = Math.hypot(b.vx, b.vz);
  if (s > 0.5) {
    b.vx += (b.vx / s) * MOVE.hopBoost;
    b.vz += (b.vz / s) * MOVE.hopBoost;
  }
  a.hopCd = MOVE.hopCooldown;
}

export interface StepOptions {
  rand: () => number;
  /** The player's control this frame (pitch space). */
  input: HumanInput;
  walls: readonly Segment[];
}

const contacts: Contact[] = [];

/** Advance the match by dt. Pushes gameplay events into `out` (cleared first). */
export function stepMatch(m: MatchState, dt: number, o: StepOptions, out: MatchEvent[]): void {
  out.length = 0;
  m.phaseT += dt;
  for (const a of m.agents) {
    a.cheer = Math.max(0, a.cheer - dt);
    // Bubble squash spring.
    a.squashV += (-90 * a.squash - 9 * a.squashV) * dt;
    a.squash += a.squashV * dt;
  }
  if (m.phase === 'countdown') {
    if (m.phaseT >= MATCH.countdown) {
      m.phase = 'play';
      m.phaseT = 0;
      out.push({ kind: 'kickoff' });
    }
    return;
  }
  if (m.phase === 'over') return;
  if (m.phase === 'goal') {
    // Everybody keeps bouncing about (celebrations), then a quick re-set.
    simulate(m, dt, o, out, false);
    if (m.phaseT >= MATCH.goalPause) {
      if (m.clock <= 0) {
        m.phase = 'over';
        out.push({ kind: 'over' });
        return;
      }
      resetPositions(m);
      m.phase = 'countdown';
      m.phaseT = MATCH.countdown - 1.2; // a short "go!" after a goal, not a full 3-2-1
    }
    return;
  }
  m.clock = Math.max(0, m.clock - dt);
  simulate(m, dt, o, out, true);
  if (m.phase === 'play' && m.clock <= 0) {
    m.phase = 'goal'; // reuse the pause, then 'over'
    m.phaseT = MATCH.goalPause - MATCH.endPause;
  }
}

function simulate(m: MatchState, dt: number, o: StepOptions, out: MatchEvent[], live: boolean): void {
  const rivalScale = rivalSkillScale(m.score.home, m.score.away);
  for (const a of m.agents) {
    const b = a.body;
    a.hopCd = Math.max(0, a.hopCd - dt);
    if (a.flipT > 0) {
      a.flipT = Math.max(0, a.flipT - dt);
      continue; // tumbling: no control
    }
    if (!live) {
      // Celebration / wind-down: friends bounce on the spot, the player can still roll about.
      if (!a.human) {
        steerToward(b, 0, 0, 6, dt);
        if (a.cheer > 0 && b.y <= 0 && o.rand() < dt * 2.5) hop(a);
        continue;
      }
    }
    if (a.human) {
      const s = o.input.sprint ? MOVE.sprint : MOVE.speed;
      steerToward(b, o.input.x * s, o.input.z * s, MOVE.accel, dt);
      if (o.input.hop) hop(a);
      continue;
    }
    a.think -= dt;
    if (a.think <= 0) {
      a.think = AI.think[0] + o.rand() * (AI.think[1] - AI.think[0]);
      const t = aiTarget(a, m, o.rand() * 2 - 1, o.rand() * 2 - 1);
      a.tx = t.x;
      a.tz = t.z;
      a.wantHop = t.hop || o.rand() < 0.04;
    }
    const skill = a.team === 'away' ? a.skill * rivalScale : a.skill;
    const dx = a.tx - b.x;
    const dz = a.tz - b.z;
    const d = Math.hypot(dx, dz);
    const speed = AI.speed * skill * Math.min(1, d / 1.2);
    steerToward(b, d > 0.01 ? (dx / d) * speed : 0, d > 0.01 ? (dz / d) * speed : 0, AI.accel * skill, dt);
    if (a.wantHop && live) {
      hop(a);
      a.wantHop = false;
    }
  }

  const bodies: Body[] = m.agents.map((a) => a.body);
  bodies.push(m.ball);
  const prevBallX = m.ball.x;
  for (const b of bodies) integrate(b, dt);
  collideBodies(bodies, contacts);
  const ballIdx = bodies.length - 1;
  for (const c of contacts) {
    if (c.b === ballIdx || c.a === ballIdx) {
      const ai = c.a === ballIdx ? c.b : c.a;
      const agent = m.agents[ai];
      const ab = agent.body;
      // A kick: extra push along the contact normal, a loft when hopping or hitting hard.
      const sign = c.a === ballIdx ? -1 : 1;
      const push = Math.max(0, ab.vx * c.nx * sign + ab.vz * c.nz * sign) * 0.35;
      m.ball.vx += c.nx * sign * push;
      m.ball.vz += c.nz * sign * push;
      const loft = ab.y > 0.15 ? 4.2 : c.speed > 6 ? 2.4 : 0;
      if (loft > 0 && m.ball.y <= 0.05) m.ball.vy = Math.max(m.ball.vy, loft);
      m.lastTouch = agent.team;
      if (c.speed > 1.2) out.push({ kind: 'kick', agent: ai, speed: c.speed });
      continue;
    }
    const a = m.agents[c.a];
    const b = m.agents[c.b];
    a.squashV -= c.impulse * 1.4;
    b.squashV -= c.impulse * 1.4;
    if (c.speed > 1.5) out.push({ kind: 'bump', a: c.a, b: c.b, speed: c.speed });
    if (c.impulse >= FLIP.impulse) {
      // The one that was moving into the other less (the "victim") flips; both on a huge hit.
      const va = a.body.vx * c.nx + a.body.vz * c.nz; // after the bounce: victim moves away fastest
      const vb = -(b.body.vx * c.nx + b.body.vz * c.nz);
      const flipBoth = c.impulse >= FLIP.impulse * 1.7;
      const victims = flipBoth ? [c.a, c.b] : [vb > -va ? c.b : c.a];
      for (const v of victims) {
        const ag = m.agents[v];
        if (ag.flipT > 0) continue;
        ag.flipT = FLIP.seconds;
        const s = v === c.a ? -1 : 1;
        ag.pushX = c.nx * s;
        ag.pushZ = c.nz * s;
        ag.body.vy = Math.max(ag.body.vy, 3.2);
        out.push({ kind: 'flip', agent: v });
      }
    }
  }
  for (const a of m.agents) {
    const hit = collideWalls(a.body, o.walls);
    if (hit > 3) {
      a.squashV -= hit * 0.9;
      out.push({ kind: 'wall', speed: hit });
    }
  }
  const ball = m.ball;
  const wallHit = collideWalls(ball, o.walls);
  if (wallHit > 2.5) out.push({ kind: 'wall', speed: wallHit });
  // A ball resting against a puffy wall gets puffed back toward the middle.
  const nearWall = Math.abs(ball.z) > PITCH.hz - ball.r - 0.5 || (Math.abs(ball.x) > PITCH.hx - ball.r - 0.5 && Math.abs(ball.z) > PITCH.goalHalf - 0.2);
  if (live && nearWall && Math.hypot(ball.vx, ball.vz) < UNSTICK.speed) {
    m.stuck += dt;
    if (m.stuck > UNSTICK.seconds) {
      const l = Math.hypot(ball.x, ball.z) || 1;
      ball.vx -= (ball.x / l) * UNSTICK.push;
      ball.vz -= (ball.z / l) * UNSTICK.push;
      ball.vy = Math.max(ball.vy, 2.5);
      m.stuck = 0;
      out.push({ kind: 'wall', speed: UNSTICK.push });
    }
  } else m.stuck = 0;
  // Keep the ball's speed sane (cartoon physics, not a cannon).
  const bs = Math.hypot(ball.vx, ball.vz);
  if (bs > 15) {
    ball.vx *= 15 / bs;
    ball.vz *= 15 / bs;
  }

  // Bonus rings (weak-eye only): appear, live, and charge the ball when it rolls through.
  if (live) updateRing(m, dt, prevBallX, o.rand, out);
  if (m.charged > 0) {
    m.charged = Math.max(0, m.charged - dt);
    if (m.charged === 0) m.chargedBy = null;
  }

  if (!live) return;
  // Goal?
  if (Math.abs(ball.x) > PITCH.hx + 0.25 && Math.abs(ball.z) < PITCH.goalHalf && ball.y < PITCH.goalHeight) {
    const team: Team = ball.x > 0 ? 'home' : 'away';
    const double = m.charged > 0 && m.chargedBy === team;
    const points = double ? 2 : 1;
    m.score[team] += points;
    if (double) m.doubles[team]++;
    m.charged = 0;
    m.chargedBy = null;
    m.phase = 'goal';
    m.phaseT = 0;
    m.kickoff = team === 'home' ? 'away' : 'home';
    for (const a of m.agents) if (a.team === team) a.cheer = MATCH.goalPause;
    out.push({ kind: 'goal', team, points, double });
  }
}

function updateRing(m: MatchState, dt: number, prevBallX: number, rand: () => number, out: MatchEvent[]): void {
  const r = m.ring;
  if (r && !r.alive) {
    r.popT += dt / 0.6;
    if (r.popT >= 1) m.ring = null;
    return;
  }
  if (!r) {
    m.ringGap -= dt;
    if (m.ringGap > 0 || m.clock < 4) return;
    // In the half the ball is in, in front of it, so a push toward goal can find it.
    const side = m.ball.x >= 0 ? 1 : -1;
    const x = side * (1.5 + rand() * (PITCH.hx - 4.5));
    const z = (rand() * 2 - 1) * (PITCH.hz - 1.8);
    m.ring = { x, z, z0: z, age: 0, popT: 0, alive: true };
    out.push({ kind: 'ring' });
    return;
  }
  r.age += dt;
  r.z = ringZ(r.z0, r.age);
  const ball = m.ball;
  const crossed = (prevBallX - r.x) * (ball.x - r.x) <= 0 && prevBallX !== ball.x;
  if (crossed && Math.abs(ball.z - r.z) < RING.pass) {
    r.alive = false;
    r.popT = 0;
    const team: Team = ball.vx >= 0 ? 'home' : 'away';
    m.charged = RING.chargeSeconds;
    m.chargedBy = m.lastTouch ?? team;
    m.ringGap = RING.gap[0] + rand() * (RING.gap[1] - RING.gap[0]);
    out.push({ kind: 'charge', team: m.chargedBy });
    return;
  }
  if (r.age >= RING.life) {
    r.alive = false;
    r.popT = 0;
    m.ringGap = RING.gap[0] + rand() * (RING.gap[1] - RING.gap[0]);
    out.push({ kind: 'ringPop' });
  }
}
