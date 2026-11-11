/**
 * Foam Lava bugs found in the kid play-through (agent/foam-sky). Each test failed before its fix.
 */
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CANNON, CANNONS, LANE_B, PIT, PROPS, SOLIDS } from '../../src/activities/foamlava/layout';
import { CourseSim, NO_INPUT, RUN, cannonState } from '../../src/activities/foamlava/sim';
import type { SimEvent } from '../../src/activities/foamlava/sim';

const DT = 1 / 60;

function runAt(x: number, z: number, y: number, ground = -1): CourseSim {
  const sim = new CourseSim();
  sim.reset({ x: 3.9, z: 0.6 }, 0);
  sim.running = true;
  sim.p.x = x;
  sim.p.z = z;
  sim.p.y = y;
  sim.ground = ground;
  return sim;
}

describe('foam lava: nothing can be walked through, nobody leaves the course', () => {
  it('running sideways off a float never takes the hero out of the pit (it was 12 m out on the hill)', () => {
    const f = SOLIDS.findIndex((s) => s.id === 'float3');
    const sim = runAt(SOLIDS[f].x, SOLIDS[f].z, SOLIDS[f].top, f);
    let maxX = -Infinity;
    for (let i = 0; i < 180; i++) {
      sim.step(DT, { mx: 1, mz: 0, sprint: true, jumpPressed: i === 0 });
      maxX = Math.max(maxX, sim.p.x);
    }
    expect(maxX).toBeLessThanOrEqual(PIT.x1);
  });

  it('jumping hard at the far rim keeps the hero inside the course', () => {
    const t = SOLIDS.findIndex((s) => s.id === 'towerA');
    const sim = runAt(SOLIDS[t].x, SOLIDS[t].z + 2, SOLIDS[t].top, t);
    let maxZ = -Infinity;
    for (let i = 0; i < 120; i++) {
      sim.step(DT, { mx: 0.3, mz: 1, sprint: true, jumpPressed: i % 30 === 0 });
      maxZ = Math.max(maxZ, sim.p.z);
    }
    expect(maxZ).toBeLessThanOrEqual(PIT.z1);
  });

  it('the booth, the arch, the blowers, the bubble machine and the rope posts are solid during a run', () => {
    for (const prop of PROPS) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const ext = prop.shape === 'box' ? Math.hypot(prop.hx ?? 0, prop.hz ?? 0) : (prop.r ?? 0);
        const sx = prop.x + Math.cos(a) * (ext + 1.5);
        const sz = prop.z + Math.sin(a) * (ext + 1.5);
        const sim = runAt(sx, sz, Math.max(prop.bottom, 0));
        sim.groundAt = () => 0;
        // Props in or by the pit are reached from inside only over the foam (covered by the rim test).
        if (sim.inPit(sx, sz) || prop.bottom > 0 || Math.abs(sx) > PIT.x1) continue;
        let inside = 0;
        for (let i = 0; i < 120; i++) {
          sim.step(DT, { mx: -Math.cos(a), mz: -Math.sin(a), sprint: true, jumpPressed: false });
          const dx = Math.abs(sim.p.x - prop.x);
          const dz = Math.abs(sim.p.z - prop.z);
          const into = prop.shape === 'box' ? dx < (prop.hx ?? 0) + 0.1 && dz < (prop.hz ?? 0) + 0.1 : Math.hypot(dx, dz) < (prop.r ?? 0) + 0.1;
          if (into && sim.p.y < prop.top) inside++;
        }
        expect(inside, `${prop.id} from ${k}`).toBe(0);
      }
    }
  });

  it('the checkpoint flag pole on a deck is solid', () => {
    const cp1 = SOLIDS.findIndex((s) => s.id === 'cp1');
    const pole = PROPS.find((p) => p.id === 'flag1')!;
    const sim = runAt(SOLIDS[cp1].x, pole.z, SOLIDS[cp1].top, cp1);
    for (let i = 0; i < 90; i++) sim.step(DT, { mx: 1, mz: 0, sprint: false, jumpPressed: false });
    expect(sim.falls).toBe(0);
    expect(sim.p.x).toBeLessThan(pole.x);
  });

  it('the friend is solid: walking into them bumps you, never through', () => {
    const sim = runAt(3.3, 20.8 - 2.5, 2.0, SOLIDS.findIndex((s) => s.id === 'cp1'));
    const events: SimEvent[] = [];
    let minD = Infinity;
    for (let i = 0; i < 120; i++) {
      events.push(...sim.step(DT, { mx: 0, mz: 1, sprint: false, jumpPressed: false }));
      events.push(...sim.bumpFriend(3.3, 2.0, 20.8));
      minD = Math.min(minD, Math.hypot(sim.p.x - 3.3, sim.p.z - 20.8));
    }
    expect(minD).toBeGreaterThan(0.6);
    expect(events.some((e) => e.type === 'bump')).toBe(true);
  });
});

