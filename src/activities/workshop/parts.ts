/**
 * The silly buggy add-ons, modelled procedurally in buggy body space (+Z forward, +Y up, +X left;
 * see car-sim). Each part is one merged mesh with per-vertex finishes (one draw), casts no shadow,
 * and reads by brightness in R-only and G-only (bright faces with near-black outlines/rings).
 * Monster wheels are not a mesh: they scale the stock wheels (`BuggyHooks.setTuning`).
 */
import * as THREE from 'three';
import { finish, finishMaterial, mergeFinished, placed, rodBetween, type Finish } from '../../core/vertex-finish';
import type { UpgradeId } from './upgrades';

const WHITE: Finish = { color: 0xf4f2ec, rough: 0.35, metal: 0 };
const INK: Finish = { color: 0x1d1f24, rough: 0.6, metal: 0.1 };
const STEEL: Finish = { color: 0xd8dde3, rough: 0.22, metal: 1 };
const BRASS: Finish = { color: 0xffd24a, rough: 0.25, metal: 0.9 };
const DUCK: Finish = { color: 0xffd629, rough: 0.45, metal: 0 };
const BEAK: Finish = { color: 0xff8a1e, rough: 0.45, metal: 0 };
const PINK: Finish = { color: 0xff7eb6, rough: 0.4, metal: 0 };
const TEAL: Finish = { color: 0x7fe3ff, rough: 0.3, metal: 0.2 };
const FLAME: Finish = { color: 0xfff6d8, rough: 1, metal: 0, emissive: 0xffe6a0, glow: 2.4 };

/** Roof height of the roll cage (matches car-model CAGE_TOP closely enough for a perch). */
const ROOF_Y = 1.64;

export interface Part {
  readonly id: UpgradeId;
  readonly object: THREE.Object3D;
  /** Per-frame animation; `k` holds the shared live values. */
  update(dt: number, k: PartState): void;
  dispose(): void;
}

export interface PartState {
  time: number;
  /** Body acceleration along the nose / sideways (m/s², smoothed by the caller). */
  accelLong: number;
  accelLat: number;
  /** 0..1 rocket plume. */
  plume: number;
  /** Spring bumper squash impulse (set on a bump; decays here). */
  bumperKick: number;
  /** Horn toot impulse. */
  hornKick: number;
  /** Cannon recoil impulse. */
  cannonKick: number;
}

const mat = (): THREE.MeshStandardMaterial => finishMaterial('buggy-parts');

function meshOf(parts: THREE.BufferGeometry[], name: string, material: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(mergeFinished(parts), material);
  m.name = name;
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

/** Spring damper for wobbly secondary motion. */
class Wobble {
  x = 0;
  v = 0;
  step(target: number, dt: number, k = 90, c = 7): number {
    const n = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (k * (target - this.x) - c * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}

function springBumper(material: THREE.Material): Part {
  const root = new THREE.Group();
  root.position.set(0, -0.06, 2.0);
  // Coil: a helix tube along +Z, then a big round pad.
  const pts: THREE.Vector3[] = [];
  const turns = 5;
  for (let i = 0; i <= turns * 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * 0.16, Math.sin(a) * 0.16, (i / (turns * 16)) * 0.42));
  }
  const coil = mergeFinished([finish(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), turns * 16, 0.028, 6), STEEL)]);
  const coilMesh = new THREE.Mesh(coil, material);
  const padParts = [
    finish(placed(new THREE.CylinderGeometry(0.34, 0.34, 0.14, 24), 0, 0, 0.0, Math.PI / 2), INK),
    finish(placed(new THREE.CylinderGeometry(0.27, 0.27, 0.15, 24), 0, 0, 0.012, Math.PI / 2), WHITE),
    finish(placed(new THREE.CylinderGeometry(0.12, 0.12, 0.16, 16), 0, 0, 0.02, Math.PI / 2), PINK),
    finish(placed(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 10), 0, 0, -0.38, Math.PI / 2), INK),
  ];
  const pad = meshOf(padParts, 'bumper-pad', material);
  pad.position.z = 0.48;
  coilMesh.name = 'bumper-coil';
  root.add(coilMesh, pad);
  const w = new Wobble();
  return {
    id: 'springBumper',
    object: root,
    update(dt, k) {
      if (k.bumperKick > 0) {
        w.v -= k.bumperKick * 3;
        k.bumperKick = 0;
      }
      const s = 1 + w.step(0, dt, 160, 5);
      coilMesh.scale.z = Math.max(0.35, s);
      pad.position.z = 0.06 + 0.42 * Math.max(0.35, s);
    },
    dispose() {
      coil.dispose();
      pad.geometry.dispose();
    },
  };
}

