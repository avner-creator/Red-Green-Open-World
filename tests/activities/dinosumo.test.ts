import { describe, expect, it } from 'vitest';
import { rng } from '../../src/activities/bubbleball/bodies';
import {
  BEAT,
  DASH,
  POINTS,
  RING,
  SUMO,
  balloonSlots,
  beatPhase,
  createSumo,
  friendSkillScale,
  isOut,
  isPerfect,
  playerRank,
  stepSumo,
  sumoPrize,
  sumoStars,
} from '../../src/activities/dinosumo/sumo';
import type { SumoEvent, SumoInput, SumoState } from '../../src/activities/dinosumo/sumo';

const still: SumoInput = { x: 0, z: 0, sprint: false, swing: false };

/**
 * A child who tries: goes round the nearest friend so it is between them and the ring edge, then
 * belly-charges it outward.
 */
function kid(s: SumoState, t: number): SumoInput {
  const me = s.dinos[0].body;
  let target: SumoState['dinos'][number] | null = null;
  let best = Infinity;
  for (const d of s.dinos.slice(1)) {
    if (d.state !== 'ok') continue;
    const dist = Math.hypot(d.body.x - me.x, d.body.z - me.z);
    if (dist < best) {
      best = dist;
      target = d;
    }
  }
  if (!target) return { x: -me.x, z: -me.z, sprint: false, swing: false };
  const tb = target.body;
  const tl = Math.hypot(tb.x, tb.z) || 1;
  // Stand on the centre side of the target.
  const sx = tb.x - (tb.x / tl) * 1.4;
  const sz = tb.z - (tb.z / tl) * 1.4;
  const lined = Math.hypot(sx - me.x, sz - me.z) < 0.9;
  const tx = lined ? tb.x : sx;
  const tz = lined ? tb.z : sz;
  const dx = tx - me.x;
  const dz = tz - me.z;
  const d = Math.hypot(dx, dz) || 1;
  return { x: dx / d, z: dz / d, sprint: true, swing: lined && best < 2.4 && Math.floor(t * 5) % 2 === 0 };
}

function play(seed: number, input: (s: SumoState, t: number) => SumoInput): { s: SumoState; events: SumoEvent[] } {
  const s = createSumo();
  const rand = rng(seed);
  const out: SumoEvent[] = [];
  const all: SumoEvent[] = [];
  for (let i = 0; i < 60 * 80 && s.phase !== 'over'; i++) {
    stepSumo(s, 1 / 60, { rand, input: input(s, i / 60) }, out);
    all.push(...out);
  }
  return { s, events: all };
}

/** Player at the centre side of friend 1 near the edge, the others out of the way. */
function setup(): SumoState {
  const s = createSumo();
  s.phase = 'play';
  s.dinos[0].body.x = RING.r - 2.4;
  s.dinos[0].body.z = 0;
  s.dinos[1].body.x = RING.r - 1;
  s.dinos[1].body.z = 0;
  s.dinos[2].body.x = -3;
  s.dinos[2].body.z = 1.5;
  s.dinos[3].body.x = -3;
  s.dinos[3].body.z = -1.5;
  for (const d of s.dinos.slice(2)) d.think = 99;
  s.balloons.forEach((b) => (b.kind = 'none'));
  return s;
}

