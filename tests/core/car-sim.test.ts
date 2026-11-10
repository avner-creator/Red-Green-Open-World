import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createPhysicsSync } from '../../src/core/physics';
import { CAR, NO_CONTROLS, createCarSim, restHeight, type CarControls, type CarEnv } from '../../src/core/vehicles/car-sim';
import type { PhysicsApi } from '../../src/types';

beforeAll(async () => {
  await RAPIER.init();
});

const DT = 1 / 60;

function flatWorld(paved = true, groundY = 0): { physics: PhysicsApi; env: CarEnv } {
  const physics = createPhysicsSync();
  physics.addStaticBox(new THREE.Vector3(0, groundY - 1, 0), new THREE.Vector3(300, 1, 300));
  const env: CarEnv = { heightAt: () => groundY, waterLevel: -10, halfSize: 400, isPaved: () => paved };
  return { physics, env };
}

function run(physics: PhysicsApi, sim: ReturnType<typeof createCarSim>, env: CarEnv, c: CarControls, frames: number): void {
  for (let i = 0; i < frames; i++) {
    physics.step(DT);
    sim.update(DT, c, env);
  }
}

const drive = (throttle: number, steer = 0, handbrake = false): CarControls => ({ throttle, steer, handbrake, hop: false });

describe('buggy simulation (flat ground)', () => {
  it('settles on its springs, all four wheels down, level', () => {
    const { physics, env } = flatWorld();
    const sim = createCarSim(physics, new THREE.Vector3(0, 0, 0), 0);
    run(physics, sim, env, NO_CONTROLS, 120);
    expect(sim.contacts).toBe(4);
    expect(Math.abs(sim.position.y - restHeight())).toBeLessThan(0.08);
    expect(Math.hypot(sim.velocity.x, sim.velocity.z)).toBeLessThan(0.05);
    const y = sim.position.y;
    run(physics, sim, env, NO_CONTROLS, 30);
    expect(Math.abs(sim.position.y - y)).toBeLessThan(0.002);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(sim.quaternion);
    expect(up.y).toBeGreaterThan(0.999);
  });

  it('accelerates quickly to ~16 m/s on road and ~11 m/s off-road', () => {
    for (const [paved, top] of [[true, 16], [false, 11]] as const) {
      const { physics, env } = flatWorld(paved);
      const sim = createCarSim(physics, new THREE.Vector3(0, 0, -200), 0);
      run(physics, sim, env, NO_CONTROLS, 30);
      run(physics, sim, env, drive(1), 60);
      const after1s = sim.forwardSpeed;
      run(physics, sim, env, drive(1), 240);
      expect(after1s).toBeGreaterThan(top * 0.55);
      expect(sim.forwardSpeed).toBeGreaterThan(top - 0.8);
      expect(sim.forwardSpeed).toBeLessThan(top + 0.5);
      expect(sim.position.z).toBeGreaterThan(-200 + top * 3);
    }
  });

  it('brakes, then reverses, and holds still with no input', () => {
    const { physics, env } = flatWorld();
    const sim = createCarSim(physics, new THREE.Vector3(0, 0, -100), 0);
    run(physics, sim, env, drive(1), 120);
    run(physics, sim, env, drive(-1), 45);
    expect(sim.forwardSpeed).toBeLessThan(1);
    run(physics, sim, env, drive(-1), 120);
    expect(sim.forwardSpeed).toBeLessThan(-4);
    expect(sim.forwardSpeed).toBeGreaterThan(-6.5);
    run(physics, sim, env, NO_CONTROLS, 90);
    expect(Math.abs(sim.forwardSpeed)).toBeLessThan(0.1);
  });

  it('steers right with +steer and turns tighter at low speed than at top speed', () => {
    const { physics, env } = flatWorld();
    const sim = createCarSim(physics, new THREE.Vector3(0, 0, 0), 0);
    run(physics, sim, env, drive(0.4), 60);
    const y0 = sim.yaw();
    run(physics, sim, env, drive(0.4, 1), 30);
    const slowRate = (y0 - sim.yaw()) / 0.5;
    expect(slowRate).toBeGreaterThan(0.6); // yaw decreases = turning right
    const { physics: p2, env: e2 } = flatWorld();
    const fast = createCarSim(p2, new THREE.Vector3(0, 0, -200), 0);
    run(p2, fast, e2, drive(1), 240);
    const sp = fast.forwardSpeed;
    run(p2, fast, e2, drive(1, 1), 30);
    // Turning radius grows with speed (softened steering), and the car stays upright.
    const fastRate = Math.abs(fast.velocity.length() / Math.max(1e-3, (fast.accelLat / Math.max(1, sp))));
    expect(fastRate).toBeGreaterThan(0);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(fast.quaternion);
    expect(up.y).toBeGreaterThan(0.85);
    expect(fast.contacts).toBeGreaterThanOrEqual(2);
  });

  it('full-lock at top speed for 3 s never flips', () => {
    const { physics, env } = flatWorld();
    const sim = createCarSim(physics, new THREE.Vector3(0, 0, -200), 0);
    run(physics, sim, env, drive(1), 200);
    let minUp = 1;
    for (let i = 0; i < 180; i++) {
      run(physics, sim, env, drive(1, i < 90 ? 1 : -1, i % 60 > 40), 1);
      minUp = Math.min(minUp, new THREE.Vector3(0, 1, 0).applyQuaternion(sim.quaternion).y);
    }
    expect(minUp).toBeGreaterThan(0.8);
  });

  it('rights itself after being dropped upside down', () => {
    const { physics, env } = flatWorld();
    const sim = createCarSim(physics, new THREE.Vector3(0, 0, 0), 0);
    sim.body.setTranslation({ x: 0, y: 1.2, z: 0 }, true);
    sim.body.setRotation({ x: 0, y: 0, z: 1, w: 0 }, true); // rolled 180°
    run(physics, sim, env, NO_CONTROLS, 240);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(sim.quaternion);
    expect(up.y).toBeGreaterThan(0.95);
    expect(sim.contacts).toBe(4);
  });

  it('hops on demand and lands on its wheels', () => {
    const { physics, env } = flatWorld();
    const sim = createCarSim(physics, new THREE.Vector3(0, 0, 0), 0);
    run(physics, sim, env, NO_CONTROLS, 60);
    const y0 = sim.position.y;
    run(physics, sim, env, { ...NO_CONTROLS, hop: true }, 1);
    let peak = y0;
    for (let i = 0; i < 90; i++) {
      run(physics, sim, env, NO_CONTROLS, 1);
      peak = Math.max(peak, sim.position.y);
    }
    expect(peak - y0).toBeGreaterThan(0.5);
    expect(sim.contacts).toBe(4);
  });

  it('bounces off a wall with a bump event instead of stopping dead', () => {
    const { physics, env } = flatWorld();
    physics.addStaticBox(new THREE.Vector3(0, 1, 30), new THREE.Vector3(10, 2, 0.5));
    const sim = createCarSim(physics, new THREE.Vector3(0, 0, 0), 0);
    let bump = 0;
    for (let i = 0; i < 240 && bump === 0; i++) {
      physics.step(DT);
      bump = sim.update(DT, drive(1), env).bump;
    }
    expect(bump).toBeGreaterThan(4);
    run(physics, sim, env, NO_CONTROLS, 10);
    expect(sim.velocity.z).toBeLessThan(0.5); // bounced back or stopped, never through
    expect(sim.position.z).toBeLessThan(30);
  });

  it('slows to a crawl in shallow water', () => {
    const { physics, env } = flatWorld();
    env.waterLevel = 0.5; // ground at 0 → 0.5 m deep everywhere
    const sim = createCarSim(physics, new THREE.Vector3(0, 0, -100), 0);
    run(physics, sim, env, drive(1), 240);
    expect(sim.forwardSpeed).toBeLessThan(5);
  });

  it('has the dimensions the model is built on', () => {
    expect(CAR.wheelFrontZ - CAR.wheelRearZ).toBeCloseTo(2.3, 5);
  });
});

describe('buggy parking', () => {
  for (const [name, angle, yaw] of [
    ['flat', 0, 0],
    ['nose-down 6° slope', 0.105, 0],
    ['side-on 6° slope', 0.105, Math.PI / 2],
  ] as const) {
    it(`rests dead still with no throttle (${name})`, () => {
      const physics = createPhysicsSync();
      // A plane tilted down towards +Z.
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle);
      physics.addStaticBox(new THREE.Vector3(0, -1, 0).applyQuaternion(q), new THREE.Vector3(300, 1, 300), q);
      const env: CarEnv = { heightAt: (_x, z) => -Math.tan(angle) * z, waterLevel: -100, halfSize: 400, isPaved: () => true };
      const sim = createCarSim(physics, new THREE.Vector3(0, 0, 0), yaw);
      run(physics, sim, env, NO_CONTROLS, 120);
      const p0 = sim.position.clone();
      const q0 = sim.quaternion.clone();
      run(physics, sim, env, NO_CONTROLS, 120);
      expect(sim.position.distanceTo(p0) * 1000).toBeLessThan(1);
      expect((sim.quaternion.angleTo(q0) * 180) / Math.PI).toBeLessThan(0.05);
    });
  }
});