function duckOrnament(material: THREE.Material): Part {
  const root = new THREE.Group();
  root.position.set(0, ROOF_Y, -0.36);
  const parts = [
    finish(placed(new THREE.SphereGeometry(0.2, 16, 12).scale(1, 0.78, 1.25), 0, 0.15, 0), DUCK),
    finish(placed(new THREE.SphereGeometry(0.13, 14, 10), 0, 0.37, 0.12), DUCK),
    finish(placed(new THREE.ConeGeometry(0.05, 0.14, 10).scale(1.6, 1, 0.7), 0, 0.35, 0.27, Math.PI / 2), BEAK),
    finish(placed(new THREE.SphereGeometry(0.035, 8, 6), 0.075, 0.41, 0.21), INK),
    finish(placed(new THREE.SphereGeometry(0.035, 8, 6), -0.075, 0.41, 0.21), INK),
    finish(placed(new THREE.ConeGeometry(0.08, 0.14, 10), 0, 0.22, -0.26, -1.0), DUCK),
    finish(placed(new THREE.CylinderGeometry(0.06, 0.08, 0.06, 10), 0, 0.02, 0), INK),
  ];
  const duck = meshOf(parts, 'roof-duck', material);
  root.add(duck);
  const pitch = new Wobble();
  const roll = new Wobble();
  return {
    id: 'duckOrnament',
    object: root,
    update(dt, k) {
      duck.rotation.x = pitch.step(THREE.MathUtils.clamp(-k.accelLong * 0.03, -0.6, 0.6), dt, 70, 3.5);
      duck.rotation.z = roll.step(THREE.MathUtils.clamp(k.accelLat * 0.03, -0.6, 0.6), dt, 70, 3.5);
    },
    dispose() {
      duck.geometry.dispose();
    },
  };
}

function musicalHorns(material: THREE.Material): Part {
  const root = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    const pts = [new THREE.Vector2(0.03, 0), new THREE.Vector2(0.035, 0.2), new THREE.Vector2(0.06, 0.32), new THREE.Vector2(0.15, 0.42), new THREE.Vector2(0.16, 0.43)];
    parts.push(finish(placed(new THREE.LatheGeometry(pts, 16), s * 0.47, 1.36, 0.02, Math.PI / 2, 0, 0), BRASS));
    parts.push(finish(placed(new THREE.TorusGeometry(0.155, 0.02, 6, 18), s * 0.47, 1.36, 0.45), INK));
    parts.push(finish(rodBetween(new THREE.Vector3(s * 0.47, 1.36, 0.06), new THREE.Vector3(s * 0.42, 1.52, -0.02), 0.02, 6), STEEL));
    // Squeeze bulb.
    parts.push(finish(placed(new THREE.SphereGeometry(0.075, 12, 8), s * 0.47, 1.36, -0.04), INK));
  }
  const horns = meshOf(parts, 'music-horns', material);
  root.add(horns);
  const w = new Wobble();
  return {
    id: 'musicalHorns',
    object: root,
    update(dt, k) {
      if (k.hornKick > 0) {
        w.v += k.hornKick * 2.5;
        k.hornKick = 0;
      }
      const s = 1 + w.step(0, dt, 180, 6) * 0.4;
      horns.scale.set(s, s, 1 / Math.max(0.6, s));
    },
    dispose() {
      horns.geometry.dispose();
    },
  };
}

function rocketBoost(material: THREE.Material): Part {
  const root = new THREE.Group();
  root.position.set(0, 1.0, -1.42);
  const parts = [
    finish(placed(new THREE.CylinderGeometry(0.17, 0.17, 0.8, 18), 0, 0, 0, Math.PI / 2), WHITE),
    finish(placed(new THREE.ConeGeometry(0.17, 0.32, 18), 0, 0, 0.56, Math.PI / 2), PINK),
    finish(placed(new THREE.CylinderGeometry(0.175, 0.175, 0.08, 18), 0, 0, 0.18, Math.PI / 2), INK),
    finish(placed(new THREE.CylinderGeometry(0.175, 0.175, 0.08, 18), 0, 0, -0.14, Math.PI / 2), INK),
    finish(placed(new THREE.CylinderGeometry(0.13, 0.18, 0.18, 16, 1, true), 0, 0, -0.48, Math.PI / 2), INK),
    // Fins.
    ...[0, 1, 2, 3].map((i) => finish(placed(new THREE.BoxGeometry(0.025, 0.16, 0.3).translate(0, 0.22, 0), 0, 0, -0.26, 0, 0, (i * Math.PI) / 2 + Math.PI / 4), PINK)),
    // Mount struts down to the deck.
    finish(rodBetween(new THREE.Vector3(0.12, -0.1, 0.1), new THREE.Vector3(0.22, -0.42, 0.3), 0.025, 6), STEEL),
    finish(rodBetween(new THREE.Vector3(-0.12, -0.1, 0.1), new THREE.Vector3(-0.22, -0.42, 0.3), 0.025, 6), STEEL),
  ];
  const rocket = meshOf(parts, 'rocket-booster', material);
  // Plume: soft bright sparkle cone (visual juice, never aimed at anything).
  const plumeMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const plumeG = mergeFinished([finish(placed(new THREE.ConeGeometry(0.16, 1, 14, 1, true).translate(0, 0.5, 0), 0, 0, 0, -Math.PI / 2), FLAME)]);
  const plume = new THREE.Mesh(plumeG, plumeMat);
  plume.name = 'rocket-plume';
  plume.position.z = -0.56;
  plume.visible = false;
  root.add(rocket, plume);
  return {
    id: 'rocketBoost',
    object: root,
    update(_dt, k) {
      plume.visible = k.plume > 0.02;
      if (plume.visible) {
        const flick = 0.85 + 0.15 * Math.sin(k.time * 47) + 0.1 * Math.sin(k.time * 31);
        plume.scale.set(0.8 + k.plume * 0.6, 0.8 + k.plume * 0.6, (0.4 + k.plume * 1.6) * flick);
        plumeMat.opacity = 0.5 + 0.4 * k.plume;
      }
    },
    dispose() {
      rocket.geometry.dispose();
      plumeG.dispose();
      plumeMat.dispose();
    },
  };
}

