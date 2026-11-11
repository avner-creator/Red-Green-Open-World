/**
 * Foam Lava child-proofing (QA6 B1, M1): nobody is ever frozen beside the course, and a child who
 * keeps falling is helped on and always reaches a kind ending.
 */
import { describe, expect, it } from 'vitest';
import { CHECKPOINTS, PIT, RUN_BOUNDS, SOLIDS, START } from '../../src/activities/foamlava/layout';
import { CourseSim, RUN } from '../../src/activities/foamlava/sim';
import type { SimEvent, SimInput } from '../../src/activities/foamlava/sim';
import { ROUND_CAP, medalFor, prizeFor } from '../../src/activities/foamlava/scoring';

const DT = 1 / 60;

function startRun(): CourseSim {
  const sim = new CourseSim();
  sim.reset(START.hero, START.yaw);
  sim.running = true;
  return sim;
}

function run(sim: CourseSim, secs: number, input: (i: number) => SimInput): SimEvent[] {
  const evs: SimEvent[] = [];
  for (let i = 0; i < secs * 60; i++) evs.push(...sim.step(DT, input(i)));
  return evs;
}

describe('foam lava: the hero is never frozen (QA6 B1)', () => {
  it('holding "back" (W read against the front camera) never walks the hero off the back of the start deck', () => {
    const sim = startRun();
    let minY = Infinity;
    run(sim, 6, (i) => ({ mx: 0, mz: -1, sprint: true, jumpPressed: i % 60 === 0 }));
    for (let i = 0; i < 60; i++) {
      sim.step(DT, { mx: 0, mz: -1, sprint: false, jumpPressed: false });
      minY = Math.min(minY, sim.p.y);
    }
    expect(sim.p.z).toBeGreaterThanOrEqual(RUN_BOUNDS.z0);
    // Still on the deck, not on the grass behind it.
    expect(minY).toBeGreaterThan(SOLIDS[0].top - 0.05);
  });

  it('then turning round (W onward) gets going at once', () => {
    const sim = startRun();
    run(sim, 3, () => ({ mx: 0, mz: -1, sprint: false, jumpPressed: false }));
    const z0 = sim.p.z;
    run(sim, 1.5, () => ({ mx: 0, mz: 1, sprint: false, jumpPressed: false }));
    expect(sim.p.z - z0).toBeGreaterThan(3);
  });

  it('standing on the ground off the course: a bubble hops you back to your checkpoint (not a fall)', () => {
    const sim = startRun();
    // The QA spot: on the grass beside the start deck.
    sim.p.x = PIT.x1 - 0.05;
    sim.p.z = -2.6;
    sim.p.y = 0;
    sim.ground = -1;
    const evs = run(sim, 2, () => ({ mx: 0, mz: -1, sprint: false, jumpPressed: false }));
    const hop = evs.find((e) => e.type === 'respawn');
    expect(hop).toBeDefined();
    expect(hop && hop.type === 'respawn' && hop.hop).toBe(true);
    expect(sim.falls).toBe(0);
    expect(sim.p.y).toBeCloseTo(CHECKPOINTS[0].y, 1);
  });

  it('pushing the stick for seconds without getting anywhere hops you back on', () => {
    const sim = startRun();
    // Into the booth from the middle deck, forever.
    sim.p.x = 0;
    sim.p.z = -1.2;
    sim.p.y = 1;
    const evs = run(sim, RUN.stuckHop + 1, () => ({ mx: 0, mz: -1, sprint: false, jumpPressed: false }));
    expect(evs.some((e) => e.type === 'respawn' && e.hop)).toBe(true);
  });

  it('standing still (no stick) is not "stuck": no hop', () => {
    const sim = startRun();
    const evs = run(sim, 10, () => ({ mx: 0, mz: 0, sprint: false, jumpPressed: false }));
    expect(evs.some((e) => e.type === 'respawn')).toBe(false);
  });
});

describe('foam lava: a child who keeps falling (QA6 M1)', () => {
  /** Run off the first float into the foam, again and again. */
  const intoFoam = (i: number): SimInput => ({ mx: -1, mz: 0.6, sprint: false, jumpPressed: i % 50 === 0 });

  it(`the helping hand carries you on to the next checkpoint after ${RUN.helpFalls} falls in one part`, () => {
    const sim = startRun();
    const evs = run(sim, 20, intoFoam);
    const help = evs.findIndex((e) => e.type === 'respawn' && e.help);
    expect(help).toBeGreaterThan(-1);
    const fallsBefore = evs.slice(0, help).filter((e) => e.type === 'splash').length;
    expect(fallsBefore).toBe(RUN.helpFalls);
    expect(sim.cp).toBeGreaterThanOrEqual(1);
    expect(sim.helps).toBeGreaterThanOrEqual(1);
  });

  it('after the last checkpoint the helping hand sets you on the finish deck and the lap counts', () => {
    const sim = startRun();
    sim.cp = 3;
    sim.respawn();
    sim.sectionFalls = RUN.helpFalls - 1;
    const evs: SimEvent[] = [];
    // Off the cannon walkway into the foam.
    for (let i = 0; i < 300 && !evs.some((e) => e.type === 'lap'); i++) evs.push(...sim.step(DT, { mx: 1, mz: 0, sprint: false, jumpPressed: false }));
    expect(evs.some((e) => e.type === 'respawn' && e.help)).toBe(true);
    expect(evs.some((e) => e.type === 'lap')).toBe(true);
  });

  it('endRound stops the hero out of the foam (the round cap)', () => {
    const sim = startRun();
    run(sim, 2, intoFoam);
    sim.endRound();
    expect(sim.mode).toBe('done');
    expect(sim.p.y).toBeGreaterThan(0.9);
    const p = { ...sim.p };
    run(sim, 1, () => ({ mx: 1, mz: 1, sprint: true, jumpPressed: true }));
    expect(sim.p).toEqual(p);
  });

  it('the round cap pays a gem for trying (ribbon), never zero', () => {
    expect(ROUND_CAP).toBeGreaterThanOrEqual(75);
    expect(ROUND_CAP).toBeLessThanOrEqual(90);
    expect(medalFor(ROUND_CAP)).toBe('ribbon');
    expect(prizeFor('ribbon', false)).toBeGreaterThan(0);
  });
});
