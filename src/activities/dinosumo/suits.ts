/**
 * Wobbly inflatable dinosaur suits for Dino Sumo, drawn for every dino at once: one instanced
 * sphere mesh (body, belly, neck, head, snout, eyes, arms and a five-piece tail) and one instanced
 * cone mesh (back spikes), plus instanced shadow proxies. The wearer's head pokes out of the top.
 * The tail is a lagging spring chain, so turns, bumps and tail swings fling it about.
 * Colours: mid-dark suits with a cream belly and bright spikes, so each dino reads against the
 * light mat in the red and the green channel alone.
 */
import * as THREE from 'three';
import { asShadowProxy } from '../../core/shadow-proxy';

export const SUIT_COLOURS = [0x45a83c, 0x6a4fc8, 0x2f7fd8, 0x1f8f86] as const;
const BELLY = 0xfff0c8;
const SPIKE = 0xffd83d;
const WHITE = 0xffffff;
const INK = 0x10142e;

interface Part {
  p: [number, number, number];
  s: [number, number, number];
  c: 'suit' | number;
}

const BODY: Part[] = [
  { p: [0, 0.8, -0.05], s: [0.62, 0.48, 0.7], c: 'suit' },
  { p: [0, 0.78, 0.33], s: [0.46, 0.38, 0.4], c: BELLY },
  { p: [0, 1.3, 0.5], s: [0.2, 0.38, 0.2], c: 'suit' },
  { p: [0, 1.78, 0.6], s: [0.32, 0.28, 0.36], c: 'suit' },
  { p: [0, 1.7, 0.9], s: [0.25, 0.18, 0.23], c: 'suit' },
  { p: [-0.15, 1.93, 0.74], s: [0.1, 0.1, 0.1], c: WHITE },
  { p: [0.15, 1.93, 0.74], s: [0.1, 0.1, 0.1], c: WHITE },
  { p: [-0.16, 1.94, 0.82], s: [0.05, 0.055, 0.04], c: INK },
  { p: [0.16, 1.94, 0.82], s: [0.05, 0.055, 0.04], c: INK },
  { p: [-0.5, 0.96, 0.38], s: [0.13, 0.11, 0.19], c: 'suit' },
  { p: [0.5, 0.96, 0.38], s: [0.13, 0.11, 0.19], c: 'suit' },
];
const TAIL_R = [0.34, 0.28, 0.22, 0.17, 0.13];
const TAIL_GAP = 0.36;
const TAIL_BASE: [number, number, number] = [0, 0.66, -0.66];
const SPIKES: [number, number, number, number][] = [
  // x, y, z, size on the body (the tail gets one per segment below)
  [0, 1.25, 0.12, 0.17],
  [0, 1.22, -0.28, 0.16],
  [0, 2.04, 0.5, 0.12],
];

export const SUIT_SPHERES = BODY.length + TAIL_R.length;
export const SUIT_CONES = SPIKES.length + 3;

export interface DinoPose {
  /** Ring-space position of the feet and facing (atan2(x, z)). */
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Extra visual spin (tail swing) and tumble (rolling out), radians. */
  spin: number;
  roll: number;
  rollX: number;
  rollZ: number;
  squash: number;
}

export interface SuitSet {
  readonly group: THREE.Group;
  /** Pose dino i and advance its tail chain. */
  set(i: number, pose: DinoPose, dt: number, time: number): void;
  setVisible(v: boolean): void;
  /** Ring-space tip of dino i's tail (for splash and pop effects). */
  tailTip(i: number, out: THREE.Vector3): THREE.Vector3;
  dispose(): void;
}

