/**
 * The friend dragon you race on the dragon tour: a smaller pink dragon that flies the same route,
 * rubber-banded to you (so the race stays close), and pops the both-eye cloud-balloons it passes
 * now and then. It never touches the weak-eye treasure or golden clouds (nothing in the both-eye
 * scene reacts to those). Built on the ride's first flight, hidden between rides.
 */
import * as THREE from 'three';
import { rng, rubberBandSpeed } from './contestLogic';
import { offsetAt } from './course';
import type { Course } from './course';
import { createDragonModel } from './dragonModel';
import type { DragonModel } from './dragonModel';
import { angleDelta, follow } from './flightModel';
import type { V3 } from './flightModel';

export const FRIEND = {
  /** Chance to pop each cloud it passes close to. */
  skill: 0.8,
  /** Cruise speed along the route (m/s, before rubber-banding). */
  speed: 17,
  scale: 0.82,
  tint: 0xffb8dc,
} as const;

/** Pure: does a friend moving from `prevS` to `s` along the route reach the cloud at arc length `cloudS`? */
export function friendReaches(prevS: number, s: number, cloudS: number): boolean {
  return prevS < cloudS && s >= cloudS;
}

export class DragonFriend {
  readonly model: DragonModel;
  s = 0;
  score = 0;
  speed = 0;
  private prevS = 0;
  private rand: () => number = rng(7);
  private readonly pos: V3 = { x: 0, y: 0, z: 0 };
  private readonly ahead: V3 = { x: 0, y: 0, z: 0 };
  private yaw = 0;
  private roll = 0;
  private flap = 0;
  private time = 0;
  private readonly tinted: THREE.Material[] = [];

  constructor(parent: THREE.Object3D) {
    this.model = createDragonModel();
    this.model.root.name = 'sky-dragon-friend';
    this.model.root.scale.setScalar(FRIEND.scale);
    // Pink coat: a tinted copy of the shared dragon material (outlines stay dark).
    const cache = new Map<THREE.Material, THREE.Material>();
    this.model.root.traverse((o) => {
      o.userData.cameraIgnore = true;
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const src = m.material as THREE.Material;
      if (!(src instanceof THREE.MeshStandardMaterial)) return;
      let t = cache.get(src);
      if (!t) {
        const c = src.clone();
        c.color.setHex(FRIEND.tint);
        t = c;
        cache.set(src, t);
        this.tinted.push(t);
      }
      m.material = t;
    });
    this.model.setVisible(false);
    parent.add(this.model.root);
  }

  /** Line up just behind the start for a new tour. */
  reset(startS: number, seed: number): void {
    this.s = this.prevS = startS - 3;
    this.score = 0;
    this.speed = 0;
    this.rand = rng(seed);
    this.time = 0;
  }

  setVisible(v: boolean): void {
    this.model.setVisible(v);
  }

  /**
   * Fly on. `clouds` gives each both-eye cloud's arc length and whether it is there; `pop(i)` is
   * called for every cloud the friend pops. Returns the points scored this step.
   */
  update(dt: number, course: Course, playerS: number, clouds: readonly { s: number; here: boolean }[], pop: (i: number) => void): number {
    this.time += dt;
    const want = rubberBandSpeed(FRIEND.speed, this.s, playerS);
    this.speed += (want - this.speed) * follow(1.2, dt);
    this.prevS = this.s;
    this.s += this.speed * dt;
    let pts = 0;
    clouds.forEach((c, i) => {
      if (!c.here || !friendReaches(this.prevS, this.s, c.s)) return;
      if (this.rand() < FRIEND.skill) {
        pop(i);
        pts++;
      }
    });
    this.score += pts;
    // Pose: weave a little round the route, bank into turns, flap now and then.
    const side = 4.5 * Math.sin(this.s / 37);
    offsetAt(course, this.s, side, 1 + Math.sin(this.time * 1.3) * 0.8, this.pos);
    offsetAt(course, this.s + 6, 4.5 * Math.sin((this.s + 6) / 37), 1, this.ahead);
    const wantYaw = Math.atan2(this.ahead.x - this.pos.x, this.ahead.z - this.pos.z);
    const d = angleDelta(this.yaw, wantYaw);
    this.yaw += d * follow(5, dt);
    this.roll += (-d * 2.2 - this.roll) * follow(3, dt);
    const r = this.model.root;
    r.position.set(this.pos.x, this.pos.y, this.pos.z);
    r.rotation.set(0, this.yaw, this.roll, 'YXZ');
    this.flap = Math.max(0, this.flap - dt);
    if (Math.sin(this.time * 2.1) > 0.97) this.flap = 0.6;
    this.model.update(dt, { flap: 0.35 + this.flap, glide: this.flap > 0 ? 0 : 0.7, wag: 0.5, happy: pts > 0 ? 1 : 0.2, sitting: false });
    return pts;
  }

  /** Where the friend is (for bubbles when it pops a cloud). */
  position(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.pos.x, this.pos.y + 1.6, this.pos.z);
  }

  dispose(): void {
    this.model.root.removeFromParent();
    this.model.dispose();
    for (const m of this.tinted) m.dispose();
  }
}
