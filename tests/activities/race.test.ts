import { describe, expect, it } from 'vitest';
import { AI, BoostChain, bandFactor, cornerSpeed, newRival, prizeFor, racePrice, standings, stepRival, type RivalTuning } from '../../src/activities/race/ai';
import { LAP_POINTS, Progress, boostPadDistances, buildTrack, checkpointDistances, leftOf, racingLine } from '../../src/activities/race/track';
import { RIVALS } from '../../src/activities/race/config';

const track = buildTrack();

/** Simulate a race where the player drives the lap at a fixed average speed. */
function simulate(playerSpeed: number, laps = 3, dt = 1 / 30): { place: number; time: number; maxGap: number; rivalsDone: boolean } {
  const L = track.length;
  const rivals = RIVALS.map((r, i) => ({ t: r as RivalTuning, s: newRival(-6 - i * 6, r.lane) }));
  let player = -4;
  let time = 0;
  let playerDone: number | null = null;
  let maxGap = 0;
  for (let i = 0; i < 200 * 30; i++) {
    time += dt;
    if (playerDone === null) player += Math.min(playerSpeed, time * 6) * dt;
    if (playerDone === null && player >= laps * L) playerDone = time;
    for (const r of rivals) {
      stepRival(r.s, r.t, { length: L, laps, playerProgress: player, playerLateral: 0, playerSpeed, time, curvature: (s) => track.curvatureNear(s, 4) }, dt);
      if (playerDone === null) maxGap = Math.max(maxGap, Math.abs(r.s.progress - player));
    }
    if (playerDone !== null && rivals.every((r) => r.s.finishedAt !== null)) break;
  }
  const list = [{ id: 'p', progress: player, finishedAt: playerDone }, ...rivals.map((r, i) => ({ id: `r${i}`, progress: r.s.progress, finishedAt: r.s.finishedAt }))];
  const place = standings(list).findIndex((x) => x.id === 'p') + 1;
  return { place, time: playerDone ?? Infinity, maxGap, rivalsDone: rivals.every((r) => r.s.finishedAt !== null) };
}

describe('race track', () => {
  it('is a closed loop of about 240 m that starts by the garage', () => {
    expect(track.length).toBeGreaterThan(200);
    expect(track.length).toBeLessThan(300);
    const p0 = track.at(0);
    expect(Math.hypot(p0.x - 29.5, p0.z - 11.2)).toBeLessThan(2);
    // Heading east at the start.
    expect(p0.dx).toBeGreaterThan(0.9);
    for (const c of LAP_POINTS) {
      const pr = track.project(c[0], c[1]);
      expect(pr.dist).toBeLessThan(2.5);
    }
  });

  it('has no corner tighter than a buggy can take', () => {
    for (const p of track.points) expect(Math.abs(p.k)).toBeLessThan(0.2);
  });

  it('projects points back onto their lap distance with the right side', () => {
    for (const s of [5, 60, 120, 200]) {
      const p = track.at(s);
      const l = leftOf(p.dx, p.dz);
      const pr = track.project(p.x + l.x * 2, p.z + l.z * 2);
      expect(Math.abs(pr.s - s)).toBeLessThan(1.5);
      expect(pr.lateral).toBeGreaterThan(1.5);
      expect(pr.lateral).toBeLessThan(2.5);
    }
  });

  it('racing line stays on the road and cuts to the inside of corners', () => {
    const line = racingLine(track);
    expect(line.length).toBe(track.points.length);
    for (const o of line) expect(Math.abs(o)).toBeLessThanOrEqual(2.2);
    // The lap turns right overall (clockwise), so the line leans right (negative) on average.
    const mean = line.reduce((a, b) => a + b, 0) / line.length;
    expect(mean).toBeLessThan(0);
  });

  it('places boost pads on straights, apart and away from the start grid', () => {
    const pads = boostPadDistances(track);
    expect(pads.length).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < pads.length; i++) {
      expect(pads[i]).toBeGreaterThan(17);
      expect(pads[i]).toBeLessThan(track.length - 17);
      if (i > 0) expect(pads[i] - pads[i - 1]).toBeGreaterThan(20);
      expect(track.curvatureNear(pads[i], 6)).toBeLessThan(0.06);
    }
    expect(checkpointDistances(100, 4)).toEqual([0, 25, 50, 75]);
  });

  it('progress counts laps, ignores teleports and stays still when far off track', () => {
    const L = track.length;
    const pr = new Progress(L, 0);
    for (let s = 0; s <= L * 1.5; s += 3) pr.update(s % L, 1);
    expect(pr.value).toBeGreaterThan(L * 1.45);
    const before = pr.value;
    pr.update((pr.value + 80) % L, 1); // teleport ahead
    expect(pr.value).toBe(before);
    pr.update((before + 83) % L, 40); // far away
    expect(pr.value).toBe(before);
  });
});

describe('friend racers', () => {
  it('corner speed falls with curvature and the rubber band is bounded', () => {
    expect(cornerSpeed(0)).toBe(Infinity);
    expect(cornerSpeed(0.1)).toBeLessThan(cornerSpeed(0.02));
    expect(bandFactor(100, 0)).toBe(AI.bandMin);
    expect(bandFactor(-100, 0)).toBe(AI.bandMax);
  });

  it('a child who tries (about 10 m/s average) wins', () => {
    const r = simulate(10);
    expect(r.place).toBe(1);
  });

  it('a fast driver wins and the race lasts 60–90 s at a typical pace', () => {
    const r = simulate(12);
    expect(r.place).toBe(1);
    expect(r.time).toBeGreaterThan(55);
    expect(r.time).toBeLessThan(90);
  });

  it('rubber-banding keeps friends close (never more than ~45 m away)', () => {
    for (const v of [7, 10, 14]) expect(simulate(v).maxGap).toBeLessThan(45);
  });

  it('friends still finish when the player stops (the race always ends)', () => {
    const r = simulate(0);
    expect(r.rivalsDone).toBe(true);
    expect(r.place).toBe(3);
  });

  it('dawdling loses, but only just', () => {
    expect(simulate(6).place).toBeGreaterThan(1);
  });

  it('prizes and tickets', () => {
    expect(prizeFor(1)).toEqual({ stars: 3, gems: 8 });
    expect(prizeFor(3).stars).toBe(1);
    expect(racePrice(0)).toBe(0);
    expect(racePrice(1)).toBe(3);
  });

  it('three boost pads in a row make a surge', () => {
    const c = new BoostChain(5);
    expect(c.hit(0, 1)).toBe(1);
    expect(c.hit(1, 3)).toBe(2);
    expect(c.hit(2, 5)).toBe(3);
    expect(c.hit(3, 7)).toBe(1);
    expect(c.hit(0, 9)).toBe(1); // skipped one: start again
    expect(c.hit(1, 30)).toBe(1); // too slow
    expect(c.hit(4, 31)).toBe(1);
    expect(c.hit(0, 33)).toBe(2); // wraps around the lap
  });
});
