/**
 * Island toys at run time: watches the hero (and the car they drive) and bumps the toys they touch.
 * A bump writes the toy's pivot and the game time into `U.bumps`; the toy shader does the wobble or
 * the whirl. Mushroom caps bounce the hero up (like a tiny trampoline). Comic sounds only.
 * Deterministic: game time only (`U.time`), no Math.random. Cheap: a 16 m grid, a few toys per frame.
 */
import * as THREE from 'three';
import type { AudioApi, PlayerApi, VehiclesApi } from '../../types';
import { TOY_BUMP_SLOTS, U } from '../materials';
import type { ToyDef } from './toys';

export interface ToysDeps {
  player?: PlayerApi;
  vehicles?: VehiclesApi;
  audio?: AudioApi;
}

/** Mushroom bounce: upward speed (m/s) and how much of the run-up speed is kept. */
export const MUSHROOM_BOUNCE = { up: 10.5, keep: 0.7 } as const;

const CELL = 16;
const key = (x: number, z: number): number => (Math.floor(x / CELL) + 512) * 1024 + Math.floor(z / CELL) + 512;

export interface ToysLive {
  update(dt: number): void;
  /** Test hooks: how many bumps and bounces so far. */
  stats(): { bumps: number; bounces: number; toys: number };
}

export function createToysLive(toys: readonly ToyDef[], deps: ToysDeps): ToysLive {
  const grid = new Map<number, number[]>();
  toys.forEach((t, i) => {
    for (const dx of [-1, 0, 1]) {
      for (const dz of [-1, 0, 1]) {
        const k = key(t.x + dx * 3, t.z + dz * 3);
        let a = grid.get(k);
        if (!a) grid.set(k, (a = []));
        if (!a.includes(i)) a.push(i);
      }
    }
  });
  const cool = new Float32Array(toys.length);
  let slot = 0;
  let bumps = 0;
  let bounces = 0;
  let pitchStep = 0;
  const v = new THREE.Vector3();

  const bump = (t: ToyDef, i: number, sound: Parameters<AudioApi['play']>[0] | null, vol: number, pitch: number, cd: number): void => {
    if (cool[i] > 0) return;
    cool[i] = cd;
    U.bumps.value[slot].set(t.pivot[0], t.pivot[1], t.pivot[2], U.time.value);
    slot = (slot + 1) % TOY_BUMP_SLOTS;
    bumps++;
    // A little pitch variety without randomness.
    pitchStep = (pitchStep + 1) % 5;
    if (sound) deps.audio?.play(sound, { volume: vol, pitch: pitch * (0.92 + pitchStep * 0.04) });
  };

  return {
    update(dt) {
      for (let i = 0; i < cool.length; i++) if (cool[i] > 0) cool[i] -= dt;
      const p = deps.player;
      if (!p) return;
      const car = p.vehicle;
      const px = car ? car.position.x : p.position.x;
      const py = car ? car.position.y : p.position.y;
      const pz = car ? car.position.z : p.position.z;
      const near = grid.get(key(px, pz));
      if (!near) return;
      const speed = Math.hypot(p.velocity.x, p.velocity.z);
      for (const i of near) {
        const t = toys[i];
        const dh = Math.hypot(px - t.x, pz - t.z);
        if (car) {
          // Cars nudge toys: a wobble and a squeak, nobody gets hurt.
          if (dh < t.r + 1.6 && py < t.y + t.top + 1) bump(t, i, t.kind === 'duck' ? 'squeak' : 'boing', 0.4, 1.4, 1.0);
          continue;
        }
        if (p.mode !== 'walk') continue;
        switch (t.kind) {
          case 'mushroom': {
            const top = t.y + t.top;
            if (dh < t.r + 0.35 && py > top - 0.45 && py < top + 0.7 && p.velocity.y <= 0.5) {
              if (cool[i] > 0) break;
              bump(t, i, 'bigBoing', 0.55, 1.15, 0.45);
              v.set(p.velocity.x * MUSHROOM_BOUNCE.keep, MUSHROOM_BOUNCE.up, p.velocity.z * MUSHROOM_BOUNCE.keep);
              p.launch(v);
              bounces++;
            } else if (dh < t.r + 0.6 && py < top - 0.45) bump(t, i, 'boing', 0.35, 1.5, 0.8);
            break;
          }
          case 'duck':
            if (dh < t.r + 0.65 && py < t.y + t.top) bump(t, i, 'squeak', 0.5, 1.0, 0.7);
            break;
          case 'pinwheel':
            if (dh < 1.5 && (speed > 1.5 || dh < 0.8)) bump(t, i, 'whoosh', 0.18, 1.6, 1.4);
            break;
          case 'ball':
            if (dh < t.r + 0.65 && py < t.y + t.top + 0.4) bump(t, i, 'boing', 0.45, 1.7, 0.7);
            break;
          case 'spring':
            if (dh < t.r + 0.65 && py < t.y + t.top) bump(t, i, 'boing', 0.4, 2.3, 0.7);
            break;
        }
      }
    },
    stats: () => ({ bumps, bounces, toys: toys.length }),
  };
}
