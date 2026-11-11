import { describe, expect, it } from 'vitest';
import {
  CONTEST,
  createRival,
  overtook,
  prizeFor,
  raftPoints,
  resultStars,
  rubberBandSpeed,
  standings,
  stepRival,
  throughHoop,
  ticketPrice,
} from '../../src/activities/skyrides/contestLogic';
import { createCourse, offsetAt, wrap } from '../../src/activities/skyrides/course';
import {
  DRAGON_TUNING,
  PLANE_TUNING,
  TRICKS,
  angleDelta,
  bezier,
  chooseTrick,
  createFlyState,
  predictImpact,
  stepBalloon,
  stepFly,
  stepTrick,
} from '../../src/activities/skyrides/flightModel';
import type { FlyControls, SurfaceFn } from '../../src/activities/skyrides/flightModel';
import { tourStars } from '../../src/activities/skyrides/dragon';

const flat = (h: number): SurfaceFn => () => h;
const none: FlyControls = { turn: 0, climb: 0, boost: false };

describe('arcade flight', () => {
  it('flies forward at cruise speed and levels out by itself', () => {
    const s = createFlyState(0, 40, 0, 0, PLANE_TUNING.cruise);
    s.pitch = 0.4;
    s.roll = 0.6;
    for (let i = 0; i < 180; i++) stepFly(s, none, PLANE_TUNING, 1 / 60, flat(0));
    expect(Math.abs(s.pitch)).toBeLessThan(0.02);
    expect(Math.abs(s.roll)).toBeLessThan(0.02);
    expect(s.z).toBeGreaterThan(40);
    expect(Math.abs(s.speed - PLANE_TUNING.cruise)).toBeLessThan(1);
  });

  it('turns right with the stick (yaw goes down, banks right) and boosts with sprint', () => {
    const s = createFlyState(0, 40, 0, 0, PLANE_TUNING.cruise);
    for (let i = 0; i < 60; i++) stepFly(s, { turn: 1, climb: 0, boost: true }, PLANE_TUNING, 1 / 60, flat(0));
    expect(s.yaw).toBeLessThan(-0.4);
    expect(s.roll).toBeGreaterThan(0.3);
    expect(s.speed).toBeGreaterThan(PLANE_TUNING.cruise + 2);
  });

  it('steers towards where you look', () => {
    const s = createFlyState(0, 40, 0, 0, PLANE_TUNING.cruise);
    for (let i = 0; i < 240; i++) stepFly(s, { ...none, lookYaw: Math.PI / 2, lookWeight: 0.9 }, PLANE_TUNING, 1 / 60, flat(0));
    expect(Math.abs(angleDelta(s.yaw, Math.PI / 2))).toBeLessThan(0.25);
  });

  it('can never crash: a dive pulls up by itself, and a cliff or roof boings you back up', () => {
    // Ground at 2 m, then a sudden 25 m wall (a cliff or a house) ahead.
    const cliff: SurfaceFn = (_x, _y, z) => (z > 120 ? 27 : 2);
    for (const t of [PLANE_TUNING, DRAGON_TUNING]) {
      const s = createFlyState(0, 14, 0, 0, t.cruise);
      let bounces = 0;
      let minAgl = Infinity;
      for (let i = 0; i < 60 * 10; i++) {
        const ev = stepFly(s, { turn: 0, climb: -1, boost: true }, t, 1 / 60, cliff);
        if (ev.bounced) bounces++;
        minAgl = Math.min(minAgl, s.y - cliff(s.x, s.y, s.z));
      }
      expect(bounces).toBeGreaterThan(0);
      expect(minAgl).toBeGreaterThanOrEqual(t.floor * 0.5 - 1e-6);
    }
  });

  it('turns round at the island edge', () => {
    const s = createFlyState(PLANE_TUNING.edge + 5, 40, 0, Math.PI / 2, PLANE_TUNING.cruise);
    let maxR = 0;
    for (let i = 0; i < 60 * 12; i++) {
      stepFly(s, none, PLANE_TUNING, 1 / 60, flat(0));
      maxR = Math.max(maxR, Math.hypot(s.x, s.z));
    }
    expect(Math.hypot(s.x, s.z)).toBeLessThan(PLANE_TUNING.edge);
    expect(maxR).toBeLessThan(PLANE_TUNING.edge + 60);
  });

  it('stays under the ceiling', () => {
    const s = createFlyState(0, 60, 0, 0, PLANE_TUNING.cruise);
    let maxY = 0;
    for (let i = 0; i < 60 * 20; i++) {
      stepFly(s, { turn: 0.3, climb: 1, boost: false }, PLANE_TUNING, 1 / 60, flat(0));
      maxY = Math.max(maxY, s.y);
    }
    expect(maxY).toBeLessThan(PLANE_TUNING.ceiling + 15);
  });

  it('the dragon sinks gently when gliding and a flap lifts it', () => {
    const s = createFlyState(0, 60, 0, 0, DRAGON_TUNING.cruise);
    for (let i = 0; i < 120; i++) stepFly(s, none, DRAGON_TUNING, 1 / 60, flat(0));
    const glideY = s.y;
    expect(glideY).toBeLessThan(60);
    expect(glideY).toBeGreaterThan(56);
    s.lift += 7;
    const before = s.y;
    for (let i = 0; i < 30; i++) stepFly(s, none, DRAGON_TUNING, 1 / 60, flat(0));
    expect(s.y).toBeGreaterThan(before + 1);
  });
});

