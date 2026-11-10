/**
 * Everything the sky contest puts in the sky: the course, striped hoops, cloud-balloons, bullseye
 * rafts and the giant inflatable duck (both eyes), plus the glasses twist on the weak-eye layer:
 * bonus hoops, golden cloud-balloons and the best flight line. Built lazily on the first contest
 * and hidden between contests (no draws when idle).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { VisionLayer } from '../../types';
import type { GameContext } from '../../types';
import { finish, finishMaterial, mergeFinished, placed } from '../../core/vertex-finish';
import { segmentSphereHit } from '../gemLogic';
import { CONTEST, raftPoints, throughHoop } from './contestLogic';
import { createCourse, offsetAt } from './course';
import type { Course } from './course';
import type { V3 } from './flightModel';
import { outlineGeometry } from './planeModel';
import { Puffs, CONFETTI_COLORS } from './fx';

/** Course control points (x, z, clearance above the ground, lowest absolute y). */
export const COURSE_POINTS: readonly (readonly [number, number, number, number])[] = [
  [86, 104, 20, 22], // over the airstrip, heading east
  [108, 112, 14, 16], // low over the bay: rafts and the duck
  [128, 92, 14, 16],
  [142, 62, 16, 18],
  [138, 30, 24, 26],
  [118, 4, 26, 34],
  [92, -10, 24, 42],
  [64, 4, 24, 42],
  [46, 34, 22, 40],
  [50, 68, 22, 34],
  [64, 94, 22, 28],
];

/** Raft and duck spots (on the sea next to the low part of the course). */
export const RAFT_SPOTS: readonly (readonly [number, number])[] = [
  [112, 121],
  [136, 97],
  [150, 64],
];
export const DUCK_SPOT = [124, 108] as const;

export const HOOP_COUNT = 10;
const BONUS_COUNT = 4;
const CLOUD_COUNT = 10;
const GOLDEN_COUNT = 4;
const HOOP_R = 4.4;

export interface HoopItem {
  pos: THREE.Vector3;
  normal: THREE.Vector3;
  s: number;
  /** Seconds until it can score again (0 = armed). */
  cool: number;
  flash: number;
}

export interface BalloonItem {
  pos: THREE.Vector3;
  /** Seconds until it is back (0 = there). */
  gone: number;
  pop: number;
}

export interface Raft {
  x: number;
  z: number;
  y: number;
  wobble: number;
}

export type ScoreKind = 'hoop' | 'bonusHoop' | 'cloud' | 'golden' | 'raft' | 'duck';

export interface ContestScene {
  readonly course: Course;
  readonly hoops: HoopItem[];
  readonly bonus: HoopItem[];
  readonly clouds: BalloonItem[];
  readonly golden: BalloonItem[];
  readonly rafts: Raft[];
  readonly duck: Raft;
  /** Arc length of hoop i (unwrapped for any i ≥ 0). */
  hoopS(i: number): number;
  setVisible(v: boolean): void;
  reset(): void;
  /** Pickups along the rider's chest segment this frame. Returns what scored. */
  collect(prev: V3, cur: V3): ScoreKind[];
  /** A water balloon that met a surface at (x, y, z): points and what it hit. */
  splash(x: number, y: number, z: number): { points: number; kind: 'raft' | 'duck' | 'miss' };
  /** Surface height of a raft/duck top at (x, z), or null. */
  targetTop(x: number, z: number): number | null;
  /** Aim marker under the plane (null hides it). */
  setAim(p: V3 | null): void;
  confettiAt(x: number, y: number, z: number, n?: number): void;
  readonly puffs: Puffs;
  update(dt: number, time: number): void;
  /** Weak-eye-only objects (tests). */
  readonly weakObjects: THREE.Object3D[];
  dispose(): void;
}

function stripedTorus(r: number, tube: number, a: number, b: number, segs = 16): THREE.BufferGeometry {
  // Alternate bright/dark segments so the hoop reads by brightness in either channel.
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < segs; i++) {
    const g = new THREE.TorusGeometry(r, tube, 8, 4, (Math.PI * 2) / segs);
    g.rotateZ((i / segs) * Math.PI * 2);
    parts.push(finish(g, { color: i % 2 ? a : b, rough: 0.45, metal: 0.05 }));
  }
  return mergeFinished(parts);
}

function cloudGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const blobs: [number, number, number, number][] = [
    [0, 0, 0, 1.3],
    [1.1, -0.2, 0.1, 0.95],
    [-1.1, -0.15, -0.1, 1.0],
    [0.4, 0.75, 0.2, 0.85],
    [-0.4, 0.6, -0.25, 0.8],
  ];
  for (const [x, y, z, r] of blobs) parts.push(placed(new THREE.SphereGeometry(r, 12, 9), x, y, z).toNonIndexed());
  for (const p of parts) p.deleteAttribute('uv');
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return g ?? new THREE.SphereGeometry(1.3);
}

function duckGeometry(): THREE.BufferGeometry {
  const yellow = { color: 0xffd23a, rough: 0.35, metal: 0.02 };
  const p: THREE.BufferGeometry[] = [];
  p.push(finish(new THREE.SphereGeometry(3, 20, 14).scale(1.25, 0.8, 1.5).translate(0, 1.6, 0), yellow));
  p.push(finish(new THREE.SphereGeometry(2, 18, 12).translate(0, 4.6, 2.1), yellow));
  p.push(finish(new THREE.SphereGeometry(1, 14, 8).scale(1.3, 0.45, 1.3).translate(0, 4.2, 3.9), { color: 0xff8a1a, rough: 0.4, metal: 0 }));
  p.push(finish(new THREE.ConeGeometry(1.1, 2.2, 10).rotateX(-1.1).translate(0, 3.3, -4.2), yellow));
  for (const s of [-1, 1]) {
    p.push(finish(new THREE.SphereGeometry(0.42, 12, 8).translate(s * 0.95, 5.2, 3.45), { color: 0xffffff, rough: 0.2, metal: 0 }));
    p.push(finish(new THREE.SphereGeometry(0.24, 10, 6).translate(s * 1.05, 5.25, 3.78), { color: 0x101018, rough: 0.2, metal: 0 }));
    p.push(finish(new THREE.SphereGeometry(1.2, 12, 8).scale(0.4, 0.7, 1.2).translate(s * 3.4, 1.9, -0.2), yellow));
  }
  return mergeFinished(p);
}

function raftGeometry(): THREE.BufferGeometry {
  // A round float with bullseye rings (white / navy) and a striped bumper tube.
  const p: THREE.BufferGeometry[] = [];
  const rings = CONTEST.raftRings;
  const cols = [0xffffff, 0x1d2a5c, 0xffffff];
  for (let i = rings.length - 1; i >= 0; i--) {
    p.push(finish(new THREE.CylinderGeometry(rings[i], rings[i], 0.5 + (rings.length - i) * 0.02, 28).translate(0, 0.25 + (rings.length - i) * 0.01, 0), { color: cols[i], rough: 0.5, metal: 0 }));
  }
  p.push(finish(new THREE.CylinderGeometry(0.9, 0.9, 0.58, 18).translate(0, 0.29, 0), { color: 0xff5a5a, rough: 0.45, metal: 0 }));
  for (let k = 0; k < 12; k++) {
    const g = new THREE.TorusGeometry(rings[2] + 0.2, 0.45, 8, 4, (Math.PI * 2) / 12);
    g.rotateZ((k / 12) * Math.PI * 2);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0.3, 0);
    p.push(finish(g, { color: k % 2 ? 0xffd23a : 0x1d2a5c, rough: 0.5, metal: 0 }));
  }
  return mergeFinished(p);
}

function chevronGeometry(): THREE.BufferGeometry {
  // A flat arrow pointing +Z, for the best flight line.
  const s = new THREE.Shape();
  s.moveTo(0, 1.1);
  s.lineTo(1.0, -0.2);
  s.lineTo(0.55, -0.2);
  s.lineTo(0, 0.45);
  s.lineTo(-0.55, -0.2);
  s.lineTo(-1.0, -0.2);
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  g.rotateX(-Math.PI / 2);
  // ShapeGeometry is in XY; after rotateX(-90°) "up" (+Y) became -Z: flip so the tip points +Z.
  g.rotateY(Math.PI);
  return g;
}

/** Grey-level vertex colours for weak-layer objects (only luminance matters there). */
function greyStripes(g: THREE.BufferGeometry, a: number, b: number, seg: number): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  const pos = n.getAttribute('position');
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const ang = Math.atan2(pos.getY(i), pos.getX(i));
    const k = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * seg) % 2;
    const v = k ? a : b;
    col.set([v, v, v], i * 3);
  }
  n.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return n;
}

