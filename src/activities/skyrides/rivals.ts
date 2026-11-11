/**
 * The two friends in the sky contest: each flies their own toy plane along the course (with a
 * lane offset, wobbles and rubber-banding so the race stays close) and has a hero from the
 * character catalog in the cockpit, loaded lazily on the first contest. They are cheerful and a bit
 * clumsy: they miss hoops now and then and never touch the weak-eye bonus items.
 */
import * as THREE from 'three';
import { CHARACTERS } from '../../core/characters/catalog';
import type { CharacterId } from '../../core/characters/catalog';
import { loadCharacter } from '../../core/characters/load';
import type { LoadedCharacter } from '../../core/characters/load';
import { createRival, overtook, stepRival } from './contestLogic';
import type { Rival, RivalDef } from './contestLogic';
import { offsetAt } from './course';
import type { Course } from './course';
import { PLANE_TUNING, angleDelta, bezier, follow } from './flightModel';
import type { V3 } from './flightModel';
import { LIVERIES, PLANE_DIMS, createPlaneModel } from './planeModel';
import type { PlaneModel } from './planeModel';

export interface RivalPlane {
  rival: Rival;
  model: PlaneModel;
  hero: LoadedCharacter | null;
  pos: THREE.Vector3;
  yaw: number;
  pitch: number;
  roll: number;
  /** Lateral wobble (silly swerves). */
  wobble: number;
  /** Where the rival is parked on the runway. */
  park: THREE.Vector3;
  parkYaw: number;
}

export type RivalPhase = 'parked' | 'takeoff' | 'race' | 'landing' | 'rollout';

/** Pick two friends that are not the player's own hero. */
export function pickFriends(playerCharacter: string): CharacterId[] {
  const ids = CHARACTERS.map((c) => c.id).filter((id) => id !== playerCharacter);
  // Prefer a varied pair: the first and the middle of the rest.
  return [ids[0], ids[Math.floor(ids.length / 2)] ?? ids[1]];
}

export class Rivals {
  readonly planes: RivalPlane[] = [];
  private readonly group = new THREE.Group();
  private loading: Promise<void> | null = null;
  private heroIds: string[] = [];
  private landFrom: { p: V3; yaw: number }[] = [];
  private landT = 0;
  private landDur = 1;
  private readonly tmp: V3 = { x: 0, y: 0, z: 0 };
  private readonly tan: V3 = { x: 0, y: 0, z: 1 };

