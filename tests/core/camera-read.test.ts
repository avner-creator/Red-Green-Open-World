import { describe, expect, it } from 'vitest';
import { createReadState, READ, readingArm, readWeight, stepReading, type ReadInput, type ReadingSpot, type ReadState } from '../../src/core/camera-read';
import { PLAYER } from '../../src/config';

/** A board at the origin facing +z (readers stand at z > 0), face centre 1.67 m up, 3.5 × 3.04 m. */
const BOARD: ReadingSpot = { id: 'b', x: 0, y: 1.67, z: 0, nx: 0, nz: 1, w: 3.5, h: 3.04 };
const DT = 1 / 60;
/** Hero yaw facing the board from in front of it (forward = (sin, cos) = (0, -1)). */
const FACE_BOARD = Math.PI;

function input(over: Partial<ReadInput> = {}): ReadInput {
  return { heroX: 0, heroZ: 4.5, heroYaw: FACE_BOARD, vx: 0, vz: 0, mode: 'walk', playing: true, chase: false, override: false, look: 0, dt: DT, ...over };
}

function run(st: ReadState, seconds: number, over: Partial<ReadInput> | ((t: number) => Partial<ReadInput>) = {}): void {
  for (let t = 0; t < seconds; t += DT) stepReading(st, [BOARD], input(typeof over === 'function' ? over(t) : over));
}

describe('board reading view zone', () => {
  it('comes in for a hero facing the board, quickly, eased over ~0.6 s', () => {
    const st = createReadState();
    run(st, 0.15);
    expect(st.active).toBe(false);
    run(st, 0.15);
    expect(st.active).toBe(true);
    expect(readWeight(st)).toBeLessThan(0.1);
    run(st, 0.7);
    expect(readWeight(st)).toBe(1);
  });

  it('comes in for a hero standing still in front of the board facing elsewhere, after 0.5 s', () => {
    const st = createReadState();
    run(st, 0.6, { heroYaw: 0 });
    expect(st.active).toBe(false);
    run(st, 0.3, { heroYaw: 0 });
    expect(st.active).toBe(true);
    expect(readWeight(st)).toBeGreaterThan(0);
    expect(readWeight(st)).toBeLessThan(1);
    run(st, 0.7);
    expect(readWeight(st)).toBe(1);
  });

  it('comes in for a hero walking slowly up to it, facing it', () => {
    const st = createReadState();
    run(st, 0.4, (t) => ({ heroZ: 6.5 - 2 * t, vz: -2 }));
    expect(st.active).toBe(true);
  });

  it('does not come in outside the zone (too far, too close, too far to the side)', () => {
    for (const [x, z] of [[0, 9], [0, 1.5], [7, 4], [-6, 3]]) {
      const st = createReadState();
      run(st, 2, { heroX: x, heroZ: z, heroYaw: Math.atan2(-x, -z) });
      expect(st.active, `${x},${z}`).toBe(false);
      expect(st.t).toBe(0);
    }
  });

  it('never comes in while running past at sprint speed (nor at full walk speed)', () => {
    for (const speed of [PLAYER.sprintSpeed, PLAYER.walkSpeed]) {
      const st = createReadState();
      // A run across the zone, 4.5 m in front, facing along the run (and facing the board too).
      for (const yaw of [Math.PI / 2, FACE_BOARD]) {
        let x = -6;
        for (let t = 0; x < 6; t += DT) {
          x += speed * DT;
          stepReading(st, [BOARD], input({ heroX: x, heroZ: 4.5, heroYaw: yaw, vx: speed }));
          expect(st.active, `speed ${speed} yaw ${yaw} at x ${x.toFixed(2)}`).toBe(false);
        }
      }
    }
  });

  it('eases back out when the hero leaves the zone or walks away', () => {
    const st = createReadState();
    run(st, 2);
    expect(readWeight(st)).toBe(1);
    // Walking away from the board at walking pace.
    stepReading(st, [BOARD], input({ heroZ: 4.6, vz: 3, heroYaw: 0 }));
    expect(st.active).toBe(false);
    run(st, 0.3, { heroZ: 5 });
    expect(readWeight(st)).toBeGreaterThan(0);
    run(st, 0.4, (t) => ({ heroZ: 5 + 3 * t, vz: 3, heroYaw: 0 }));
    expect(st.t).toBe(0);

    const st2 = createReadState();
    run(st2, 2);
    stepReading(st2, [BOARD], input({ heroX: 0, heroZ: 9 }));
    expect(st2.active).toBe(false);
  });

  it('player look input wins at once and keeps it off until the hero leaves the zone', () => {
    const st = createReadState();
    run(st, 2);
    expect(st.active).toBe(true);
    // One frame of mouse look worth 0.05 rad.
    stepReading(st, [BOARD], input({ look: 0.05 }));
    expect(st.active).toBe(false);
    expect(st.suppressed).toBe(true);
    // Standing still again for a long time: stays off (no fighting the player's view).
    run(st, 5);
    expect(st.active).toBe(false);
    expect(st.t).toBe(0);
    // Leaving the zone and coming back re-arms it.
    run(st, 0.2, { heroZ: 10 });
    expect(st.suppressed).toBe(false);
    run(st, 1.5);
    expect(st.active).toBe(true);
  });

  it('a tiny jitter of the stick or mouse does not count as looking', () => {
    const st = createReadState();
    run(st, 2, { look: 0.0002 });
    expect(st.active).toBe(true);
  });

  it('never in a vehicle, on horseback, in an activity, flopping, under another camera, or off the playing phase', () => {
    const cases: Partial<ReadInput>[] = [
      { mode: 'driving' },
      { mode: 'riding' },
      { mode: 'external' },
      { mode: 'flop' },
      { chase: true },
      { override: true },
      { playing: false },
    ];
    for (const c of cases) {
      const st = createReadState();
      run(st, 2, c);
      expect(st.active, JSON.stringify(c)).toBe(false);
      expect(st.t).toBe(0);
      // Already in, then the hero gets into a car: eases back out.
      const st2 = createReadState();
      run(st2, 2);
      expect(st2.active).toBe(true);
      run(st2, 0.7, c);
      expect(st2.t, JSON.stringify(c)).toBe(0);
    }
  });
});

