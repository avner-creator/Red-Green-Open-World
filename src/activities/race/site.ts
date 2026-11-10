/**
 * Race scenery (both-eye): the start/finish gantry with three start lamps, the race booth with a
 * chequered flag, inflatable checkpoint arches, chevron boards at the big corners and a podium that
 * only appears for the celebration. Idle cost: site (1) + arches (1) + chevrons (1) + lamps (1)
 * draws; shadows come from low-poly proxies on SHADOW_PROXY_LAYER. Brightness patterns (white vs
 * near-black), never hue alone, so everything reads in R-only and G-only.
 */
import * as THREE from 'three';
import { asShadowProxy } from '../../core/shadow-proxy';
import { finish, finishMaterial, mergeFinished, placed, type Finish } from '../../core/vertex-finish';
import type { PhysicsApi } from '../../types';
import type { Track } from './track';
import { leftOf } from './track';

const WHITE: Finish = { color: 0xf6f4ee, rough: 0.5, metal: 0 };
const INK: Finish = { color: 0x16181e, rough: 0.6, metal: 0 };
const SUN: Finish = { color: 0xffd23a, rough: 0.45, metal: 0 };
const NAVY: Finish = { color: 0x23305a, rough: 0.5, metal: 0 };
const STEEL: Finish = { color: 0xc4cad1, rough: 0.3, metal: 0.9 };
const VINYL_A: Finish = { color: 0xfafafa, rough: 0.28, metal: 0 };
const VINYL_B: Finish = { color: 0x1b2240, rough: 0.3, metal: 0 };

export interface Placement {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface RaceSite {
  readonly root: THREE.Group;
  /** Where the booth's E prompt floats. */
  readonly boothPrompt: THREE.Vector3;
  /** Start lamps: 0 = all off, 1..3 = that many lit, 4 = GO flash (all bright). */
  setLamps(n: number): void;
  /** Place the checkpoint arches (lap distance + lateral centre); index 0 (the gantry) is skipped. */
  setCheckpoints(list: readonly { s: number; lateral: number }[]): void;
  /** An arch was passed: wobble it. index 0 = gantry (no wobble). */
  bounceArch(index: number): void;
  showPodium(on: boolean): void;
  /** World spots on the podium steps (1st, 2nd, 3rd), feet height. */
  readonly podiumSteps: readonly THREE.Vector3[];
  readonly podiumYaw: number;
  update(dt: number): void;
  dispose(): void;
}

const yawOf = (dx: number, dz: number): number => Math.atan2(dx, dz);

function archGeometry(radius: number, tube: number, segs: number, radial: number, striped: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stripes = striped ? 9 : 1;
  for (let i = 0; i < stripes; i++) {
    const a0 = (i / stripes) * Math.PI;
    const g = new THREE.TorusGeometry(radius, tube, radial, Math.max(2, Math.round(segs / stripes)), Math.PI / stripes);
    g.rotateZ(a0);
    parts.push(striped ? finish(g, i % 2 ? VINYL_B : VINYL_A) : g);
  }
  if (striped) {
    // Fat round feet.
    for (const s of [1, -1]) parts.push(finish(placed(new THREE.CylinderGeometry(tube * 1.5, tube * 1.7, 0.5, 14), s * radius, 0.25, 0), VINYL_B));
    return mergeFinished(parts);
  }
  return mergeFinished(parts);
}

function chevronBoardGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  p.push(finish(new THREE.BoxGeometry(2.0, 0.9, 0.08).translate(0, 1.25, 0), WHITE));
  p.push(finish(new THREE.BoxGeometry(2.1, 1.0, 0.06).translate(0, 1.25, -0.02), INK));
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Shape();
    s.moveTo(-0.15, 0.32);
    s.lineTo(0.15, 0);
    s.lineTo(-0.15, -0.32);
    s.lineTo(-0.01, -0.32);
    s.lineTo(0.29, 0);
    s.lineTo(-0.01, 0.32);
    p.push(finish(new THREE.ShapeGeometry(s).translate(-0.55 + i * 0.5, 1.25, 0.045), INK));
  }
  for (const x of [-0.75, 0.75]) p.push(finish(new THREE.CylinderGeometry(0.05, 0.05, 0.85, 8).translate(x, 0.42, -0.06), STEEL));
  return mergeFinished(p);
}