  constructor(scene: THREE.Scene, defs: readonly RivalDef[]) {
    this.group.name = 'sky-rivals';
    scene.add(this.group);
    defs.forEach((def, i) => {
      const model = createPlaneModel(LIVERIES[(i + 1) % LIVERIES.length], true);
      this.group.add(model.root);
      this.planes.push({
        rival: createRival(def, 0),
        model,
        hero: null,
        pos: new THREE.Vector3(),
        yaw: 0,
        pitch: 0,
        roll: 0,
        wobble: 0,
        park: new THREE.Vector3(),
        parkYaw: 0,
      });
    });
    this.group.visible = false;
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  /** Load the friends' heroes (once per pair); planes fly empty-cockpit until they arrive. */
  loadHeroes(ids: readonly string[]): void {
    const key = ids.join();
    if (key === this.heroIds.join() && this.loading) return;
    this.heroIds = [...ids];
    const defs = ids.map((id) => CHARACTERS.find((c) => c.id === id)).filter((d): d is (typeof CHARACTERS)[number] => !!d);
    for (const p of this.planes) {
      p.hero?.object.removeFromParent();
      p.hero = null;
    }
    this.loading = Promise.all(defs.map((d) => loadCharacter(d).catch(() => null))).then((heroes) => {
      if (this.heroIds.join() !== key) return;
      heroes.forEach((h, i) => {
        const p = this.planes[i];
        if (!h || !p) return;
        h.object.position.copy(PLANE_DIMS.seat);
        h.object.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.castShadow = false;
        });
        p.model.body.add(h.object);
        h.play('sit', 1, 0);
        p.hero = h;
      });
    });
  }

  /** Park the planes at their runway spots and reset the race state. */
  park(spots: readonly { pos: THREE.Vector3; yaw: number }[], startS: number): void {
    this.planes.forEach((p, i) => {
      const s = spots[i];
      p.park.copy(s.pos);
      p.parkYaw = s.yaw;
      p.pos.copy(s.pos);
      p.yaw = s.yaw;
      p.pitch = p.roll = p.wobble = 0;
      const r = p.rival;
      r.s = startS - 12 - i * 10;
      r.speed = 0;
      r.score = 0;
      r.nextHoop = 0;
      r.puffCooldown = 0;
      this.pose(p);
    });
  }

  /** Take-off roll and climb (t 0..1) towards the course start. */
  takeoff(t: number, course: Course, dt: number, time: number): void {
    this.planes.forEach((p, i) => {
      const r = p.rival;
      const k = Math.min(1, t);
      // Roll down the runway, then lift towards the first course point ahead of the start.
      const fx = Math.sin(p.parkYaw);
      const fz = Math.cos(p.parkYaw);
      const along = 70 * k * k;
      const goal = offsetAt(course, r.s + 40, r.def.lane, 0, this.tmp);
      const lift = Math.max(0, (k - 0.45) / 0.55);
      const x = p.park.x + fx * along;
      const z = p.park.z + fz * along;
      p.pos.set(x + (goal.x - x) * lift * lift, p.park.y + (goal.y - p.park.y) * lift * lift, z + (goal.z - z) * lift * lift);
      p.pitch = lift > 0 && lift < 0.9 ? 0.3 * Math.sin(lift * Math.PI) : 0;
      p.yaw = p.parkYaw;
      this.pose(p);
      p.model.update(dt, Math.min(1, 0.3 + k), PLANE_TUNING.cruise * k, time + i);
    });
  }

  /**
   * Race step. Returns points scored per plane and who overtook the player this step (indices).
   */
  race(dt: number, course: Course, playerS: number, hoopAt: (i: number) => number, time: number): { overtakes: number[] } {
    const overtakes: number[] = [];
    this.planes.forEach((p, i) => {
      const r = p.rival;
      const before = r.s;
      stepRival(r, dt, PLANE_TUNING.cruise * (0.96 + 0.04 * i), playerS, hoopAt, true);
      if (overtook(before, r.s, playerS) && r.puffCooldown <= 0) {
        r.puffCooldown = 6;
        overtakes.push(i);
      }
      // Silly swerves now and then.
      r.wobbleT -= dt;
      if (r.wobbleT <= 0) {
        r.wobbleT = 2 + r.rand() * 3;
        p.wobble = (r.rand() - 0.5) * 6;
      }
      const lane = r.def.lane + p.wobble * Math.sin(time * 0.8 + i);
      const bob = Math.sin(time * 1.3 + i * 2) * 1.2;
      const target = offsetAt(course, r.s, lane, bob, this.tmp);
      const k = follow(4, dt);
      p.pos.x += (target.x - p.pos.x) * k;
      p.pos.y += (target.y - p.pos.y) * k;
      p.pos.z += (target.z - p.pos.z) * k;
      course.tangent(r.s, this.tan);
      const yaw = Math.atan2(this.tan.x, this.tan.z);
      const rate = angleDelta(p.yaw, yaw) / Math.max(dt, 1e-3);
      p.yaw += angleDelta(p.yaw, yaw) * follow(5, dt);
      p.pitch += (Math.asin(Math.max(-1, Math.min(1, this.tan.y))) - p.pitch) * follow(4, dt);
      p.roll += (Math.max(-0.8, Math.min(0.8, -rate * 0.5)) - p.roll) * follow(3, dt);
      this.pose(p);
      p.model.update(dt, 1, r.speed, time + i);
    });
    return { overtakes };
  }

  /** Begin a Bezier landing towards each plane's park spot (approach from behind the runway). */
  beginLanding(seconds: number): void {
    this.landT = 0;
    this.landDur = seconds;
    this.landFrom = this.planes.map((p) => ({ p: { x: p.pos.x, y: p.pos.y, z: p.pos.z }, yaw: p.yaw }));
  }

  /** Landing (t 0..1) to the touchdown point, then roll to the park spot. */
  landing(dt: number, time: number): boolean {
    this.landT += dt / this.landDur;
    const t = Math.min(1, this.landT);
    this.planes.forEach((p, i) => {
      const from = this.landFrom[i];
      const fx = Math.sin(p.parkYaw);
      const fz = Math.cos(p.parkYaw);
      const touch = { x: p.park.x - fx * 10, y: p.park.y, z: p.park.z - fz * 10 };
      const p1 = { x: from.p.x + Math.sin(from.yaw) * 30, y: from.p.y, z: from.p.z + Math.cos(from.yaw) * 30 };
      const p2 = { x: touch.x - fx * 38, y: touch.y + 12, z: touch.z - fz * 38 };
      const before = { x: p.pos.x, z: p.pos.z };
      bezier(from.p, p1, p2, touch, t * t * (3 - 2 * t), this.tmp);
      // Final metres: roll along the ground to the park spot.
      p.pos.set(this.tmp.x, this.tmp.y, this.tmp.z);
      const dx = p.pos.x - before.x;
      const dz = p.pos.z - before.z;
      if (Math.hypot(dx, dz) > 1e-3) p.yaw += angleDelta(p.yaw, Math.atan2(dx, dz)) * follow(8, dt);
      p.pitch += ((t > 0.85 ? 0.08 : -0.08) - p.pitch) * follow(3, dt);
      p.roll += (0 - p.roll) * follow(3, dt);
      this.pose(p);
      p.model.update(dt, 1 - t * 0.6, 18 * (1 - t), time + i);
    });
    return t >= 1;
  }

  rollout(t: number, dt: number, time: number): void {
    this.planes.forEach((p, i) => {
      const fx = Math.sin(p.parkYaw);
      const fz = Math.cos(p.parkYaw);
      const k = Math.min(1, t);
      const e = 1 - (1 - k) * (1 - k);
      p.pos.set(p.park.x - fx * 10 * (1 - e), p.park.y, p.park.z - fz * 10 * (1 - e));
      p.yaw += angleDelta(p.yaw, p.parkYaw) * follow(6, dt);
      p.pitch = 0;
      p.roll = 0;
      this.pose(p);
      p.model.update(dt, 0.4 * (1 - k), 8 * (1 - k), time + i);
    });
  }

  /** Idle at the park spot (propellers ticking over, heroes bobbing). */
  idle(dt: number, time: number): void {
    this.planes.forEach((p, i) => {
      this.pose(p);
      p.model.update(dt, 0.15, 0, time + i);
    });
  }

  private pose(p: RivalPlane): void {
    const root = p.model.root;
    root.position.copy(p.pos);
    root.rotation.set(-p.pitch, p.yaw, p.roll, 'YXZ');
    if (p.hero) {
      p.hero.update(1 / 60);
      p.hero.play('sit');
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const p of this.planes) p.model.dispose();
  }
}