describe('board reading arm', () => {
  it('puts the camera where the line over the hero meets the face below its bottom edge', () => {
    const feetY = 0;
    const pts = [{ top: 2.3, reach: 0.6 }];
    const arm = readingArm(BOARD, 0, feetY, 4.5, pts, 1.45);
    // Looks towards the board (-z).
    expect(Math.abs(Math.sin(arm.yaw))).toBeLessThan(1e-6);
    expect(Math.cos(arm.yaw)).toBeLessThan(0);
    // Camera position from the pivot; the line from it over the hero's top front edge.
    const camY = 1.45 + Math.sin(arm.pitch) * arm.distance;
    const camZ = 4.5 + Math.cos(arm.pitch) * arm.distance;
    const p = pts[0];
    const atFace = camY + ((p.top - camY) * (camZ - 0)) / (camZ - (4.5 - p.reach));
    expect(atFace).toBeLessThan(BOARD.y - BOARD.h / 2);
    expect(arm.pitch).toBeLessThanOrEqual(1.1 + 1e-9);
    expect(arm.distance).toBeLessThanOrEqual(10);
  });

  it('a taller hero (a hat) gets a higher camera', () => {
    const low = readingArm(BOARD, 0, 0, 4.5, [{ top: 1.8, reach: 0.4 }], 1.45);
    const high = readingArm(BOARD, 0, 0, 4.5, [{ top: 2.4, reach: 0.4 }], 1.45);
    expect(Math.sin(high.pitch) * high.distance).toBeGreaterThan(Math.sin(low.pitch) * low.distance);
  });

  it('READ timings stay forgiving', () => {
    expect(READ.blend).toBeGreaterThanOrEqual(0.4);
    expect(READ.blend).toBeLessThanOrEqual(0.8);
  });
});