function bubbleExhaust(material: THREE.Material): Part {
  const root = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) {
    // A bubble wand ring on each exhaust tip and a little soap tank on the deck.
    parts.push(finish(placed(new THREE.TorusGeometry(0.11, 0.022, 8, 20), s * 0.34, 0.72, -1.95), TEAL));
    parts.push(finish(placed(new THREE.TorusGeometry(0.075, 0.012, 6, 16), s * 0.34, 0.72, -1.95), INK));
  }
  parts.push(finish(placed(new THREE.CylinderGeometry(0.13, 0.13, 0.42, 16), 0, 0.62, -1.48, 0, 0, Math.PI / 2), TEAL));
  parts.push(finish(placed(new THREE.CylinderGeometry(0.135, 0.135, 0.06, 16), 0.12, 0.62, -1.48, 0, 0, Math.PI / 2), INK));
  parts.push(finish(placed(new THREE.CylinderGeometry(0.135, 0.135, 0.06, 16), -0.12, 0.62, -1.48, 0, 0, Math.PI / 2), INK));
  const m = meshOf(parts, 'bubble-pipes', material);
  root.add(m);
  return {
    id: 'bubbleExhaust',
    object: root,
    update() {},
    dispose() {
      m.geometry.dispose();
    },
  };
}

function confettiCannon(material: THREE.Material): Part {
  const root = new THREE.Group();
  root.position.set(-0.52, 0.78, -1.3);
  const barrel = new THREE.Group();
  barrel.rotation.x = -0.75; // muzzle up and back
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    parts.push(finish(placed(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 16), 0, 0.05 + i * 0.1, 0), i % 2 ? INK : WHITE));
  }
  parts.push(finish(placed(new THREE.TorusGeometry(0.125, 0.03, 8, 18), 0, 0.42, 0, Math.PI / 2), PINK));
  parts.push(finish(placed(new THREE.SphereGeometry(0.13, 12, 8), 0, 0, 0), INK));
  const tube = meshOf(parts, 'confetti-cannon', material);
  barrel.add(tube);
  root.add(barrel);
  const w = new Wobble();
  return {
    id: 'confettiCannon',
    object: root,
    update(dt, k) {
      if (k.cannonKick > 0) {
        w.v -= k.cannonKick * 4;
        k.cannonKick = 0;
      }
      tube.position.y = w.step(0, dt, 150, 8) * 0.12;
    },
    dispose() {
      tube.geometry.dispose();
    },
  };
}

/** Where the cannon's muzzle is, in body space (for confetti bursts). */
export const CANNON_MUZZLE = new THREE.Vector3(-0.52, 0.78 + Math.cos(0.75) * 0.42, -1.3 - Math.sin(0.75) * 0.42);
/** Exhaust tips in body space (bubble spawn points). */
export const EXHAUST_TIPS = [new THREE.Vector3(0.34, 0.72, -1.98), new THREE.Vector3(-0.34, 0.72, -1.98)];

export interface PartKit {
  build(id: UpgradeId): Part | null;
  dispose(): void;
}

export function createPartKit(): PartKit {
  const material = mat();
  return {
    build(id) {
      switch (id) {
        case 'springBumper':
          return springBumper(material);
        case 'duckOrnament':
          return duckOrnament(material);
        case 'musicalHorns':
          return musicalHorns(material);
        case 'rocketBoost':
          return rocketBoost(material);
        case 'bubbleExhaust':
          return bubbleExhaust(material);
        case 'confettiCannon':
          return confettiCannon(material);
        default:
          return null; // monster wheels: tuning only
      }
    },
    dispose() {
      material.dispose();
    },
  };
}
