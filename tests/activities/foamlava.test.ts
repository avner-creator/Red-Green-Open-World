import { describe, expect, it } from 'vitest';
import { Autopilot, MAIN_PLAN, SHORTCUT_PLAN } from '../../src/activities/foamlava/autopilot';
import { CANNON, CANNONS, CHECKPOINTS, FOAM_Y, SOLIDS, START } from '../../src/activities/foamlava/layout';
import { CourseSim, NO_INPUT, RUN, cannonState } from '../../src/activities/foamlava/sim';
import { MEDALS, ghostAt, ghostTime, ghostTimeline, medalFor, prizeFor, starsFor } from '../../src/activities/foamlava/scoring';
import type { SimEvent } from '../../src/activities/foamlava/sim';
import type { Waypoint } from '../../src/activities/foamlava/autopilot';

const DT = 1 / 60;

function newRun(): CourseSim {
  const sim = new CourseSim();
  sim.reset(START.hero, START.yaw);
  sim.running = true;
  return sim;
}

function play(plan: readonly Waypoint[], maxSeconds = 120): { sim: CourseSim; events: SimEvent[]; time: number } {
  const sim = newRun();
  const bot = new Autopilot(plan);
  const events: SimEvent[] = [];
  for (let i = 0; i < maxSeconds / DT && sim.mode !== 'done'; i++) {
    const ev = sim.step(DT, bot.input(sim));
    events.push(...ev);
    if (ev.some((e) => e.type === 'respawn')) bot.resync(sim);
  }
  return { sim, events, time: sim.time };
}

describe('foam lava course sim', () => {
  it('a hero standing still on the start deck stays put', () => {
    const sim = newRun();
    for (let i = 0; i < 120; i++) sim.step(DT, NO_INPUT);
    expect(sim.mode).toBe('run');
    expect(sim.grounded).toBe(true);
    expect(sim.p.y).toBeCloseTo(SOLIDS[0].top, 3);
  });

  it('the bot finishes the main route without falling in', () => {
    const { sim, events, time } = play(MAIN_PLAN);
    const kinds = events.map((e) => e.type);
    expect(sim.mode).toBe('done');
    expect(sim.falls).toBe(0);
    expect(kinds).toContain('grab');
    expect(kinds).toContain('slide');
    expect(kinds).toContain('bounce');
    expect(events.filter((e) => e.type === 'checkpoint').map((e) => (e as { cp: number }).cp)).toEqual([1, 2, 3, 1, 2, 3]);
    expect(kinds.filter((k) => k === 'lap')).toHaveLength(1);
    // A tidy bot run; kids take roughly 1.5-2.5x (see the medal times).
    expect(time).toBeGreaterThan(28);
    expect(time).toBeLessThan(MEDALS.gold);
  });

  it('the secret tile shortcut is faster than the main route', () => {
    const main = play(MAIN_PLAN);
    const short = play(SHORTCUT_PLAN);
    expect(short.sim.mode).toBe('done');
    expect(short.sim.falls).toBe(0);
    expect(short.time).toBeLessThan(main.time - 2);
  });

  it('walking off into the foam splashes, then respawns at the checkpoint with a bubble beard', () => {
    const sim = newRun();
    const events: SimEvent[] = [];
    for (let i = 0; i < 240 && !events.some((e) => e.type === 'respawn'); i++) {
      events.push(...sim.step(DT, { mx: -1, mz: 0.6, sprint: false, jumpPressed: false }));
      if (sim.mode === 'splash') expect(sim.p.y).toBeLessThan(FOAM_Y);
    }
    expect(events.map((e) => e.type)).toContain('splash');
    expect(events.map((e) => e.type)).toContain('respawn');
    expect(sim.p.x).toBeCloseTo(CHECKPOINTS[0].x);
    expect(sim.p.z).toBeCloseTo(CHECKPOINTS[0].z);
    expect(sim.beard).toBeGreaterThan(8);
    expect(sim.falls).toBe(1);
  });

  it('standing on the edge of a float tips you off', () => {
    const sim = newRun();
    const f = SOLIDS.find((s) => s.id === 'float1')!;
    sim.p.x = f.x + (f.r ?? 1) * 0.85;
    sim.p.z = f.z;
    sim.p.y = f.top;
    sim.ground = SOLIDS.indexOf(f);
    let splashed = false;
    for (let i = 0; i < 180 && !splashed; i++) splashed = sim.step(DT, NO_INPUT).some((e) => e.type === 'splash');
    expect(splashed).toBe(true);
  });

  it('the finish only counts after the last checkpoint', () => {
    const sim = newRun();
    const fin = SOLIDS.find((s) => s.id === 'finish')!;
    sim.p.x = fin.x;
    sim.p.z = fin.z;
    sim.p.y = fin.top;
    for (let i = 0; i < 30; i++) sim.step(DT, NO_INPUT);
    expect(sim.mode).toBe('run');
    // First lap: the bubble express floats you back to the start line.
    sim.cp = 3;
    const ev1 = sim.step(DT, NO_INPUT);
    expect(ev1.some((e) => e.type === 'lap')).toBe(true);
    expect(sim.mode).toBe('lift');
    for (let i = 0; i < 60 * 3 && sim.mode === 'lift'; i++) sim.step(DT, NO_INPUT);
    expect(sim.mode).toBe('run');
    expect(sim.cp).toBe(0);
    expect(sim.p.x).toBeCloseTo(START.hero.x, 1);
    // Last lap: the finish counts.
    sim.p.x = fin.x;
    sim.p.z = fin.z;
    sim.p.y = fin.top;
    sim.cp = 3;
    const ev = sim.step(DT, NO_INPUT);
    expect(ev.some((e) => e.type === 'finish')).toBe(true);
    expect(sim.mode).toBe('done');
  });

  it('a jump reaches the configured apex', () => {
    const sim = newRun();
    let peak = sim.p.y;
    sim.step(DT, { ...NO_INPUT, jumpPressed: true });
    for (let i = 0; i < 60; i++) {
      sim.step(DT, NO_INPUT);
      peak = Math.max(peak, sim.p.y);
    }
    expect(peak - SOLIDS[0].top).toBeGreaterThan((RUN.jump * RUN.jump) / (2 * RUN.gravity) - 0.15);
    expect(sim.grounded).toBe(true);
  });
});