describe('tricks', () => {
  it('a loop flies the nose all the way round; a roll spins once', () => {
    const loop = chooseTrick(0, 80);
    expect(loop.kind).toBe('loop');
    let r = stepTrick(loop, 0);
    let t = 0;
    while (!r.done) {
      r = stepTrick(loop, 1 / 60);
      t += 1 / 60;
    }
    expect(r.pitch).toBeCloseTo(Math.PI * 2, 5);
    expect(t).toBeCloseTo(TRICKS.loopSeconds, 1);
    const roll = chooseTrick(-0.8, 80);
    expect(roll.kind).toBe('roll');
    expect(roll.dir).toBe(-1);
    while (!stepTrick(roll, 1 / 60).done) {
      /* spin */
    }
    expect(Math.abs(stepTrick(roll, 0).roll)).toBeCloseTo(Math.PI * 2, 5);
  });

  it('too low for a loop: does a barrel roll instead', () => {
    expect(chooseTrick(0, TRICKS.loopClearance - 1).kind).toBe('roll');
  });
});

describe('water balloons', () => {
  it('the aim prediction matches the simulated drop', () => {
    const pos = { x: 0, y: 30, z: 0 };
    const vel = { x: 0, y: -2, z: 20 };
    const hit = predictImpact(pos, vel, 2);
    expect(hit).not.toBeNull();
    const p = { ...pos };
    const v = { ...vel };
    while (p.y > 2) stepBalloon(p, v, 1 / 240);
    expect(Math.hypot(p.x - hit!.x, p.z - hit!.z)).toBeLessThan(0.5);
  });

  it('raft bullseye rings score 3 / 2 / 1 and 0 outside', () => {
    expect(raftPoints(0.5, 0, 0, 0)).toBe(3);
    expect(raftPoints(3.5, 0, 0, 0)).toBe(2);
    expect(raftPoints(0, 6, 0, 0)).toBe(1);
    expect(raftPoints(9, 0, 0, 0)).toBe(0);
  });
});

describe('courses', () => {
  const ring = Array.from({ length: 8 }, (_, i) => ({ x: Math.cos((i / 8) * Math.PI * 2) * 100, y: 30, z: Math.sin((i / 8) * Math.PI * 2) * 100 }));
  const c = createCourse(ring, 20);

  it('is a closed loop about as long as the circle', () => {
    expect(c.length).toBeGreaterThan(2 * Math.PI * 100 * 0.95);
    expect(c.length).toBeLessThan(2 * Math.PI * 100 * 1.05);
    const a = c.at(0);
    const b = c.at(c.length);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(1e-6);
    expect(wrap(-5, 100)).toBeCloseTo(95);
  });

  it('nearest() tracks progress continuously (unwrapped across the seam)', () => {
    let s = c.length - 10;
    for (let k = 0; k < 20; k++) {
      const p = c.at(s + 2);
      s = c.nearest(p, s, 20);
    }
    expect(s).toBeGreaterThan(c.length + 20);
  });

  it('offsetAt puts things to the right of travel', () => {
    // At s=0 the loop heads towards +Z (counter-clockwise seen from above: +X → +Z).
    const t = c.tangent(0);
    const right = offsetAt(c, 0, 5, 0);
    const centre = c.at(0);
    const rx = right.x - centre.x;
    const rz = right.z - centre.z;
    // right = forward × up = (-tz, 0, tx)
    expect(rx * -t.z + rz * t.x).toBeGreaterThan(4.9);
  });
});