describe('foam lava: the blower walkway is fair for a kid who just holds forward', () => {
  it('holding forward from checkpoint 3 reaches the bounce bubbles without falling in (18 falls before)', () => {
    const cp3 = SOLIDS.findIndex((s) => s.id === 'cp3');
    for (const startClock of [0, 0.7, 1.4, 2.1]) {
      const sim = runAt(LANE_B, 24.5, 1.0, cp3);
      sim.cp = 3;
      sim.time = startClock;
      const events: SimEvent[] = [];
      for (let i = 0; i < 60 * 12 && sim.p.z > 6.5; i++) events.push(...sim.step(DT, { mx: 0, mz: -1, sprint: false, jumpPressed: false }));
      expect(sim.falls, `clock ${startClock}`).toBe(0);
      expect(sim.p.z).toBeLessThan(6.6);
    }
  });

  it('a puff knocks you back along the walkway (comic, stays on it), and a jump clears it', () => {
    const walk = SOLIDS.findIndex((s) => s.id === 'walk');
    const c = CANNONS[1];
    // Find a moment the second blower starts to puff.
    let t = 0;
    while (!(cannonState(t, c.offset).state === 'blast' && cannonState(t - DT, c.offset).state !== 'blast')) t += DT;
    const hit = runAt(LANE_B, c.z, 1.0, walk);
    hit.time = t - DT;
    const ev: SimEvent[] = [];
    for (let i = 0; i < 90; i++) ev.push(...hit.step(DT, NO_INPUT));
    expect(ev.some((e) => e.type === 'puffHit')).toBe(true);
    expect(hit.falls).toBe(0);
    expect(hit.p.z).toBeGreaterThan(c.z + 1.5);
    expect(Math.abs(hit.p.x - LANE_B)).toBeLessThan(0.7);
    // Same moment, but jumping just before the puff: it passes under you.
    const dodge = runAt(LANE_B, c.z, 1.0, walk);
    dodge.time = t - 0.1;
    const ev2: SimEvent[] = [];
    ev2.push(...dodge.step(DT, { ...NO_INPUT, jumpPressed: true }));
    for (let i = 0; i < 60; i++) ev2.push(...dodge.step(DT, NO_INPUT));
    expect(ev2.some((e) => e.type === 'puffHit')).toBe(false);
    expect(RUN.jump).toBeGreaterThan(0);
    expect(CANNON.dodge).toBeGreaterThan(0);
  });
});

describe('foam lava friend model', () => {
  it('a streamed friend model is attached on a simulation step, never inside the promise callback', async () => {
    const obj = new THREE.Group();
    vi.doMock('../../src/core/characters/load', () => ({
      loadCharacter: () => Promise.resolve({ object: obj, play: () => {}, update: () => {} }),
    }));
    vi.resetModules();
    const { createFriend } = await import('../../src/activities/foamlava/friend');
    const parent = new THREE.Group();
    const friend = createFriend(parent);
    await friend.prepare('frog', 0);
    expect(obj.parent).toBeNull();
    friend.idle(0, 0, 0, 0, 'idle', DT);
    expect(obj.parent).toBe(parent);
    vi.doUnmock('../../src/core/characters/load');
  });
});

describe('foam lava surprises', () => {
  it('turntable floats carry the hero round, and change every run', () => {
    const sim = new CourseSim();
    sim.reset({ x: 3.9, z: 0.6 }, 0);
    const a = sim.setSpinners(1);
    const b = sim.setSpinners(2);
    expect(a.join()).not.toBe(b.join());
    sim.running = true;
    const i = a[0];
    const f = SOLIDS[i];
    sim.p.x = f.x + 0.5;
    sim.p.z = f.z;
    sim.p.y = f.top;
    sim.ground = i;
    sim.setSpinners(2);
    sim.solids[i].spin = 0.9;
    for (let k = 0; k < 30; k++) sim.step(DT, NO_INPUT);
    expect(Math.abs(sim.p.z - f.z)).toBeGreaterThan(0.1);
  });
});