describe('foam lava scoring and the friend', () => {
  it('medals, stars and prizes', () => {
    expect(medalFor(MEDALS.gold)).toBe('gold');
    expect(medalFor(MEDALS.gold + 0.1)).toBe('silver');
    expect(medalFor(MEDALS.bronze + 5)).toBe('ribbon');
    expect(starsFor('ribbon')).toBe(1);
    expect(starsFor('gold')).toBe(3);
    expect(prizeFor('gold', true)).toBeGreaterThan(prizeFor('silver', true));
    expect(prizeFor('ribbon', false)).toBeGreaterThan(0);
  });

  it('the friend is beatable with a silver run but not a dawdle', () => {
    const t = ghostTime(ghostTimeline());
    expect(t).toBeGreaterThan(MEDALS.silver);
    expect(t).toBeLessThan(MEDALS.bronze);
  });

  it('the friend never stands in a cannon puff and ends on the finish deck', () => {
    const keys = ghostTimeline();
    const end = ghostTime(keys);
    for (let t = 0; t < end; t += 1 / 30) {
      const g = ghostAt(keys, t);
      for (const c of CANNONS) {
        const inZone = g.x >= c.x && g.x <= CANNON.reachX && Math.abs(g.z - c.z) <= CANNON.halfZ;
        if (inZone) expect(cannonState(t, c.offset).state, `t=${t.toFixed(2)}`).not.toBe('blast');
      }
    }
    const fin = ghostAt(keys, end + 1);
    expect(fin.done).toBe(true);
    expect(fin.anim).toBe('cheer');
    const deck = SOLIDS.find((s) => s.id === 'finish')!;
    expect(Math.abs(fin.x - deck.x)).toBeLessThan(deck.hx!);
    expect(Math.abs(fin.z - deck.z)).toBeLessThan(deck.hz!);
  });

  it('progress grows along the route', () => {
    const sim = newRun();
    const bot = new Autopilot(MAIN_PLAN);
    let last = 0;
    let drops = 0;
    for (let i = 0; i < 60 * 80 && sim.mode !== 'done'; i++) {
      sim.step(DT, bot.input(sim));
      const p = sim.progress();
      if (p < last - 0.05) drops++;
      last = p;
    }
    expect(drops).toBe(0);
    expect(sim.progress()).toBe(1);
  });
});