export function createSuits(count: number): SuitSet {
  const group = new THREE.Group();
  group.name = 'dino-suits';
  const sphereGeo = new THREE.SphereGeometry(1, 20, 14);
  const coneGeo = new THREE.ConeGeometry(1, 1.6, 8);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0 });
  const spheres = new THREE.InstancedMesh(sphereGeo, mat, count * SUIT_SPHERES);
  const cones = new THREE.InstancedMesh(coneGeo, mat, count * SUIT_CONES);
  const proxies = asShadowProxy(new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 6), undefined, count));
  spheres.name = 'dino-suit-spheres';
  cones.name = 'dino-suit-spikes';
  for (const m of [spheres, cones, proxies]) {
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(m);
  }
  spheres.castShadow = cones.castShadow = false;
  const col = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const suit = SUIT_COLOURS[i % SUIT_COLOURS.length];
    BODY.forEach((p, k) => spheres.setColorAt(i * SUIT_SPHERES + k, col.set(p.c === 'suit' ? suit : p.c)));
    TAIL_R.forEach((_r, k) => spheres.setColorAt(i * SUIT_SPHERES + BODY.length + k, col.set(k === TAIL_R.length - 1 ? SPIKE : suit)));
    for (let k = 0; k < SUIT_CONES; k++) cones.setColorAt(i * SUIT_CONES + k, col.set(SPIKE));
  }

  // Tail chain state per dino: yaw/pitch offsets per segment and their velocities.
  const tail = Array.from({ length: count }, () => ({
    yaw: new Float32Array(TAIL_R.length),
    yawV: new Float32Array(TAIL_R.length),
    lastYaw: 0,
    init: false,
    tip: new THREE.Vector3(),
  }));
  const root = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const axis = new THREE.Vector3();
  const segPos = new THREE.Vector3();
  const segDir = new THREE.Vector3();
  const drop = new THREE.Matrix4().makeTranslation(0, -0.8, 0);

  return {
    group,
    set(i, pose, dt, time) {
      const t = tail[i];
      const turn = pose.yaw + pose.spin;
      if (!t.init) {
        t.lastYaw = turn;
        t.init = true;
      }
      let dYaw = turn - t.lastYaw;
      dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
      t.lastYaw = turn;
      // Lagging chain: the base swings opposite to turning, each piece chases the one before.
      const rate = dt > 0 ? dYaw / dt : 0;
      for (let k = 0; k < TAIL_R.length; k++) {
        const wag = Math.sin(time * 5.5 - k * 0.8) * 0.12 * (1 + k * 0.25);
        const target = (k === 0 ? -rate * 0.12 : t.yaw[k - 1]) + wag;
        const stiff = 120 - k * 14;
        t.yawV[k] += ((target - t.yaw[k]) * stiff - t.yawV[k] * (9 - k)) * dt;
        t.yaw[k] = Math.max(-1.4, Math.min(1.4, t.yaw[k] + t.yawV[k] * dt));
      }

      // Root: feet at the pose, facing + spin, an optional tumble about a horizontal axis
      // through the body centre, and a squash/stretch.
      q.setFromAxisAngle(up, turn);
      if (pose.roll !== 0) {
        axis.set(pose.rollZ, 0, -pose.rollX).normalize();
        q2.setFromAxisAngle(axis, pose.roll);
        q.premultiply(q2);
      }
      const sq = Math.max(-0.3, Math.min(0.3, pose.squash));
      sc.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);
      // root = T(feet + centre) · R · S · T(−centre): tumble and squash about the belly.
      root.compose(v.set(pose.x, pose.y + 0.8, pose.z), q, sc).multiply(drop);

      BODY.forEach((p, k) => {
        local.compose(v.set(p.p[0], p.p[1], p.p[2]), q2.identity(), sc.set(p.s[0], p.s[1], p.s[2]));
        // Head and neck bob a little behind the body (delayed secondary motion).
        if (k >= 2 && k <= 8) local.elements[13] += Math.sin(time * 7 + i) * 0.025 - sq * 0.15;
        m.multiplyMatrices(root, local);
        spheres.setMatrixAt(i * SUIT_SPHERES + k, m);
      });
      // Tail segments along the chain.
      segPos.set(TAIL_BASE[0], TAIL_BASE[1], TAIL_BASE[2]);
      let yawAcc = 0;
      for (let k = 0; k < TAIL_R.length; k++) {
        yawAcc += t.yaw[k];
        segDir.set(Math.sin(yawAcc + Math.PI), -0.16 - k * 0.04, Math.cos(yawAcc + Math.PI)).normalize();
        if (k > 0) segPos.addScaledVector(segDir, TAIL_GAP);
        const r = TAIL_R[k];
        local.compose(segPos, q2.identity(), sc.set(r, r * 0.9, r * 1.25));
        m.multiplyMatrices(root, local);
        spheres.setMatrixAt(i * SUIT_SPHERES + BODY.length + k, m);
        if (k === TAIL_R.length - 1) t.tip.copy(segPos).applyMatrix4(root);
        // A spike on the first three tail pieces.
        if (k < 3) {
          local.compose(v.set(segPos.x, segPos.y + r * 0.85, segPos.z), q2.identity(), sc.set(r * 0.42, r * 0.42, r * 0.42));
          m.multiplyMatrices(root, local);
          cones.setMatrixAt(i * SUIT_CONES + SPIKES.length + k, m);
        }
      }
      SPIKES.forEach((s, k) => {
        local.compose(v.set(s[0], s[1], s[2]), q2.identity(), sc.set(s[3], s[3], s[3]));
        m.multiplyMatrices(root, local);
        cones.setMatrixAt(i * SUIT_CONES + k, m);
      });
      local.compose(v.set(0, 0.8, -0.1), q2.identity(), sc.set(0.7, 0.6, 0.85));
      m.multiplyMatrices(root, local);
      proxies.setMatrixAt(i, m);
      spheres.instanceMatrix.needsUpdate = true;
      cones.instanceMatrix.needsUpdate = true;
      proxies.instanceMatrix.needsUpdate = true;
      if (spheres.instanceColor) spheres.instanceColor.needsUpdate = true;
      if (cones.instanceColor) cones.instanceColor.needsUpdate = true;
    },
    setVisible(vis) {
      group.visible = vis;
    },
    tailTip(i, out) {
      return out.copy(tail[i].tip);
    },
    dispose() {
      sphereGeo.dispose();
      coneGeo.dispose();
      mat.dispose();
      proxies.geometry.dispose();
    },
  };
}
