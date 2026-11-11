/**
 * The secret topping of the day: visible ONLY to the weak eye (VisionLayer.WeakOnly, brightness-only
 * layer materials). It peeks out of one of the three identical shelf jars, bobbing and sparkling;
 * when the player picks a wrong jar it hops to another one; once found it rides on top of the cone
 * (still weak-eye-only). Nothing about it is in the main scene, the HUD or positional audio.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { VisionLayer } from '../../types';
import type { GameContext } from '../../types';
import { createGlowMaterial, createLayerMaterial } from '../../vision';
import type { SecretId } from './logic';

function starShape(points: number, outer: number, inner: number): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i <= points * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  return s;
}

/** The day's treat, about 0.2 m tall, centred on the origin. */
function buildTreat(id: SecretId, bright: THREE.Material, dark: THREE.Material): THREE.Group {
  // Parts are baked into one mesh per material (2 draws for the whole treat).
  const g = new THREE.Group();
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const tmp = new THREE.Object3D();
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, rz = 0, ry = 0): void => {
    tmp.position.set(x, y, z);
    tmp.rotation.set(rx, ry, rz);
    tmp.updateMatrix();
    const flat = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    flat.applyMatrix4(tmp.matrix);
    for (const k of Object.keys(flat.attributes)) if (k !== 'position' && k !== 'normal') flat.deleteAttribute(k);
    let list = parts.get(mat);
    if (!list) parts.set(mat, (list = []));
    list.push(flat);
  };
  switch (id) {
    case 'starCandy': {
      const geo = new THREE.ExtrudeGeometry(starShape(5, 0.13, 0.06), { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 1 });
      geo.center();
      add(geo, bright);
      add(new THREE.SphereGeometry(0.03, 8, 6), dark, -0.035, 0.02, 0.04);
      add(new THREE.SphereGeometry(0.03, 8, 6), dark, 0.035, 0.02, 0.04);
      break;
    }
    case 'goldCherry':
      add(new THREE.SphereGeometry(0.1, 16, 12), bright, 0, -0.02, 0);
      add(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), dark, 0.03, 0.12, 0, 0, -0.35);
      add(new THREE.SphereGeometry(0.035, 8, 6), bright, 0.06, 0.2, 0);
      break;
    case 'glowBear':
      add(new THREE.SphereGeometry(0.08, 12, 10), bright, 0, -0.04, 0);
      add(new THREE.SphereGeometry(0.06, 12, 10), bright, 0, 0.08, 0);
      for (const sx of [-1, 1]) {
        add(new THREE.SphereGeometry(0.025, 8, 6), bright, sx * 0.05, 0.14, 0);
        add(new THREE.SphereGeometry(0.03, 8, 6), bright, sx * 0.08, -0.01, 0.02);
        add(new THREE.SphereGeometry(0.012, 6, 4), dark, sx * 0.022, 0.09, 0.055);
      }
      break;
    case 'rocketPop':
      add(new THREE.CylinderGeometry(0.05, 0.06, 0.18, 12), bright, 0, 0, 0);
      add(new THREE.ConeGeometry(0.05, 0.08, 12), bright, 0, 0.13, 0);
      add(new THREE.CylinderGeometry(0.052, 0.052, 0.03, 12), dark, 0, 0.03, 0);
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        add(new THREE.BoxGeometry(0.008, 0.07, 0.05), bright, Math.sin(a) * 0.06, -0.07, Math.cos(a) * 0.06, 0, 0, a);
      }
      add(new THREE.CylinderGeometry(0.01, 0.01, 0.08, 6), dark, 0, -0.13, 0);
      break;
  }
  for (const [mat, list] of parts) {
    const merged = mergeGeometries(list, false);
    for (const geo of list) geo.dispose();
    if (merged) g.add(new THREE.Mesh(merged, mat));
  }
  return g;
}

export interface SecretTopping {
  readonly group: THREE.Group;
  /** Peek out of jar `i` at world position `jarTop` (null = hidden, e.g. jars closed). */
  toJar(jarTop: THREE.Vector3 | null, instant?: boolean): void;
  /** Ride on the cone: follow this world position every frame (null = stop). */
  onCone(top: THREE.Vector3 | null): void;
  update(dt: number): void;
  dispose(): void;
}

export function createSecretTopping(ctx: GameContext, id: SecretId): SecretTopping {
  const bright = createLayerMaterial(1);
  const dark = createLayerMaterial(0.25);
  const glowMat = createGlowMaterial({ level: 1, coreOpacity: 0.1, rimPower: 2.2, pulse: 0.35 });
  const group = new THREE.Group();
  group.name = 'Scoops.secret';
  const treat = buildTreat(id, bright, dark);
  group.add(treat);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), glowMat);
  group.add(glow);
  // Four sparkles orbiting the treat.
  // Four sparkles orbiting the treat: one instanced draw.
  const sparkGeo = new THREE.OctahedronGeometry(0.025, 0);
  const SPARKS = 4;
  const sparkMesh = new THREE.InstancedMesh(sparkGeo, bright, SPARKS);
  sparkMesh.frustumCulled = false;
  group.add(sparkMesh);
  const spark = new THREE.Object3D();
  group.visible = false;
  ctx.vision.add(group, VisionLayer.WeakOnly);

  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  let hopT = 1;
  let target: THREE.Vector3 | null = null;
  let follow: THREE.Vector3 | null = null;
  let time = 0;

  return {
    group,
    toJar(jarTop, instant = false) {
      follow = null;
      if (!jarTop) {
        target = null;
        group.visible = false;
        return;
      }
      const wasVisible = group.visible && target !== null;
      target = jarTop.clone();
      if (!wasVisible || instant) {
        group.position.copy(target);
        hopT = 1;
      } else {
        from.copy(group.position);
        to.copy(target);
        hopT = 0;
      }
      group.visible = true;
    },
    onCone(top) {
      follow = top;
      target = null;
      group.visible = !!top;
      if (top) group.position.copy(top);
    },
    update(dt) {
      if (!group.visible) return;
      time += dt;
      if (follow) {
        group.position.copy(follow);
        group.position.y += 0.06 + Math.sin(time * 3) * 0.015;
        treat.rotation.y += dt * 1.5;
      } else if (target) {
        if (hopT < 1) {
          hopT = Math.min(1, hopT + dt / 0.55);
          group.position.lerpVectors(from, to, hopT);
          group.position.y += Math.sin(hopT * Math.PI) * 0.6;
          treat.rotation.z = hopT * Math.PI * 2;
        } else {
          group.position.copy(target);
          group.position.y += 0.05 + Math.abs(Math.sin(time * 2.6)) * 0.09; // peeking up and down
          treat.rotation.z = Math.sin(time * 2) * 0.25;
        }
        treat.rotation.y = Math.sin(time * 1.3) * 0.6;
      }
      for (let i = 0; i < SPARKS; i++) {
        const a = time * 2.2 + (i / SPARKS) * Math.PI * 2;
        spark.position.set(Math.cos(a) * 0.2, Math.sin(a * 1.7) * 0.1 + 0.05, Math.sin(a) * 0.2);
        spark.scale.setScalar(0.6 + 0.6 * Math.abs(Math.sin(time * 5 + i)));
        spark.updateMatrix();
        sparkMesh.setMatrixAt(i, spark.matrix);
      }
      sparkMesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      ctx.vision.remove(group);
      group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose();
      });
      bright.dispose();
      dark.dispose();
      glowMat.dispose();
    },
  };
}
