/**
 * The glasses twist of the race, registered ONLY on the WeakOnly vision layer: the glowing best
 * racing line (flowing chevrons) and the boost pads. Nothing in the main scene, HUD or audio marks
 * where they are; the strong eye sees an ordinary road. Shown only while a race is on.
 */
import * as THREE from 'three';
import { createLayerMaterial } from '../../vision';
import { VisionLayer, type VisionApi } from '../../types';
import { leftOf, type Track } from './track';

export interface RaceGlow {
  /** Pad centres (world, on the road) in lap order, with their travel direction. */
  readonly pads: readonly { x: number; y: number; z: number; dx: number; dz: number; s: number; lateral: number }[];
  setVisible(on: boolean): void;
  /** A pad was hit: flash it (on the layer only). */
  flashPad(index: number): void;
  update(dt: number): void;
  dispose(): void;
}

const LIFT = 0.2;

/** A flat chevron (pointing +Z) of the given size, as triangles in XZ. */
function chevron(w: number, l: number, t: number): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -l / 2);
  s.lineTo(0, l / 2 - t);
  s.lineTo(w / 2, -l / 2);
  s.lineTo(w / 2, -l / 2 + t);
  s.lineTo(0, l / 2);
  s.lineTo(-w / 2, -l / 2 + t);
  s.closePath();
  return s;
}

/** Shape (XY) → flat on the ground: X stays, shape +Y becomes travel +Z. */
function flatten(g: THREE.BufferGeometry): THREE.BufferGeometry {
  return g.rotateX(Math.PI / 2);
}

export function createRaceGlow(vision: VisionApi, track: Track, lineAt: (s: number) => number, padDist: readonly number[], heightAt: (x: number, z: number) => number): RaceGlow {
  const root = new THREE.Group();
  root.name = 'race-weak-eye';
  root.visible = false;
  const disposables: { dispose(): void }[] = [];

  // ── Racing line: a chevron every 3 m along the line, draped on the road ──
  const chev = flatten(new THREE.ShapeGeometry(chevron(0.9, 0.9, 0.3)));
  const pos: number[] = [];
  const idx: number[] = [];
  const cp = chev.getAttribute('position');
  const ci = chev.index;
  for (let s = 1.5; s < track.length; s += 3) {
    const p = track.at(s);
    const l = leftOf(p.dx, p.dz);
    const off = lineAt(s);
    const cx = p.x + l.x * off;
    const cz = p.z + l.z * off;
    const base = pos.length / 3;
    for (let v = 0; v < cp.count; v++) {
      const lx = cp.getX(v);
      const lz = cp.getZ(v);
      // local +Z = travel, local +X = right of travel (−left).
      const x = cx + p.dx * lz - l.x * lx;
      const z = cz + p.dz * lz - l.z * lx;
      pos.push(x, heightAt(x, z) + LIFT, z);
    }
    if (ci) for (let k = 0; k < ci.count; k++) idx.push(base + ci.getX(k));
  }
  chev.dispose();
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  lineGeo.setIndex(idx);
  lineGeo.computeBoundingSphere();
  const lineMat = createLayerMaterial(0.8);
  lineMat.side = THREE.DoubleSide;
  lineMat.polygonOffset = true;
  lineMat.polygonOffsetFactor = -2;
  const lineMesh = new THREE.Mesh(lineGeo, lineMat);
  lineMesh.name = 'race-line';
  lineMesh.frustumCulled = false;
  root.add(lineMesh);
  disposables.push(lineGeo, lineMat);

  // ── Boost pads: three big chevrons in a frame, one mesh per pad (they flash on a hit) ──
  const padParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) padParts.push(flatten(new THREE.ShapeGeometry(chevron(2.4, 1.0, 0.42))).translate(0, 0, -1.05 + i * 1.05));
  // Frame: four thin bars.
  for (const [w, l, x, z] of [[3.2, 0.18, 0, 1.85], [3.2, 0.18, 0, -1.85], [0.18, 3.7, 1.6, 0], [0.18, 3.7, -1.6, 0]] as const) {
    padParts.push(new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2).translate(x, 0, z));
  }
  const padGeo = mergePlain(padParts);
  const padMat = createLayerMaterial(1, 0.98);
  padMat.side = THREE.DoubleSide;
  padMat.depthWrite = false;
  padMat.polygonOffset = true;
  padMat.polygonOffsetFactor = -3;
  disposables.push(padGeo, padMat);
  const pads: RaceGlow['pads'][number][] = [];
  const padMeshes: { mesh: THREE.Mesh; flash: number }[] = [];
  for (const s of padDist) {
    const p = track.at(s);
    const lateral = lineAt(s);
    const l = leftOf(p.dx, p.dz);
    const x = p.x + l.x * lateral;
    const z = p.z + l.z * lateral;
    const y = heightAt(x, z) + LIFT + 0.02;
    pads.push({ x, y, z, dx: p.dx, dz: p.dz, s, lateral });
    const m = new THREE.Mesh(padGeo, padMat);
    m.name = 'race-boost-pad';
    m.position.set(x, y, z);
    m.rotation.y = Math.atan2(p.dx, p.dz);
    root.add(m);
    padMeshes.push({ mesh: m, flash: 9 });
  }

  vision.add(root, VisionLayer.WeakOnly);
  let time = 0;
  return {
    pads,
    setVisible(on) {
      root.visible = on;
    },
    flashPad(i) {
      const p = padMeshes[i];
      if (p) p.flash = 0;
    },
    update(dt) {
      if (!root.visible) return;
      time += dt;
      // Gentle breathing (alpha) so the pads feel alive; flashes pop the pad's scale.
      padMat.opacity = 0.82 + 0.16 * Math.sin(time * 5);
      for (const p of padMeshes) {
        if (p.flash > 0.6) {
          p.mesh.scale.setScalar(1);
          continue;
        }
        p.flash += dt;
        const k = 1 + Math.sin(p.flash * 14) * Math.exp(-p.flash * 6) * 0.35 + (1 - p.flash / 0.6) * 0.2;
        p.mesh.scale.set(k, 1, k);
      }
    },
    dispose() {
      vision.remove(root);
      for (const d of disposables) d.dispose();
    },
  };
}

function mergePlain(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    const a = g.getAttribute('position');
    for (let i = 0; i < a.count; i++) pos.push(a.getX(i), a.getY(i), a.getZ(i));
    if (g !== p) g.dispose();
    p.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.computeBoundingSphere();
  return out;
}
