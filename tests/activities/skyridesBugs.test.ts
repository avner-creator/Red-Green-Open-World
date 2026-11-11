/**
 * Sky-ride bugs found in the kid play-through (agent/foam-sky). Each test failed before its fix.
 */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CONTEST } from '../../src/activities/skyrides/contestLogic';
import { DRAGON_TUNING, createFlyState, leashControls, stepFly } from '../../src/activities/skyrides/flightModel';
import type { FlyControls } from '../../src/activities/skyrides/flightModel';
import { TRAIL, nearCameraScale } from '../../src/activities/skyrides/fx';
import { RideTickets } from '../../src/activities/skyrides/tickets';
import { TOUR } from '../../src/activities/skyrides/dragon';
import { createPlaneModel, LIVERIES } from '../../src/activities/skyrides/planeModel';
import { createDragonModel } from '../../src/activities/skyrides/dragonModel';
import type { GameContext, TicketOutcome } from '../../src/types';

describe('dragon: mashing flap never carries you far above the tour (it went 80 m up and missed everything)', () => {
  it('stays within reach of the tour line while flapping every 0.5 s for 40 s', () => {
    const s = createFlyState(0, 40, 0, 0, DRAGON_TUNING.cruise);
    const line = { x: 0, y: 40, z: 0 };
    let maxAbove = -Infinity;
    for (let i = 0; i < 40 * 30; i++) {
      const c: FlyControls = { turn: 0, climb: 0, boost: false };
      if (i % 15 === 0) s.lift = Math.min(14, s.lift + 10.5);
      line.x = s.x;
      line.z = s.z + 12;
      leashControls(s, c, line, 1 / 30);
      stepFly(s, c, DRAGON_TUNING, 1 / 30, () => 0);
      maxAbove = Math.max(maxAbove, s.y - line.y);
    }
    expect(maxAbove).toBeLessThan(16);
  });

  it('steers back towards the line when it strays far to the side', () => {
    const s = createFlyState(40, 40, 0, 0, DRAGON_TUNING.cruise);
    let minSide = Infinity;
    for (let i = 0; i < 20 * 30; i++) {
      const c: FlyControls = { turn: 1, climb: 0, boost: false };
      leashControls(s, c, { x: 0, y: 40, z: s.z + 12 }, 1 / 30);
      stepFly(s, c, DRAGON_TUNING, 1 / 30, () => 0);
      minSide = Math.min(minSide, Math.abs(s.x));
    }
    expect(minSide).toBeLessThan(24);
  });
});

describe('practice rides pay no gems', () => {
  it('a practice dragon ride (could not pay) pays nothing for treasure or golden clouds', () => {
    const earn = vi.fn();
    const ctx = {
      economy: { rideTicket: (): TicketOutcome => 'practice', ticketPrice: () => 3 },
      profile: { wallet: 0, earn, spend: () => false },
      audio: { play: () => {} },
    } as unknown as GameContext;
    const t = new RideTickets(ctx, 'dragon');
    t.pay();
    expect(t.practice).toBe(true);
    expect(t.payPrize(2)).toBe(0);
    expect(earn).not.toHaveBeenCalled();
  });
});

describe('plane smoke trail never hides your own plane', () => {
  it('trail puffs stay small and shrink to nothing near the camera', () => {
    expect(TRAIL.size + TRAIL.grow).toBeLessThan(1.2);
    expect(TRAIL.life).toBeLessThan(1.5);
    expect(nearCameraScale(2, TRAIL.near)).toBe(0);
    expect(nearCameraScale(TRAIL.near * 2.5, TRAIL.near)).toBe(1);
  });
});

describe('round lengths (45–90 s with countdown, take-off and landing)', () => {
  it('the plane contest and the dragon tour are short enough', () => {
    expect(CONTEST.seconds).toBeLessThanOrEqual(70);
    expect(TOUR.seconds).toBeLessThanOrEqual(62);
  });
});

describe('Pip rides along', () => {
  it('the plane and the dragon have a back seat for Pip', () => {
    const plane = createPlaneModel(LIVERIES[0], false);
    const dragon = createDragonModel();
    for (const m of [plane.root, dragon.root]) {
      const seat = m.getObjectByName('pip-seat');
      expect(seat).toBeDefined();
      expect(seat!.userData.pipSeat).toBe(true);
    }
  });
});

describe('friends in the other planes', () => {
  it('streamed hero models attach on a simulation step, never inside the promise callback', async () => {
    const obj = new THREE.Group();
    vi.doMock('../../src/core/characters/load', () => ({
      loadCharacter: () => Promise.resolve({ object: obj, play: () => {}, update: () => {} }),
    }));
    vi.resetModules();
    const { Rivals } = await import('../../src/activities/skyrides/rivals');
    const scene = new THREE.Scene();
    const r = new Rivals(scene, [{ character: 'panda', skill: 0.5, lane: 6, seed: 1 }]);
    r.loadHeroes(['panda']);
    await new Promise((res) => setTimeout(res, 0));
    await new Promise((res) => setTimeout(res, 0));
    expect(obj.parent).toBeNull();
    r.idle(1 / 60, 0);
    expect(obj.parent).not.toBeNull();
    vi.doUnmock('../../src/core/characters/load');
  });
});
