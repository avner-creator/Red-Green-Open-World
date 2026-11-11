/**
 * Playtest 3 bug: "the ball, he would walk through it". The hero (and every friend) must never pass
 * through the Bubble Ball ball: from 8 directions, at walking, sprint and dash speeds, at 30, 60
 * and 144 Hz (and the 20 Hz frame-time cap), in open play and with the ball pinned on a wall or in
 * a corner. Also the free kickabout before / after a round (the walker vs the idle ball).
 */
import { describe, expect, it } from 'vitest';
import { rng } from '../../src/activities/bubbleball/bodies';
import { BALL, BUBBLE, PITCH, createMatch, pitchWalls, stepMatch } from '../../src/activities/bubbleball/soccer';
import type { MatchEvent, MatchState } from '../../src/activities/bubbleball/soccer';
import { KICKABOUT, createKickabout, stepKickabout } from '../../src/activities/bubbleball/kickabout';

const DIRS = Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4);
const RATES = [20, 30, 60, 144];
const walls = pitchWalls();

type Speed = 'walk' | 'sprint' | 'dash';
const SPEEDS: Speed[] = ['walk', 'sprint', 'dash'];

/** A live match with only the player and the ball on the pitch (friends parked far off). */
function soloMatch(): MatchState {
  const m = createMatch();
  m.phase = 'play';
  m.phaseT = 0;
  // Friends out of the way (they are ghosts for this test, so only the hero meets the ball).
  for (let i = 1; i < m.agents.length; i++) {
    const b = m.agents[i].body;
    b.x = -PITCH.hx + 1 + i * 0.01;
    b.z = 0;
    b.ghost = 1e9;
  }
  return m;
}

/** Drive the hero straight at the ball through `seconds`, checking every frame for overlap. */
function charge(m: MatchState, dirX: number, dirZ: number, speed: Speed, hz: number, seconds: number): { minGap: number; crossed: boolean } {
  const dt = 1 / hz;
  const me = m.agents[0].body;
  const ball = m.ball;
  const out: MatchEvent[] = [];
  const rand = rng(3);
  let minGap = Infinity;
  let crossed = false;
  // "Side" of the ball the hero started on, along the charge direction.
  for (let t = 0; t < seconds; t += dt) {
    stepMatch(m, dt, { rand, walls, input: { x: dirX, z: dirZ, sprint: speed !== 'walk', hop: speed === 'dash' } }, out);
    if (m.phase !== 'play') break;
    const vertical = Math.abs(me.y + me.h / 2 - (ball.y + ball.h / 2)) < (me.h + ball.h) / 2;
    const gap = Math.hypot(ball.x - me.x, ball.z - me.z) - (me.r + ball.r);
    if (vertical) minGap = Math.min(minGap, gap);
    // Passing through = the hero's centre gets past the ball's centre along the charge line
    // while the ball is still in front of a wall (pinned).
    const along = (ball.x - me.x) * dirX + (ball.z - me.z) * dirZ;
    const lateral = Math.abs((ball.x - me.x) * -dirZ + (ball.z - me.z) * dirX);
    if (along < 0 && lateral < (me.r + ball.r) * 0.5) crossed = true;
  }
  return { minGap, crossed };
}

describe('Bubble Ball: the hero never passes through the ball', () => {
  for (const speed of SPEEDS) {
    for (const hz of RATES) {
      it(`open pitch, 8 directions, ${speed} at ${hz} Hz`, () => {
        for (const a of DIRS) {
          const m = soloMatch();
          const dx = Math.cos(a);
          const dz = Math.sin(a);
          m.ball.x = 0;
          m.ball.z = 0;
          m.agents[0].body.x = -dx * 3.2;
          m.agents[0].body.z = -dz * 3.2;
          const r = charge(m, dx, dz, speed, hz, 0.9);
          // Never more than a squash of overlap (both are soft), never through.
          expect(r.minGap, `dir ${a.toFixed(2)}`).toBeGreaterThan(-0.12);
        }
      });

      it(`ball pinned on a wall or in a corner, 8 directions, ${speed} at ${hz} Hz`, () => {
        for (const a of DIRS) {
          const dx = Math.cos(a);
          const dz = Math.sin(a);
          // Put the ball against the wall the hero is charging toward (the sideline, end line
          // beside the goal, or a corner), then charge it for two seconds.
          const m = soloMatch();
          const wx = Math.abs(dx) < 0.1 ? 0 : Math.sign(dx) * (PITCH.hx - BALL.r - 0.02);
          const wz = Math.abs(dz) < 0.1 ? 0 : Math.sign(dz) * (PITCH.hz - BALL.r - 0.02);
          // Along the end line keep the ball beside the goal mouth (a real wall there).
          const bz = wx !== 0 && wz === 0 ? PITCH.goalHalf + 1.2 : wz;
          let bx = wx;
          let bzz = bz;
          if (wx !== 0 && wz !== 0) {
            // Corner: sit on the corner cut-off.
            bx = Math.sign(dx) * (PITCH.hx - PITCH.corner * 0.5 - BALL.r * 0.75);
            bzz = Math.sign(dz) * (PITCH.hz - PITCH.corner * 0.5 - BALL.r * 0.75);
          }
          m.ball.x = bx;
          m.ball.z = bzz;
          m.agents[0].body.x = bx - dx * 3;
          m.agents[0].body.z = bzz - dz * 3;
          const r = charge(m, dx, dz, speed, hz, 2);
          expect(r.crossed, `dir ${a.toFixed(2)}`).toBe(false);
          expect(r.minGap, `dir ${a.toFixed(2)}`).toBeGreaterThan(-0.12);
        }
      });
    }
  }

  it('nobody (friends included) ever overlaps the ball through a whole wild match', () => {
    for (const hz of [30, 60, 144]) {
      const m = createMatch();
      const out: MatchEvent[] = [];
      const rand = rng(11);
      let worst = 0;
      for (let t = 0; t < 70 && m.phase !== 'over'; t += 1 / hz) {
        const me = m.agents[0].body;
        const dx = m.ball.x - me.x;
        const dz = m.ball.z - me.z;
        const d = Math.hypot(dx, dz) || 1;
        stepMatch(m, 1 / hz, { rand, walls, input: { x: dx / d, z: dz / d, sprint: true, hop: rand() < 0.05 } }, out);
        for (const a of m.agents) {
          const b = a.body;
          const vertical = Math.abs(b.y + b.h / 2 - (m.ball.y + m.ball.h / 2)) < (b.h + m.ball.h) / 2;
          if (!vertical || b.ghost) continue;
          worst = Math.min(worst, Math.hypot(m.ball.x - b.x, m.ball.z - b.z) - (b.r + m.ball.r));
        }
      }
      expect(worst, `${hz} Hz`).toBeGreaterThan(-0.12);
    }
  });
});