export function createContestScene(ctx: GameContext): ContestScene {
  const w = ctx.world;
  const control = COURSE_POINTS.map(([x, z, clear, minY]) => ({ x, y: Math.max(Math.max(w.heightAt(x, z), w.waterLevel) + clear, minY), z }));
  const course = createCourse(control, 20);
  const L = course.length;
  const hoopS = (i: number): number => ((i % HOOP_COUNT) + 0.5) * (L / HOOP_COUNT) + Math.floor(i / HOOP_COUNT) * L;

  const both = new THREE.Group();
  both.name = 'sky-contest';
  ctx.scene.add(both);
  const weak = new THREE.Group();
  weak.name = 'sky-contest-weak';
  ctx.vision.add(weak, VisionLayer.WeakOnly);

  const mat = finishMaterial('skyrides-contest');
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x05060c, side: THREE.BackSide });
  const dummy = new THREE.Object3D();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const tan = { x: 0, y: 0, z: 1 };
  const tmp = { x: 0, y: 0, z: 0 };

  // ── Hoops (both eyes) ──
  const hoopGeo = stripedTorus(HOOP_R, 0.42, 0xffd23a, 0x1d2a5c);
  const hoopMesh = new THREE.InstancedMesh(hoopGeo, mat, HOOP_COUNT);
  const hoops: HoopItem[] = [];
  for (let i = 0; i < HOOP_COUNT; i++) {
    const s = hoopS(i);
    const p = course.at(s, { x: 0, y: 0, z: 0 });
    course.tangent(s, tan);
    hoops.push({ pos: new THREE.Vector3(p.x, p.y, p.z), normal: new THREE.Vector3(tan.x, tan.y, tan.z), s, cool: 0, flash: 0 });
  }

  // ── Bonus hoops (weak eye only): beside and above the line, between the normal hoops ──
  const bonusGeo = greyStripes(new THREE.TorusGeometry(HOOP_R * 0.85, 0.38, 8, 32), 1, 0.45, 12);
  const bonusMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const bonusMesh = new THREE.InstancedMesh(bonusGeo, bonusMat, BONUS_COUNT);
  const bonus: HoopItem[] = [];
  for (let i = 0; i < BONUS_COUNT; i++) {
    const s = (i + 0.02) * (L / BONUS_COUNT) + L / HOOP_COUNT;
    const p = offsetAt(course, s, i % 2 ? 9 : -9, 6, { x: 0, y: 0, z: 0 });
    course.tangent(s, tan);
    bonus.push({ pos: new THREE.Vector3(p.x, p.y, p.z), normal: new THREE.Vector3(tan.x, tan.y, tan.z), s, cool: 0, flash: 0 });
  }

  // ── Cloud-balloons (both eyes, dark outline) and golden ones (weak eye only) ──
  const cloudGeo = cloudGeometry();
  const cloudColored = finish(cloudGeo.clone(), { color: 0xffffff, rough: 0.8, metal: 0 });
  const cloudOutlineGeo = outlineGeometry(cloudColored, 0.12);
  const cloudMesh = new THREE.InstancedMesh(cloudColored, mat, CLOUD_COUNT);
  const cloudOutline = new THREE.InstancedMesh(cloudOutlineGeo, outlineMat, CLOUD_COUNT);
  const clouds: BalloonItem[] = [];
  for (let i = 0; i < CLOUD_COUNT; i++) {
    const s = (i + 0.78) * (L / CLOUD_COUNT);
    const p = offsetAt(course, s, i % 2 ? 3.5 : -3.5, (i % 3) - 1, { x: 0, y: 0, z: 0 });
    clouds.push({ pos: new THREE.Vector3(p.x, p.y, p.z), gone: 0, pop: 0 });
  }
  const goldGeo = cloudGeo.clone();
  {
    const pos = goldGeo.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      // Sparkly bands: bright with darker swirls, so the shape reads on the layer.
      const v = Math.sin(pos.getX(i) * 3 + pos.getY(i) * 4) > 0.55 ? 0.45 : 1;
      col.set([v, v, v], i * 3);
    }
    goldGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  const goldMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const goldMesh = new THREE.InstancedMesh(goldGeo, goldMat, GOLDEN_COUNT);
  const golden: BalloonItem[] = [];
  for (let i = 0; i < GOLDEN_COUNT; i++) {
    const s = (i + 0.55) * (L / GOLDEN_COUNT);
    const p = offsetAt(course, s, i % 2 ? -10 : 10, 3, { x: 0, y: 0, z: 0 });
    golden.push({ pos: new THREE.Vector3(p.x, p.y, p.z), gone: 0, pop: 0 });
  }

  // ── Best flight line (weak eye only): chevrons along the course ──
  const chevGeo = greyStripes(chevronGeometry(), 0.85, 0.85, 1);
  const chevMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.85, depthWrite: false });
  const chevCount = Math.floor(L / 9);
  const chevMesh = new THREE.InstancedMesh(chevGeo, chevMat, chevCount);
  for (let i = 0; i < chevCount; i++) {
    const s = i * 9;
    course.at(s, tmp);
    course.tangent(s, tan);
    dummy.position.set(tmp.x, tmp.y - 1.6, tmp.z);
    dummy.rotation.set(0, Math.atan2(tan.x, tan.z), 0, 'YXZ');
    dummy.rotateX(-Math.asin(Math.max(-1, Math.min(1, tan.y))));
    dummy.scale.setScalar(1.4);
    dummy.updateMatrix();
    chevMesh.setMatrixAt(i, dummy.matrix);
  }

  // ── Rafts and the duck (both eyes) ──
  const rafts: Raft[] = RAFT_SPOTS.map(([x, z], i) => ({ x, z, y: Math.max(w.heightAt(x, z), w.waterLevel), wobble: i * 1.7 }));
  const raftGeo = raftGeometry();
  const raftMesh = new THREE.InstancedMesh(raftGeo, mat, rafts.length);
  const duck: Raft = { x: DUCK_SPOT[0], z: DUCK_SPOT[1], y: Math.max(w.heightAt(DUCK_SPOT[0], DUCK_SPOT[1]), w.waterLevel), wobble: 0 };
  const duckGeo = duckGeometry();
  const duckMesh = new THREE.Mesh(duckGeo, mat);
  const duckOutlineGeo = outlineGeometry(duckGeo, 0.12);
  const duckOutline = new THREE.Mesh(duckOutlineGeo, outlineMat);
  const duckGroup = new THREE.Group();
  duckGroup.add(duckMesh, duckOutline);
  duckGroup.position.set(duck.x, duck.y - 0.3, duck.z);
  duckGroup.rotation.y = 2.2;
  let duckSquash = 0;

  // ── Aim marker under the plane ──
  const aimGeo = stripedTorus(2.2, 0.22, 0xffffff, 0x10142a, 12);
  aimGeo.rotateX(Math.PI / 2);
  const aim = new THREE.Mesh(aimGeo, mat);
  aim.visible = false;

  // ── Effects ──
  const puffMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  const puffGeo = new THREE.IcosahedronGeometry(1, 0);
  const puffs = new Puffs({ max: 140, geometry: puffGeo, material: puffMat, gravity: -0.4, drag: 1.2 });
  const confettiGeo = new THREE.PlaneGeometry(0.35, 0.22);
  const confettiMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const confetti = new Puffs({ max: 90, geometry: confettiGeo, material: confettiMat, gravity: 6, drag: 1.5 });
  const weakSparkGeo = new THREE.OctahedronGeometry(0.5);
  const weakSparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const weakSparks = new Puffs({ max: 48, geometry: weakSparkGeo, material: weakSparkMat, gravity: 3, drag: 1 });

  for (const m of [hoopMesh, cloudMesh, raftMesh]) m.receiveShadow = false;
  for (const m of [hoopMesh, cloudMesh, cloudOutline, raftMesh, bonusMesh, goldMesh, chevMesh]) {
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  both.add(hoopMesh, cloudMesh, cloudOutline, raftMesh, duckGroup, aim, puffs.mesh, confetti.mesh);
  weak.add(bonusMesh, goldMesh, chevMesh, weakSparks.mesh);
  both.visible = false;
  weak.visible = false;

  const place = (mesh: THREE.InstancedMesh, i: number, p: THREE.Vector3, normal: THREE.Vector3 | null, scale: number, spin = 0): void => {
    dummy.position.copy(p);
    if (normal) {
      dummy.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      if (spin) dummy.rotateZ(spin);
    } else {
      dummy.rotation.set(0, spin, 0);
    }
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  };

  const hoopColor = new THREE.Color();
  const reset = (): void => {
    for (const h of hoops) {
      h.cool = 0;
      h.flash = 0;
    }
    for (const h of bonus) {
      h.cool = 0;
      h.flash = 0;
    }
    for (const c of clouds) {
      c.gone = 0;
      c.pop = 0;
    }
    for (const c of golden) {
      c.gone = 0;
      c.pop = 0;
    }
    puffs.clear();
    confetti.clear();
    weakSparks.clear();
  };

  const scene: ContestScene = {
    course,
    hoops,
    bonus,
    clouds,
    golden,
    rafts,
    duck,
    puffs,
    hoopS,
    weakObjects: [bonusMesh, goldMesh, chevMesh, weakSparks.mesh],
    setVisible(v) {
      both.visible = v;
      weak.visible = v;
    },
    reset,
    collect(prev, cur) {
      const got: ScoreKind[] = [];
      for (const h of hoops) {
        if (h.cool > 0) continue;
        if (throughHoop(prev, cur, h.pos, h.normal, CONTEST.hoopRadius)) {
          h.cool = CONTEST.hoopRearm;
          h.flash = 1;
          got.push('hoop');
        }
      }
      for (const h of bonus) {
        if (h.cool > 0) continue;
        if (throughHoop(prev, cur, h.pos, h.normal, CONTEST.hoopRadius)) {
          h.cool = CONTEST.hoopRearm * 2;
          h.flash = 1;
          weakSparks.burst(h.pos.x, h.pos.y, h.pos.z, 12, 9, 0.7, 0.45);
          got.push('bonusHoop');
        }
      }
      for (const c of clouds) {
        if (c.gone > 0) continue;
        if (segmentSphereHit(prev, cur, c.pos, CONTEST.cloudRadius)) {
          c.gone = CONTEST.cloudRespawn;
          c.pop = 1;
          puffs.burst(c.pos.x, c.pos.y, c.pos.z, 10, 8, 0.8, 0.9);
          confetti.burst(c.pos.x, c.pos.y, c.pos.z, 14, 10, 1.2, 1, CONFETTI_COLORS);
          got.push('cloud');
        }
      }
      for (const c of golden) {
        if (c.gone > 0) continue;
        if (segmentSphereHit(prev, cur, c.pos, CONTEST.cloudRadius)) {
          c.gone = CONTEST.cloudRespawn * 1.5;
          c.pop = 1;
          weakSparks.burst(c.pos.x, c.pos.y, c.pos.z, 16, 10, 0.8, 0.5);
          got.push('golden');
        }
      }
      return got;
    },
    targetTop(x, z) {
      for (const r of rafts) if (Math.hypot(x - r.x, z - r.z) <= CONTEST.raftRings[2] + 0.6) return r.y + 0.55;
      if (Math.hypot(x - duck.x, z - duck.z) <= CONTEST.duckRadius) return duck.y + 3.2;
      return null;
    },
    splash(x, y, z) {
      if (Math.hypot(x - duck.x, z - duck.z) <= CONTEST.duckRadius) {
        duckSquash = 1;
        confetti.burst(x, y + 1, z, 20, 9, 1.3, 1, CONFETTI_COLORS);
        puffs.burst(x, y, z, 10, 6, 0.9, 1.1);
        return { points: CONTEST.points.duck, kind: 'duck' };
      }
      for (const r of rafts) {
        const pts = raftPoints(x, z, r.x, r.z);
        if (pts > 0) {
          r.wobble += 3;
          puffs.burst(x, y + 0.4, z, 12, 6, 0.9, 1.0);
          if (pts === 3) confetti.burst(x, y + 1, z, 16, 8, 1.2, 1, CONFETTI_COLORS);
          return { points: pts, kind: 'raft' };
        }
      }
      puffs.burst(x, y + 0.2, z, 8, 5, 0.8, 0.9);
      return { points: 0, kind: 'miss' };
    },
    setAim(p) {
      aim.visible = !!p;
      if (p) aim.position.set(p.x, p.y + 0.25, p.z);
    },
    confettiAt(x, y, z, n = 18) {
      confetti.burst(x, y, z, n, 7, 1.2, 1, CONFETTI_COLORS);
    },
    update(dt, time) {
      for (let i = 0; i < hoops.length; i++) {
        const h = hoops[i];
        h.cool = Math.max(0, h.cool - dt);
        h.flash = Math.max(0, h.flash - dt * 2.5);
        const pulse = 1 + h.flash * 0.35 + Math.sin(time * 2 + i) * 0.02;
        place(hoopMesh, i, h.pos, h.normal, h.cool > 0 && h.flash <= 0 ? 0.72 : pulse, time * 0.4 + i);
        hoopColor.setScalar(h.cool > 0 ? 0.45 : 1);
        hoopMesh.setColorAt(i, hoopColor);
      }
      if (hoopMesh.instanceColor) hoopMesh.instanceColor.needsUpdate = true;
      hoopMesh.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < bonus.length; i++) {
        const h = bonus[i];
        h.cool = Math.max(0, h.cool - dt);
        h.flash = Math.max(0, h.flash - dt * 2.5);
        if (h.cool > 0 && h.flash <= 0) bonusMesh.setMatrixAt(i, zero);
        else place(bonusMesh, i, h.pos, h.normal, 1 + h.flash * 0.4 + Math.sin(time * 3 + i) * 0.05, -time * 0.8);
      }
      bonusMesh.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < clouds.length; i++) {
        const c = clouds[i];
        c.gone = Math.max(0, c.gone - dt);
        if (c.gone > 0) {
          cloudMesh.setMatrixAt(i, zero);
          cloudOutline.setMatrixAt(i, zero);
          continue;
        }
        const bob = Math.sin(time * 1.3 + i * 2.1) * 0.35;
        dummy.position.set(c.pos.x, c.pos.y + bob, c.pos.z);
        dummy.rotation.set(0, i * 1.3 + time * 0.1, Math.sin(time + i) * 0.05);
        dummy.scale.setScalar(1 + Math.sin(time * 2.2 + i) * 0.03);
        dummy.updateMatrix();
        cloudMesh.setMatrixAt(i, dummy.matrix);
        cloudOutline.setMatrixAt(i, dummy.matrix);
      }
      cloudMesh.instanceMatrix.needsUpdate = true;
      cloudOutline.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < golden.length; i++) {
        const c = golden[i];
        c.gone = Math.max(0, c.gone - dt);
        if (c.gone > 0) {
          goldMesh.setMatrixAt(i, zero);
          continue;
        }
        dummy.position.set(c.pos.x, c.pos.y + Math.sin(time * 1.6 + i) * 0.4, c.pos.z);
        dummy.rotation.set(0, time * 0.5 + i, 0);
        dummy.scale.setScalar(0.95 + Math.sin(time * 3 + i) * 0.05);
        dummy.updateMatrix();
        goldMesh.setMatrixAt(i, dummy.matrix);
      }
      goldMesh.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < rafts.length; i++) {
        const r = rafts[i];
        r.wobble = Math.max(0, r.wobble - dt * 2);
        dummy.position.set(r.x, r.y + Math.sin(time * 1.4 + i) * 0.08, r.z);
        dummy.rotation.set(Math.sin(time * 1.1 + i) * 0.03 + Math.sin(time * 9) * 0.02 * r.wobble, i, Math.cos(time * 0.9 + i) * 0.03);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        raftMesh.setMatrixAt(i, dummy.matrix);
      }
      raftMesh.instanceMatrix.needsUpdate = true;
      duckSquash = Math.max(0, duckSquash - dt * 1.5);
      const sq = Math.sin(time * 14) * duckSquash * 0.15;
      duckGroup.scale.set(1 + sq, 1 - sq, 1 + sq);
      duckGroup.position.y = duck.y - 0.3 + Math.sin(time * 1.2) * 0.12;
      duckGroup.rotation.z = Math.sin(time * 0.9) * 0.04;
      aim.rotation.y = time;
      puffs.update(dt);
      confetti.update(dt);
      weakSparks.update(dt);
    },
    dispose() {
      both.removeFromParent();
      ctx.vision.remove(weak);
      for (const g of [hoopGeo, bonusGeo, cloudGeo, cloudColored, cloudOutlineGeo, goldGeo, chevGeo, raftGeo, duckGeo, duckOutlineGeo, aimGeo, puffGeo, confettiGeo, weakSparkGeo]) g.dispose();
      for (const m of [mat, outlineMat, bonusMat, goldMat, chevMat, puffMat, confettiMat, weakSparkMat]) m.dispose();
      for (const m of [hoopMesh, bonusMesh, cloudMesh, cloudOutline, goldMesh, chevMesh, raftMesh]) m.dispose();
      puffs.dispose();
      confetti.dispose();
      weakSparks.dispose();
    },
  };
  reset();
  return scene;
}
