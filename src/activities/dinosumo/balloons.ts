/**
 * Water balloons over the Dino Sumo ring and their splashes.
 * - Plain balloons: both-eye, bright, instanced (one draw for balloons, one for strings).
 * - Weak-eye balloons: their own meshes (balloon, string, glow) in the WeakOnly layer, never in the
 *   main scene; their pop burst is drawn on the layer too.
 * - Splash droplets on the dinos: both-eye, instanced.
 */
import * as THREE from 'three';
import { VisionLayer } from '../../types';
import type { VisionApi } from '../../types';
import { createGlowMaterial, createLayerMaterial } from '../../vision';
import type { BalloonSlot } from './sumo';

const PLAIN_COLOURS = [0xffffff, 0xfff1a0, 0xc8f4ff, 0xffffff, 0xffe0ef];
const BALLOON_S = new THREE.Vector3(0.27, 0.33, 0.27);

/** Simple pooled droplet burst (instanced spheres). */
export class Splash {
  readonly mesh: THREE.InstancedMesh;
  private readonly px: Float32Array;
  private readonly v: Float32Array;
  private readonly life: Float32Array;
  private readonly size: Float32Array;
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();

  constructor(
    private readonly max: number,
    material: THREE.Material,
    private readonly rand: () => number = Math.random,
  ) {
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), material, max);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.px = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.size = new Float32Array(max);
    this.hideAll();
  }

  private hideAll(): void {
    this.m.makeScale(0, 0, 0);
    for (let i = 0; i < this.max; i++) this.mesh.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  burst(x: number, y: number, z: number, count: number, speed = 3.2, size = 0.07): void {
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const a = this.rand() * Math.PI * 2;
      const up = 0.4 + this.rand() * 0.9;
      const sp = speed * (0.4 + this.rand() * 0.8);
      this.px.set([x, y, z], i * 3);
      this.v.set([Math.cos(a) * sp, up * speed, Math.sin(a) * sp], i * 3);
      this.life[i] = 0.6 + this.rand() * 0.5;
      this.size[i] = size * (0.6 + this.rand() * 0.9);
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = i * 3;
      this.v[k + 1] -= 14 * dt;
      this.px[k] += this.v[k] * dt;
      this.px[k + 1] += this.v[k + 1] * dt;
      this.px[k + 2] += this.v[k + 2] * dt;
      const s = this.life[i] > 0 ? this.size[i] * Math.min(1, this.life[i] * 3) : 0;
      this.m.compose(this.p.set(this.px[k], this.px[k + 1], this.px[k + 2]), this.q, this.s.set(s, s * 1.3, s));
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  clear(): void {
    this.life.fill(0);
    this.hideAll();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
  }
}

export interface BalloonViews {
  /** Both-eye objects (add to the ring group). */
  readonly group: THREE.Group;
  /** Weak-eye objects (already registered with the vision layer). */
  readonly layer: THREE.Group;
  update(slots: readonly BalloonSlot[], ropeY: number, ringMatrix: THREE.Matrix4, dt: number, time: number): void;
  /** A pop burst at slot k (weak pops burst on the layer only). */
  pop(slot: BalloonSlot, weak: boolean): void;
  readonly splash: Splash;
  setVisible(v: boolean): void;
  dispose(): void;
}

export function createBalloons(vision: VisionApi, slotCount: number, rand: () => number = Math.random): BalloonViews {
  const group = new THREE.Group();
  group.name = 'dinosumo-balloons';
  const balloonGeo = new THREE.SphereGeometry(1, 18, 12);
  const plainMat = new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0 });
  const plain = new THREE.InstancedMesh(balloonGeo, plainMat, slotCount);
  plain.name = 'dinosumo-plain-balloons';
  const stringGeo = new THREE.CylinderGeometry(0.012, 0.012, 1, 4);
  const stringMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const strings = new THREE.InstancedMesh(stringGeo, stringMat, slotCount);
  for (const m of [plain, strings]) {
    m.frustumCulled = false;
    m.castShadow = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(m);
  }
  const c = new THREE.Color();
  for (let i = 0; i < slotCount; i++) plain.setColorAt(i, c.set(PLAIN_COLOURS[i % PLAIN_COLOURS.length]));
  const dropMat = new THREE.MeshStandardMaterial({ color: 0xe8f8ff, roughness: 0.1, emissive: 0x335566 });
  const splash = new Splash(140, dropMat, rand);
  group.add(splash.mesh);

  // ── Weak-eye layer: one balloon + string + glow per slot, and a layer droplet burst ──
  const layer = new THREE.Group();
  layer.name = 'dinosumo-weak-balloons';
  const weakMat = createLayerMaterial(1);
  const weakStringMat = createLayerMaterial(0.85);
  const glowMat = createGlowMaterial({ level: 1, coreOpacity: 0.2, rimPower: 1.6, pulse: 0.4 });
  const weak: { balloon: THREE.Mesh; string: THREE.Mesh; glow: THREE.Mesh }[] = [];
  for (let i = 0; i < slotCount; i++) {
    const balloon = new THREE.Mesh(balloonGeo, weakMat);
    const glow = new THREE.Mesh(balloonGeo, glowMat);
    const string = new THREE.Mesh(stringGeo, weakStringMat);
    for (const m of [balloon, glow, string]) {
      m.visible = false;
      layer.add(m);
    }
    weak.push({ balloon, string, glow });
  }
  const weakSplash = new Splash(60, createLayerMaterial(1), rand);
  layer.add(weakSplash.mesh);
  vision.add(layer, VisionLayer.WeakOnly);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const ringPos = new THREE.Vector3();
  const ringQ = new THREE.Quaternion();
  const ringS = new THREE.Vector3();

  const place = (slot: BalloonSlot, i: number, ropeY: number, time: number): { y: number; sway: number } => {
    const g = slot.grow;
    // Lowered on its string from the rope with a little bounce.
    const ease = g < 1 ? 1 - Math.pow(1 - g, 3) + Math.sin(g * Math.PI) * 0.1 : 1;
    const y = ropeY - 0.15 - (ropeY - 0.15 - slot.y) * ease;
    const sway = Math.sin(time * 1.7 + i * 1.3) * 0.05;
    return { y, sway };
  };

  return {
    group,
    layer,
    splash,
    update(slots, ropeY, ringMatrix, dt, time) {
      // The layer group shares the ring's world transform, so ring-space positions work in it.
      ringMatrix.decompose(ringPos, ringQ, ringS);
      layer.position.copy(ringPos);
      layer.quaternion.copy(ringQ);
      layer.scale.copy(ringS);
      slots.forEach((slot, i) => {
        const w = weak[i];
        const { y, sway } = place(slot, i, ropeY, time);
        const grow = Math.min(1, 0.3 + slot.grow * 0.7);
        const bx = slot.x + sway;
        const bz = slot.z + sway * 0.6;
        const top = ropeY - 0.12;
        const strLen = Math.max(0.05, top - (y + BALLOON_S.y * grow));
        // String from the rope down to the balloon top.
        m.compose(p.set(slot.x + sway * 0.5, top - strLen / 2, slot.z + sway * 0.3), q.identity(), s.set(1, strLen, 1));
        if (slot.kind === 'plain') {
          strings.setMatrixAt(i, m);
          m.compose(p.set(bx, y, bz), q.identity(), s.copy(BALLOON_S).multiplyScalar(grow));
          plain.setMatrixAt(i, m);
        } else {
          strings.setMatrixAt(i, zero);
          plain.setMatrixAt(i, zero);
        }
        const isWeak = slot.kind === 'weak';
        w.balloon.visible = w.string.visible = w.glow.visible = isWeak;
        if (isWeak) {
          w.string.position.set(slot.x + sway * 0.5, top - strLen / 2, slot.z + sway * 0.3);
          w.string.scale.set(1, strLen, 1);
          w.balloon.position.set(bx, y, bz);
          w.balloon.scale.copy(BALLOON_S).multiplyScalar(grow);
          w.glow.position.copy(w.balloon.position);
          w.glow.scale.copy(w.balloon.scale).multiplyScalar(1.35);
        }
      });
      plain.instanceMatrix.needsUpdate = true;
      strings.instanceMatrix.needsUpdate = true;
      if (plain.instanceColor) plain.instanceColor.needsUpdate = true;
      splash.update(dt);
      weakSplash.update(dt);
    },
    pop(slot, isWeak) {
      if (isWeak) weakSplash.burst(slot.x, slot.y, slot.z, 30, 3.6, 0.08);
      else splash.burst(slot.x, slot.y, slot.z, 26, 3, 0.07);
    },
    setVisible(v) {
      group.visible = v;
      layer.visible = v;
    },
    dispose() {
      vision.remove(layer);
      balloonGeo.dispose();
      plainMat.dispose();
      stringGeo.dispose();
      stringMat.dispose();
      dropMat.dispose();
      weakMat.dispose();
      weakStringMat.dispose();
      glowMat.dispose();
      splash.dispose();
      weakSplash.dispose();
    },
  };
}