export function createRaceSite(scene: THREE.Scene, track: Track, heightAt: (x: number, z: number) => number, checkpoints: readonly number[], physics?: PhysicsApi): RaceSite {
  const root = new THREE.Group();
  root.name = 'race-site';
  scene.add(root);
  const material = finishMaterial('race-site');
  const disposables: { dispose(): void }[] = [material];
  const groundAt = (x: number, z: number): number => heightAt(x, z);
  const along = (s: number, lateral: number): Placement => {
    const p = track.at(s);
    const l = leftOf(p.dx, p.dz);
    const x = p.x + l.x * lateral;
    const z = p.z + l.z * lateral;
    return { x, y: groundAt(x, z), z, yaw: yawOf(p.dx, p.dz) };
  };
  const M = (pl: Placement, extraYaw = 0): THREE.Matrix4 =>
    new THREE.Matrix4().compose(new THREE.Vector3(pl.x, pl.y, pl.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), pl.yaw + extraYaw), new THREE.Vector3(1, 1, 1));

  // ── Static set: gantry + booth (one mesh) ──
  const start = along(0, 0);
  const gantryParts: THREE.BufferGeometry[] = [];
  const gm = M(start);
  const halfSpan = 5;
  for (const s of [1, -1]) {
    gantryParts.push(finish(new THREE.CylinderGeometry(0.42, 0.5, 5.4, 16).translate(s * halfSpan, 2.7, 0), WHITE).applyMatrix4(gm));
    for (let i = 0; i < 4; i++) gantryParts.push(finish(new THREE.CylinderGeometry(0.44, 0.44, 0.3, 16).translate(s * halfSpan, 0.8 + i * 1.2, 0), INK).applyMatrix4(gm));
    gantryParts.push(finish(new THREE.SphereGeometry(0.5, 14, 10).translate(s * halfSpan, 5.45, 0), SUN).applyMatrix4(gm));
  }
  // Chequered banner: 2 rows of squares, both faces.
  const cols = 14;
  const sq = (halfSpan * 2) / cols;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < cols; c++) {
      const f = (r + c) % 2 ? INK : WHITE;
      gantryParts.push(finish(new THREE.BoxGeometry(sq, sq, 0.36).translate(-halfSpan + sq * (c + 0.5), 4.55 + r * sq, 0), f).applyMatrix4(gm));
    }
  }
  // Lamp housing (faces the grid, −Z local).
  gantryParts.push(finish(new THREE.BoxGeometry(3.2, 1.1, 0.3).translate(0, 3.55, -0.25), INK).applyMatrix4(gm));
  // Chequered start line on the road.
  for (let c = 0; c < 10; c++) {
    for (let r = 0; r < 2; r++) {
      const x = -3.5 + (c + 0.5) * 0.7;
      const wpos = new THREE.Vector3(x, 0, (r - 0.5) * 0.7).applyMatrix4(new THREE.Matrix4().makeRotationY(start.yaw)).add(new THREE.Vector3(start.x, 0, start.z));
      const y = groundAt(wpos.x, wpos.z) + 0.2;
      gantryParts.push(finish(new THREE.BoxGeometry(0.7, 0.02, 0.7), (r + c) % 2 ? INK : WHITE).applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(wpos.x, y, wpos.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), start.yaw), new THREE.Vector3(1, 1, 1))));
    }
  }
  // Booth: striped kiosk on the left (north) of the start, facing the road.
  const booth = along(4, 8.6);
  const bm = M(booth, Math.PI / 2 + Math.PI); // front (+Z) faces the road (−left)
  const bp: THREE.BufferGeometry[] = [];
  bp.push(finish(new THREE.BoxGeometry(2.4, 0.3, 1.8).translate(0, 0.15, 0), INK));
  bp.push(finish(new THREE.BoxGeometry(2.2, 1.1, 1.6).translate(0, 0.85, 0), WHITE));
  bp.push(finish(new THREE.BoxGeometry(2.3, 0.12, 1.75).translate(0, 1.42, 0.02), INK));
  for (const x of [-1.05, 1.05]) bp.push(finish(new THREE.BoxGeometry(0.12, 1.25, 0.12).translate(x, 2.05, 0.75), STEEL));
  for (let i = 0; i < 7; i++) bp.push(finish(new THREE.BoxGeometry(2.6 / 7, 0.1, 1.1).translate(-1.3 + (i + 0.5) * (2.6 / 7), 2.72, 0.35).rotateX(0.18), i % 2 ? NAVY : WHITE));
  bp.push(finish(new THREE.BoxGeometry(2.4, 1.0, 1.4).translate(0, 3.2, -0.15), NAVY));
  // Sign: white disc with a dark buggy-ish shape (wheels + body) and a flag.
  bp.push(finish(placed(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 28), 0, 3.25, 0.6, Math.PI / 2), WHITE));
  bp.push(finish(new THREE.BoxGeometry(0.75, 0.22, 0.04).translate(0, 3.25, 0.66), INK));
  bp.push(finish(new THREE.BoxGeometry(0.36, 0.2, 0.04).translate(-0.05, 3.44, 0.66), INK));
  for (const x of [-0.25, 0.25]) bp.push(finish(placed(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 14), x, 3.1, 0.67, Math.PI / 2), INK));
  // Flag pole + chequered flag.
  bp.push(finish(new THREE.CylinderGeometry(0.05, 0.05, 3.8, 8).translate(1.45, 1.9, 0.5), STEEL));
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) bp.push(finish(new THREE.BoxGeometry(0.25, 0.25, 0.03).translate(1.6 + c * 0.25, 3.3 + r * 0.25, 0.5), (r + c) % 2 ? INK : WHITE));
  // Counter top with a big button.
  bp.push(finish(new THREE.CylinderGeometry(0.2, 0.22, 0.1, 18).translate(0.5, 1.53, 0.45), SUN));
  for (const g of bp) gantryParts.push(g.applyMatrix4(bm));
  const siteMesh = new THREE.Mesh(mergeFinished(gantryParts), material);
  siteMesh.name = 'race-gantry-booth';
  siteMesh.castShadow = false;
  siteMesh.receiveShadow = true;
  root.add(siteMesh);
  disposables.push(siteMesh.geometry);
  // Shadow proxy: pillars, banner, booth block.
  const proxyParts: THREE.BufferGeometry[] = [];
  for (const s of [1, -1]) proxyParts.push(new THREE.BoxGeometry(0.9, 5.4, 0.9).translate(s * halfSpan, 2.7, 0).applyMatrix4(gm));
  proxyParts.push(new THREE.BoxGeometry(halfSpan * 2, sq * 2, 0.36).translate(0, 4.55 + sq / 2, 0).applyMatrix4(gm));
  proxyParts.push(new THREE.BoxGeometry(2.4, 3.6, 1.6).translate(0, 1.8, 0).applyMatrix4(bm));
  const proxy = asShadowProxy(new THREE.Mesh(mergeFinished(proxyParts.map((g) => g.toNonIndexed()))));
  root.add(proxy);
  disposables.push(proxy.geometry);
  const boothPrompt = new THREE.Vector3(0, 1.9, 1.2).applyMatrix4(bm);
  // Solid gantry pillars and booth.
  const colliders: ReturnType<PhysicsApi['addStaticBox']>[] = [];
  if (physics) {
    for (const s of [1, -1]) {
      const c = new THREE.Vector3(s * halfSpan, 2.7, 0).applyMatrix4(gm);
      colliders.push(physics.addStaticCylinder(c, 2.7, 0.5));
    }
    const bc = new THREE.Vector3(0, 1.1, 0).applyMatrix4(bm);
    colliders.push(physics.addStaticBox(bc, new THREE.Vector3(1.2, 1.1, 0.9), new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().extractRotation(bm))));
  }

  // ── Start lamps (3 discs facing the grid) ──
  const lampGeo = new THREE.CircleGeometry(0.38, 24);
  const lampMat = new THREE.MeshBasicMaterial({ toneMapped: false });
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, 3);
  lamps.name = 'race-lamps';
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(-1 + i, 3.55, -0.42), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI), new THREE.Vector3(1, 1, 1));
    lamps.setMatrixAt(i, gm.clone().multiply(m));
  }
  root.add(lamps);
  disposables.push(lampGeo, lampMat);
  const OFF = new THREE.Color(0x2c3038);
  const ON = new THREE.Color(0xfff2b0).multiplyScalar(1.6);
  let lampState = -1;
  const setLamps = (n: number): void => {
    if (n === lampState) return;
    lampState = n;
    for (let i = 0; i < 3; i++) lamps.setColorAt(i, n >= 4 || i < n ? ON : OFF);
    if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;
  };
  setLamps(0);

  // ── Inflatable checkpoint arches (instanced) ──
  const archR = 5;
  const archGeo = archGeometry(archR, 0.5, 36, 10, true);
  const arches = new THREE.InstancedMesh(archGeo, material, Math.max(1, checkpoints.length - 1));
  arches.name = 'race-arches';
  arches.castShadow = false;
  arches.receiveShadow = true;
  const archProxyGeo = archGeometry(archR, 0.45, 9, 4, false);
  const archProxy = asShadowProxy(new THREE.InstancedMesh(archProxyGeo, undefined, Math.max(1, checkpoints.length - 1)));
  const archBase: THREE.Matrix4[] = [];
  const archWobble: { t: number }[] = [];
  const placeArches = (list: readonly { s: number; lateral: number }[]): void => {
    archBase.length = 0;
    archWobble.length = 0;
    list.slice(1).forEach((c, i) => {
      if (i >= arches.instanceMatrix.count) return;
      const m = M(along(c.s, c.lateral));
      archBase.push(m);
      archWobble.push({ t: 9 });
      arches.setMatrixAt(i, m);
      archProxy.setMatrixAt(i, m);
    });
    arches.count = archProxy.count = archBase.length;
    arches.instanceMatrix.needsUpdate = archProxy.instanceMatrix.needsUpdate = true;
    arches.computeBoundingSphere();
    archProxy.computeBoundingSphere();
  };
  placeArches(checkpoints.map((s) => ({ s, lateral: 0 })));
  arches.computeBoundingSphere();
  archProxy.computeBoundingSphere();
  root.add(arches, archProxy);
  disposables.push(archGeo, archProxyGeo);

  // ── Chevron boards on the outside of the big corners ──
  const corners: { s: number; k: number }[] = [];
  for (const p of track.points) {
    const k = track.curvatureNear(p.s, 4);
    if (k < 0.055) continue;
    const near = corners.find((c) => Math.abs(c.s - p.s) < 22 || Math.abs(c.s - p.s) > track.length - 22);
    if (near) {
      if (k > near.k) {
        near.s = p.s;
        near.k = k;
      }
    } else corners.push({ s: p.s, k });
  }
  const boardGeo = chevronBoardGeometry();
  const boardMat = finishMaterial('race-chevrons');
  boardMat.side = THREE.DoubleSide;
  const boards = new THREE.InstancedMesh(boardGeo, boardMat, Math.max(1, corners.length * 2));
  boards.name = 'race-chevrons';
  let nb = 0;
  for (const c of corners) {
    const p = track.at(c.s);
    const turnLeft = p.k > 0;
    // Outside of the corner, a little before the apex, facing the oncoming buggies.
    for (const ds of [-6, 2]) {
      const pl = along(c.s + ds, turnLeft ? -6.2 : 6.2);
      const facing = pl.yaw + Math.PI;
      const m = new THREE.Matrix4().compose(new THREE.Vector3(pl.x, pl.y, pl.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), facing), new THREE.Vector3(turnLeft ? -1 : 1, 1, 1));
      boards.setMatrixAt(nb++, m);
    }
  }
  boards.count = nb;
  boards.computeBoundingSphere();
  root.add(boards);
  disposables.push(boardGeo, boardMat);

  // ── Podium (hidden until a race ends) ──
  const podium = along(16, 9.5);
  const pm = M(podium, Math.PI / 2 + Math.PI);
  const steps: [number, number, number][] = [[0, 1.2, 1], [-1.6, 0.8, 2], [1.6, 0.5, 3]];
  const pp: THREE.BufferGeometry[] = [];
  for (const [x, h, place] of steps) {
    pp.push(finish(new THREE.BoxGeometry(1.5, h, 1.4).translate(x, h / 2, 0), place === 1 ? WHITE : NAVY));
    pp.push(finish(new THREE.BoxGeometry(1.56, 0.08, 1.46).translate(x, h, 0), SUN));
    // Place pips on the front: 1, 2 or 3 bright/dark dots.
    for (let i = 0; i < place; i++) {
      pp.push(finish(placed(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 16), x - (place - 1) * 0.18 + i * 0.36, h * 0.5, 0.71, Math.PI / 2), place === 1 ? INK : WHITE));
    }
  }
  const podiumMesh = new THREE.Mesh(mergeFinished(pp.map((g) => g.applyMatrix4(pm))), material);
  podiumMesh.name = 'race-podium';
  podiumMesh.visible = false;
  podiumMesh.castShadow = true;
  podiumMesh.receiveShadow = true;
  root.add(podiumMesh);
  disposables.push(podiumMesh.geometry);
  const podiumSteps = steps.map(([x, h]) => new THREE.Vector3(x, h, 0).applyMatrix4(pm));
  const podiumYaw = podium.yaw + Math.PI / 2 + Math.PI;

  const scale = new THREE.Matrix4();
  const tmp = new THREE.Matrix4();
  return {
    root,
    boothPrompt,
    setLamps,
    setCheckpoints(list) {
      placeArches(list);
    },
    bounceArch(index) {
      const w = archWobble[index - 1];
      if (w) w.t = 0;
    },
    showPodium(on) {
      podiumMesh.visible = on;
    },
    podiumSteps,
    podiumYaw,
    update(dt) {
      let dirty = false;
      archWobble.forEach((w, i) => {
        if (w.t > 1.2) return;
        w.t += dt;
        const k = Math.sin(w.t * 16) * Math.exp(-w.t * 4) * 0.12;
        scale.makeScale(1 - k * 0.6, 1 + k, 1 + k * 0.4);
        tmp.multiplyMatrices(archBase[i], scale);
        arches.setMatrixAt(i, w.t > 1.2 ? archBase[i] : tmp);
        dirty = true;
      });
      if (dirty) arches.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      root.removeFromParent();
      for (const d of disposables) d.dispose();
      for (const c of colliders) physics?.removeCollider(c);
    },
  };
}