describe('contest rules', () => {
  it('scores a hoop only when you fly through its disc', () => {
    const centre = { x: 0, y: 30, z: 0 };
    const n = { x: 0, y: 0, z: 1 };
    expect(throughHoop({ x: 1, y: 31, z: -2 }, { x: 1, y: 31, z: 2 }, centre, n, CONTEST.hoopRadius)).toBe(true);
    expect(throughHoop({ x: 8, y: 30, z: -2 }, { x: 8, y: 30, z: 2 }, centre, n, CONTEST.hoopRadius)).toBe(false);
    expect(throughHoop({ x: 0, y: 30, z: 1 }, { x: 0, y: 30, z: 3 }, centre, n, CONTEST.hoopRadius)).toBe(false);
  });

  it('rubber-banding keeps friends close but never more than ±25 %', () => {
    expect(rubberBandSpeed(20, 0, 0)).toBe(20);
    expect(rubberBandSpeed(20, 0, 1000)).toBeCloseTo(25);
    expect(rubberBandSpeed(20, 1000, 0)).toBeCloseTo(15);
  });

  it('friends are clumsy: they get some hoops but not all, deterministically', () => {
    const hoopAt = (i: number): number => (i + 0.5) * 50;
    const run = (): number => {
      const r = createRival({ character: 'frog', skill: 0.6, lane: 4, seed: 7 }, 0);
      for (let i = 0; i < 60 * 90; i++) stepRival(r, 1 / 60, 21, r.s, hoopAt, true);
      return r.score;
    };
    const a = run();
    expect(a).toBe(run());
    const hoops = Math.floor((21 * 90) / 50);
    expect(a).toBeGreaterThan(hoops * 0.3);
    expect(a).toBeLessThan(hoops * 1.3);
  });

  it('overtakes are detected once when a friend passes you', () => {
    expect(overtook(9, 11, 10)).toBe(true);
    expect(overtook(11, 12, 10)).toBe(false);
    expect(overtook(5, 6, 10)).toBe(false);
  });

  it('standings rank by score; a tie goes to the player', () => {
    const st = standings([
      { id: 'friend0', score: 10 },
      { id: 'you', score: 10 },
      { id: 'friend1', score: 4 },
    ]);
    expect(st.map((s) => s.id)).toEqual(['you', 'friend0', 'friend1']);
    expect(st.map((s) => s.place)).toEqual([1, 2, 3]);
    expect(prizeFor(1)).toBeGreaterThan(prizeFor(2));
    expect(prizeFor(3)).toBeGreaterThan(0);
  });

  it('result stars and tour stars grow with the score', () => {
    expect(resultStars(0)).toBe(0);
    expect(resultStars(CONTEST.stars[0])).toBe(1);
    expect(resultStars(CONTEST.stars[2] + 10)).toBe(3);
    expect(tourStars(0)).toBe(0);
    expect(tourStars(3)).toBe(0);
    expect(tourStars(4)).toBe(1);
    expect(tourStars(10)).toBe(2);
    expect(tourStars(20)).toBe(3);
  });

  it('the first ride each session is free, then a ticket', () => {
    expect(ticketPrice(0)).toBe(0);
    expect(ticketPrice(1)).toBe(3);
    expect(ticketPrice(4, 5)).toBe(5);
  });

  it('bezier landing paths start and end where asked', () => {
    const p0 = { x: 0, y: 40, z: 0 };
    const p3 = { x: 50, y: 2, z: 80 };
    const a = bezier(p0, { x: 10, y: 40, z: 0 }, { x: 50, y: 10, z: 40 }, p3, 0);
    const b = bezier(p0, { x: 10, y: 40, z: 0 }, { x: 50, y: 10, z: 40 }, p3, 1);
    expect(a).toEqual(p0);
    expect(b).toEqual(p3);
  });
});
