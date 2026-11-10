import { describe, expect, it } from 'vitest';
import { rng } from '../../src/activities/bubbleball/bodies';
import {
  POINTS,
  RING,
  SUMO,
  TAIL,
  balloonSlots,
  createSumo,
  friendSkillScale,
  isOut,
  playerRank,
  stepSumo,
  sumoPrize,
  sumoStars,
} from '../../src/activities/dinosumo/sumo';
import type { SumoEvent, SumoInput, SumoState } from '../../src/activities/dinosumo/sumo';

const still: SumoInput = { x: 0, z: 0, sprint: false, swing: false };

/** A child who tries: waddles at the nearest friend (or balloon) and swings the tail up close. */
function kid(s: SumoState): SumoInput {
  const me = s.dinos[0].body;
  let tx = 0;
  let tz = 0;
  let best = Infinity;
  for (const d of s.dinos.slice(1)) {
    if (d.state !== 'ok') continue;
    const dist = Math.hypot(d.body.x - me.x, d.body.z - me.z);
    if (dist < best) {
      best = dist;
      tx = d.body.x;
      tz = d.body.z;
    }
  }
  for (const b of s.balloons) {
    if (b.kind === 'none') continue;
    const dist = Math.hypot(b.x - me.x, b.z - me.z);
    if (dist < best * 0.6) {
      best = dist;
      tx = b.x;
      tz = b.z;
    }
  }
  // Don't chase off the edge.
  const l = Math.hypot(tx, tz);
  if (l > RING.r - 1.2) {
    tx *= (RING.r - 1.2) / l;
    tz *= (RING.r - 1.2) / l;
  }
  const dx = tx - me.x;
  const dz = tz - me.z;
  const d = Math.hypot(dx, dz) || 1;
  return { x: dx / d, z: dz / d, sprint: true, swing: best < TAIL.reach * 0.85 };
}

function play(seed: number, input: (s: SumoState) => SumoInput): { s: SumoState; events: SumoEvent[] } {
  const s = createSumo();
  const rand = rng(seed);
  const out: SumoEvent[] = [];
  const all: SumoEvent[] = [];
  for (let i = 0; i < 60 * 70 && s.phase !== 'over'; i++) {
    stepSumo(s, 1 / 60, { rand, input: input(s) }, out);
    all.push(...out);
  }
  return { s, events: all };
}

describe('Dino Sumo', () => {
  it('ring, stars and prizes', () => {
    expect(isOut(0, RING.r - 0.1)).toBe(false);
    expect(isOut(RING.r + 0.1, 0)).toBe(true);
    expect(sumoStars(1)).toBe(3);
    expect(sumoStars(2)).toBe(2);
    expect(sumoStars(4)).toBe(1);
    expect(sumoPrize(3, 1)).toBe(7);
    expect(friendSkillScale(10, 0)).toBeGreaterThanOrEqual(0.55);
    expect(friendSkillScale(1, 0)).toBe(1);
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

  it('a tail swing next to a friend sends them flying; out of the ring scores for the bumper', () => {
    const s = createSumo();
    s.phase = 'play';
    const me = s.dinos[0];
    const f = s.dinos[1];
    me.body.x = RING.r - 2.2;
    me.body.z = 0;
    f.body.x = RING.r - 0.9;
    f.body.z = 0;
    for (const d of s.dinos.slice(2)) d.body.x = -3;
    s.balloons.forEach((b) => (b.kind = 'none'));
    const out: SumoEvent[] = [];
    const rand = rng(1);
    stepSumo(s, 1 / 60, { rand, input: { ...still, swing: true } }, out);
    expect(out.some((e) => e.kind === 'tailHit' && e.to === 1)).toBe(true);
    let outEv: SumoEvent | undefined;
    for (let i = 0; i < 90 && !outEv; i++) {
      stepSumo(s, 1 / 60, { rand, input: still }, out);
      outEv = out.find((e) => e.kind === 'out');
    }
    expect(outEv).toEqual({ kind: 'out', dino: 1, by: 0 });
    expect(me.points).toBe(POINTS.out);
    // ...and the friend rolls away, then waddles back into the ring.
    let back = false;
    for (let i = 0; i < 60 * 6 && !back; i++) {
      stepSumo(s, 1 / 60, { rand, input: still }, out);
      back = out.some((e) => e.kind === 'back' && e.dino === 1);
    }
    expect(back).toBe(true);
    expect(isOut(f.body.x, f.body.z)).toBe(false);
  });

  it('weak-eye balloons score triple and soak everybody else; plain ones splash the popper', () => {
    const s = createSumo();
    s.phase = 'play';
    s.balloons.forEach((b) => (b.kind = 'none'));
    s.balloons[0].kind = 'weak';
    s.balloons[0].grow = 1;
    s.balloons[8].kind = 'plain'; // far side: out of reach
    s.balloons[8].grow = 1;
    const me = s.dinos[0];
    me.body.x = s.balloons[0].x;
    me.body.z = s.balloons[0].z;
    const out: SumoEvent[] = [];
    stepSumo(s, 1 / 60, { rand: rng(2), input: { ...still, swing: true } }, out);
    expect(out.find((e) => e.kind === 'pop')).toMatchObject({ dino: 0, slot: 0, weak: true });
    expect(me.points).toBeGreaterThanOrEqual(POINTS.weakBalloon);
    expect(s.weakPops).toBe(1);
    for (const d of s.dinos.slice(1)) expect(d.wet).toBeGreaterThan(0);
    expect(me.wet).toBe(0);
    expect(s.balloons[8].kind).toBe('plain');
  });

  it('a full round runs to the end; nobody leaves the mat; a child who tries usually comes first', () => {
    let firsts = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const { s, events } = play(seed, kid);
      expect(s.phase).toBe('over');
      expect(events.some((e) => e.kind === 'over')).toBe(true);
      for (const d of s.dinos) expect(Math.hypot(d.body.x, d.body.z)).toBeLessThanOrEqual(RING.mat + 1e-6);
      if (playerRank(s) === 1) firsts++;
    }
    expect(firsts).toBeGreaterThanOrEqual(6);
  });

  it('friends do things on their own (bumps, swings, pops, outs) even if the player stands still', () => {
    const { s, events } = play(9, () => still);
    expect(events.filter((e) => e.kind === 'swing').length).toBeGreaterThan(3);
    expect(events.some((e) => e.kind === 'pop')).toBe(true);
    expect(s.clock).toBe(0);
    expect(SUMO.seconds).toBeGreaterThanOrEqual(30);
  });
});