describe('Bubble Ball kickabout (before / after a round): the walker and the idle ball', () => {
  for (const hz of RATES) {
    it(`walking or sprinting into the ball from 8 directions pushes it ahead (${hz} Hz), never through`, () => {
      for (const sp of [4.5, 7.5, 10]) {
        for (const a of DIRS) {
          const k = createKickabout();
          const dx = Math.cos(a);
          const dz = Math.sin(a);
          const w = { x: -dx * 3, z: -dz * 3, y: 0, vx: dx * sp, vz: dz * sp };
          let minGap = Infinity;
          let pushed = false;
          for (let t = 0; t < 1.2; t += 1 / hz) {
            // The walker keeps walking; the game's collider stops it at the ball if the ball can't
            // move, which the kickabout reports as `block`.
            w.x += w.vx / hz;
            w.z += w.vz / hz;
            const r = stepKickabout(k, w, 1 / hz, walls, []);
            if (r.block) {
              w.x += r.block.x;
              w.z += r.block.z;
            }
            minGap = Math.min(minGap, Math.hypot(k.ball.x - w.x, k.ball.z - w.z) - (KICKABOUT.walkerR + BALL.r));
            if (Math.hypot(k.ball.vx, k.ball.vz) > sp * 0.8) pushed = true;
          }
          expect(minGap, `dir ${a.toFixed(2)} @${sp}`).toBeGreaterThan(-0.05);
          expect(pushed, `dir ${a.toFixed(2)} @${sp}`).toBe(true);
          // The ball stays on the pitch.
          expect(Math.abs(k.ball.x)).toBeLessThan(PITCH.hx + PITCH.goalDepth);
          expect(Math.abs(k.ball.z)).toBeLessThan(PITCH.hz);
        }
      }
    });
  }

  it('a ball pinned on a wall blocks the walker (the walker is held back, never inside it)', () => {
    const k = createKickabout();
    k.ball.x = 0;
    k.ball.z = PITCH.hz - BALL.r;
    const w = { x: 0, z: 0, y: 0, vx: 0, vz: 7 };
    for (let t = 0; t < 2; t += 1 / 60) {
      w.x += w.vx / 60;
      w.z += w.vz / 60;
      const r = stepKickabout(k, w, 1 / 60, walls, []);
      if (r.block) {
        w.x += r.block.x;
        w.z += r.block.z;
      }
      expect(Math.hypot(k.ball.x - w.x, k.ball.z - w.z)).toBeGreaterThan(KICKABOUT.walkerR + BALL.r - 0.05);
    }
  });

  it('a walker high above the ball (jumping over) does not touch it; landing on top bounces them', () => {
    const k = createKickabout();
    const ev: string[] = [];
    const r1 = stepKickabout(k, { x: 0, z: 0, y: 3, vx: 0, vz: 0 }, 1 / 60, walls, ev);
    expect(r1.bounce).toBe(false);
    const r2 = stepKickabout(k, { x: 0.1, z: 0, y: 2 * BALL.r - 0.1, vx: 0, vz: 0, vy: -3 }, 1 / 60, walls, ev);
    expect(r2.bounce).toBe(true);
    // The bubble body is bigger than the ball; the kickabout uses the walker's capsule.
    expect(KICKABOUT.walkerR).toBeLessThan(BUBBLE.r);
  });
});