describe('Dino Sumo', () => {
  it('ring, stars and prizes', () => {
    expect(isOut(0, RING.r - 0.1)).toBe(false);
    expect(isOut(RING.r + 0.1, 0)).toBe(true);
    expect(sumoStars(1)).toBe(3);
    expect(sumoStars(2)).toBe(2);
    expect(sumoStars(4)).toBe(1);
    expect(sumoPrize(3, 1)).toBe(7);
    expect(sumoPrize(1, 9)).toBe(5);
    expect(friendSkillScale(10, 0)).toBeGreaterThanOrEqual(0.6);
    expect(friendSkillScale(1, 0)).toBeLessThan(1);
    expect(friendSkillScale(0, 2)).toBe(1);
  });

  it('balloon slots hang inside the ring at reachable height', () => {
    for (const b of balloonSlots()) {
      expect(Math.hypot(b.x, b.z)).toBeLessThan(RING.r);
      expect(b.y).toBeGreaterThan(1.2);
      expect(b.y).toBeLessThan(2.2);
    }
    const s = createSumo();
    expect(s.balloons.filter((b) => b.kind === 'weak').length).toBeGreaterThan(0);
    expect(s.balloons.filter((b) => b.kind === 'weak').length).toBeLessThanOrEqual(2);
  });

  it('a belly charge into a friend sends them flying; ring-out = a point for the bumper; they waddle back', () => {
    const s = setup();
    const me = s.dinos[0];
    const f = s.dinos[1];
    const out: SumoEvent[] = [];
    const rand = rng(1);
    const all: SumoEvent[] = [];
    stepSumo(s, 1 / 60, { rand, input: { x: 1, z: 0, sprint: false, swing: true } }, out);
    all.push(...out);
    expect(out.some((e) => e.kind === 'swing' && e.dino === 0)).toBe(true);
    let outEv: SumoEvent | undefined;
    for (let i = 0; i < 120 && !outEv; i++) {
      stepSumo(s, 1 / 60, { rand, input: still }, out);
      all.push(...out);
      outEv = out.find((e) => e.kind === 'out');
    }
    expect(all.some((e) => e.kind === 'tailHit' && e.from === 0 && e.to === 1)).toBe(true);
    expect(outEv).toEqual({ kind: 'out', dino: 1, by: 0 });
    expect(me.points).toBe(POINTS.out);
    // The charger belly-bounced back and stayed in.
    expect(isOut(me.body.x, me.body.z)).toBe(false);
    let back = false;
    for (let i = 0; i < 60 * 6 && !back; i++) {
      stepSumo(s, 1 / 60, { rand, input: still }, out);
      back = out.some((e) => e.kind === 'back' && e.dino === 1);
    }
    expect(back).toBe(true);
    expect(isOut(f.body.x, f.body.z)).toBe(false);
  });

  it('two charges meeting head on bonk both back', () => {
    const s = setup();
    s.dinos[1].body.x = s.dinos[0].body.x + 2;
    s.dinos[1].think = 99;
    const out: SumoEvent[] = [];
    const all: SumoEvent[] = [];
    const rand = rng(4);
    s.dinos[1].wantSwing = false;
    stepSumo(s, 1 / 60, { rand, input: { x: 1, z: 0, sprint: false, swing: true } }, out);
    // Make the friend charge too.
    s.dinos[1].swing = DASH.seconds;
    s.dinos[1].dashX = -1;
    s.dinos[1].dashZ = 0;
    for (let i = 0; i < 30; i++) {
      stepSumo(s, 1 / 60, { rand, input: still }, out);
      all.push(...out);
    }
    expect(all.some((e) => e.kind === 'bonk')).toBe(true);
  });

  it('weak-eye balloons soak everybody else (slow + slippery); plain ones splash dinos nearby; friends cannot pop weak ones', () => {
    const s = createSumo();
    s.phase = 'play';
    s.balloons.forEach((b) => (b.kind = 'none'));
    s.balloons[0].kind = 'weak';
    s.balloons[0].grow = 1;
    s.balloons[8].kind = 'plain'; // far side: out of reach
    s.balloons[8].grow = 1;
    const me = s.dinos[0];
    me.body.x = s.balloons[0].x - 0.3;
    me.body.z = s.balloons[0].z;
    const out: SumoEvent[] = [];
    const all: SumoEvent[] = [];
    const rand = rng(2);
    stepSumo(s, 1 / 60, { rand, input: { x: 1, z: 0, sprint: false, swing: true } }, out);
    all.push(...out);
    for (let i = 0; i < 5; i++) {
      stepSumo(s, 1 / 60, { rand, input: still }, out);
      all.push(...out);
    }
    expect(all.find((e) => e.kind === 'pop')).toMatchObject({ dino: 0, slot: 0, weak: true });
    expect(s.weakPops).toBe(1);
    for (const d of s.dinos.slice(1)) expect(d.wet).toBeGreaterThan(0);
    expect(me.wet).toBe(0);
    expect(s.balloons[8].kind).toBe('plain');

    // A friend charging right under a weak balloon does not pop it (they can't see it).
    const s2 = createSumo();
    s2.phase = 'play';
    s2.balloons.forEach((b) => (b.kind = 'none'));
    s2.balloons[0].kind = 'weak';
    s2.balloons[0].grow = 1;
    const f = s2.dinos[1];
    f.body.x = s2.balloons[0].x;
    f.body.z = s2.balloons[0].z;
    f.swing = DASH.seconds;
    stepSumo(s2, 1 / 60, { rand, input: still }, out);
    expect(s2.balloons[0].kind).toBe('weak');
  });

  it('a soaked dino is shoved further', () => {
    const shove = (wet: boolean): number => {
      const s = setup();
      s.dinos[1].body.x = s.dinos[0].body.x + 1.5;
      s.dinos[1].think = 99;
      if (wet) s.dinos[1].wet = 2;
      stepSumo(s, 1 / 60, { rand: rng(3), input: { x: 1, z: 0, sprint: false, swing: true } }, []);
      let vx = 0;
      for (let i = 0; i < 12; i++) {
        stepSumo(s, 1 / 60, { rand: rng(3), input: still }, []);
        vx = Math.max(vx, s.dinos[1].body.vx);
      }
      return vx;
    };
    expect(shove(true)).toBeGreaterThan(shove(false) * 1.15);
  });

  it('a charge on the weak-eye beat is a super charge (bigger shove); off the beat it is not', () => {
    expect(beatPhase(0)).toBe(0);
    expect(isPerfect(BEAT.period - 0.05)).toBe(true);
    expect(isPerfect(BEAT.period * 0.5)).toBe(false);
    const shove = (beat: number): { vx: number; perfects: number } => {
      const s = setup();
      s.dinos[0].body.x = 0;
      s.dinos[1].body.x = 1.6;
      s.beat = beat - 1 / 60; // the step adds one frame
      stepSumo(s, 1 / 60, { rand: rng(3), input: { x: 1, z: 0, sprint: false, swing: true } }, []);
      let vx = 0;
      for (let i = 0; i < 12; i++) {
        stepSumo(s, 1 / 60, { rand: rng(3), input: still }, []);
        vx = Math.max(vx, s.dinos[1].body.vx);
      }
      return { vx, perfects: s.perfects };
    };
    const on = shove(BEAT.period * 3 - 0.1);
    const off = shove(BEAT.period * 3 + 0.5);
    expect(on.perfects).toBe(1);
    expect(off.perfects).toBe(0);
    expect(on.vx).toBeGreaterThan(off.vx * 1.3);
  });

  it('first to 3 ring-outs ends the round; a child who tries usually comes first; nobody leaves the mat', () => {
    let firsts = 0;
    let early = 0;
    let friendPoints = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const { s, events } = play(seed, kid);
      expect(s.phase).toBe('over');
      expect(events.some((e) => e.kind === 'over')).toBe(true);
      for (const d of s.dinos) expect(Math.hypot(d.body.x, d.body.z)).toBeLessThanOrEqual(RING.mat + 1e-6);
      if (playerRank(s) === 1) firsts++;
      if (s.dinos.some((d) => d.points >= SUMO.target)) early++;
      friendPoints += s.dinos.slice(1).reduce((a, d) => a + d.points, 0);
    }
    expect(firsts).toBeGreaterThanOrEqual(7);
    expect(early).toBeGreaterThanOrEqual(5);
    // The friends score too (they push back).
    expect(friendPoints).toBeGreaterThan(2);
  });

  it('friends play on their own (charges, bumps, pops, ring-outs) and beat a player who stands still', () => {
    let losses = 0;
    for (const seed of [9, 10, 11, 12]) {
      const { s, events } = play(seed, () => still);
      expect(events.filter((e) => e.kind === 'swing').length).toBeGreaterThan(3);
      expect(events.some((e) => e.kind === 'out')).toBe(true);
      if (playerRank(s) > 1) losses++;
    }
    expect(losses).toBeGreaterThanOrEqual(3);
    expect(SUMO.seconds).toBeGreaterThanOrEqual(30);
  });
});
