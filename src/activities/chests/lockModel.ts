/**
 * Layer objects of a chest lock. Both are drawn through `ctx.vision` only, never in the main scene:
 *  - the KEY (weak eye): a glowing key whose bow holds the right symbol,
 *  - the LOCK (strong eye): keyhole plate on one side, a slowly turning ring of three symbols (one,
 *    the right one, is bigger and brighter) and a floating arrow that points at the keyhole side.
 * Layer materials only keep brightness, so shape is carried by baked grey shading.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createGlowMaterial, createLayerMaterial } from '../../vision';
import { merge, shadeGrey } from './bake';
import { CHEST } from './chestModel';

export type SymbolKind = 'star' | 'moon' | 'circle';
export const SYMBOLS: readonly SymbolKind[] = ['star', 'moon', 'circle'];

/** 2D outline of a symbol, radius about `r`, centred on the origin. */
export function symbolShape(kind: SymbolKind, r: number): THREE.Shape {
  const s = new THREE.Shape();
  if (kind === 'star') {
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 === 0 ? r : r * 0.46;
      const a = Math.PI / 2 + (i * Math.PI) / 5;
      if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    s.closePath();
  } else if (kind === 'moon') {
    const ri = r * 0.8;
    const d = r * 0.45;
    const x = (r * r - ri * ri + d * d) / (2 * d);
    const y = Math.sqrt(r * r - x * x);
    const th = Math.atan2(y, x);
    s.absarc(0, 0, r, th, Math.PI * 2 - th, false);
    const a1 = Math.atan2(-y, x - d);
    const a2 = Math.atan2(y, x - d);
    s.absarc(d, 0, ri, a1, a2 - Math.PI * 2, true);
    s.closePath();
  } else {
    s.absarc(0, 0, r, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, r * 0.5, 0, Math.PI * 2, true);
    s.holes.push(hole);
  }
  return s;
}

function extrudeShape(shape: THREE.Shape, depth: number, bevel = depth * 0.3): THREE.BufferGeometry {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 1, curveSegments: 10 });
  return g.translate(0, 0, -depth / 2);
}

/** Per-facet brightness variation so faces catch light differently. */
const facet = (nx: number, ny: number): number => 0.1 * Math.sin(Math.atan2(ny, nx) * 3);

export interface KeyModel {
  group: THREE.Group;
  /** Rotating inner part (spin about Y). */
  body: THREE.Object3D;
  dispose(): void;
}

export function buildKey(symbol: number): KeyModel {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, base = 1, ambient = 0.5): void => {
    parts.push(shadeGrey(g, base, ambient, facet));
  };
  add(new THREE.TorusGeometry(0.2, 0.058, 10, 28).translate(-0.44, 0, 0), 1, 0.5);
  add(extrudeShape(symbolShape(SYMBOLS[symbol % 3], 0.105), 0.05, 0.012).translate(-0.44, 0, 0), 0.95, 0.55);
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.78, 10).rotateZ(Math.PI / 2).translate(0.1, 0, 0), 0.85, 0.5);
  for (const x of [-0.2, -0.09]) add(new THREE.TorusGeometry(0.075, 0.026, 8, 14).rotateY(Math.PI / 2).translate(x, 0, 0), 1, 0.5);
  const teeth: [number, number][] = [[0.27, 0.2], [0.35, 0.13], [0.43, 0.21]];
  for (const [x, h] of teeth) add(new RoundedBoxGeometry(0.075, h, 0.07, 2, 0.015).translate(x, -0.03 - h / 2, 0), 0.9, 0.45);
  add(new THREE.SphereGeometry(0.058, 10, 8).translate(0.5, 0, 0), 1, 0.5);

  const geo = merge(parts);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const keyMesh = new THREE.Mesh(geo, mat);
  keyMesh.scale.setScalar(1.25);

  const glowGeo = new THREE.SphereGeometry(0.68, 20, 14);
  const glowMat = createGlowMaterial({ level: 1, coreOpacity: 0.06, rimPower: 2.6, pulse: 0.3 });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  const body = new THREE.Group();
  body.add(keyMesh);
  const group = new THREE.Group();
  group.name = 'chest-key';
  group.add(body, glow);
  return {
    group,
    body,
    dispose() {
      geo.dispose();
      mat.dispose();
      glowGeo.dispose();
      glowMat.dispose();
    },
  };
}

export interface LockModel {
  /** Chest-local root: add to the StrongOnly layer and copy the chest transform onto it. */
  root: THREE.Group;
  ring: THREE.Group;
  arrow: THREE.Object3D;
  update(t: number): void;
  dispose(): void;
}

function keyholeShape(): THREE.Shape {
  const s = new THREE.Shape();
  const w = 0.1;
  const h = 0.125;
  const r = 0.025;
  s.moveTo(-w + r, -h);
  s.lineTo(w - r, -h);
  s.quadraticCurveTo(w, -h, w, -h + r);
  s.lineTo(w, h - r);
  s.quadraticCurveTo(w, h, w - r, h);
  s.lineTo(-w + r, h);
  s.quadraticCurveTo(-w, h, -w, h - r);
  s.lineTo(-w, -h + r);
  s.quadraticCurveTo(-w, -h, -w + r, -h);
  const hole = new THREE.Path();
  hole.absarc(0, 0.03, 0.036, -Math.PI * 0.35, Math.PI * 1.35, false);
  hole.lineTo(-0.022, -0.085);
  hole.lineTo(0.022, -0.085);
  hole.closePath();
  s.holes.push(hole);
  return s;
}

function arrowShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0.3);
  s.lineTo(0.17, 0.06);
  s.lineTo(0.065, 0.06);
  s.lineTo(0.065, -0.24);
  s.lineTo(-0.065, -0.24);
  s.lineTo(-0.065, 0.06);
  s.lineTo(-0.17, 0.06);
  s.closePath();
  return s;
}

/**
 * Build the strong-eye lock for a chest. `side` is the keyhole side (0..3), `rightIdx` the right
 * symbol (0..2). All positions are in the chest's local frame.
 */
export function buildLock(side: number, rightIdx: number): LockModel {
  const root = new THREE.Group();
  root.name = 'chest-lock';
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T): T => {
    disposables.push(d);
    return d;
  };

  const face = new THREE.Group();
  const half = side % 2 === 0 ? CHEST.depth / 2 : CHEST.width / 2;
  face.rotation.y = (side * Math.PI) / 2;
  face.position.set(Math.sin((side * Math.PI) / 2) * (half + 0.04), 0.29, Math.cos((side * Math.PI) / 2) * (half + 0.04));
  root.add(face);

  const plateGeo = track(shadeGrey(extrudeShape(keyholeShape(), 0.022, 0.008), 1, 0.55, facet));
  const plateMat = track(new THREE.MeshBasicMaterial({ vertexColors: true }));
  face.add(new THREE.Mesh(plateGeo, plateMat));

  const ring = new THREE.Group();
  ring.position.z = 0.012;
  face.add(ring);
  const R = 0.225;
  const trackGeo = track(shadeGrey(new THREE.TorusGeometry(R, 0.007, 6, 40), 0.55, 0.7));
  ring.add(new THREE.Mesh(trackGeo, plateMat));
  for (let i = 0; i < 3; i++) {
    const right = i === rightIdx;
    const g = track(shadeGrey(extrudeShape(symbolShape(SYMBOLS[i], right ? 0.085 : 0.062), 0.02, 0.006), right ? 1 : 0.5, 0.55, facet));
    const mesh = new THREE.Mesh(g, plateMat);
    const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
    mesh.position.set(Math.cos(a) * R, Math.sin(a) * R, 0.004);
    mesh.userData.baseAngle = a;
    mesh.userData.right = right;
    ring.add(mesh);
    if (right) {
      // A soft halo behind the right symbol so it reads as "the one".
      const halo = new THREE.Mesh(track(new THREE.CircleGeometry(0.125, 20)), track(createLayerMaterial(1, 0.35)));
      halo.position.set(mesh.position.x, mesh.position.y, -0.004);
      mesh.userData.halo = halo;
      ring.add(halo);
    }
  }

  // Floating arrow over the lid pointing at the keyhole side.
  const arrow = new THREE.Group();
  const arrowGeo = track(shadeGrey(extrudeShape(arrowShape(), 0.045, 0.012), 1, 0.6, facet));
  const arrowMat = track(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const arrowMesh = new THREE.Mesh(arrowGeo, arrowMat);
  arrowMesh.rotation.x = Math.PI / 2; // shape +Y -> world +Z
  arrow.add(arrowMesh);
  arrow.rotation.y = (side * Math.PI) / 2;
  arrow.position.y = CHEST.bodyH + CHEST.lidR + 0.36;
  root.add(arrow);

  return {
    root,
    ring,
    arrow,
    update(t) {
      ring.rotation.z = t * 0.5;
      for (const c of ring.children) {
        if (c.userData.baseAngle !== undefined) {
          c.rotation.z = -t * 0.5; // symbols stay upright while the ring turns
          if (c.userData.right) c.scale.setScalar(1 + 0.08 * Math.sin(t * 3));
        }
      }
      arrow.position.y = CHEST.bodyH + CHEST.lidR + 0.36 + Math.sin(t * 2.4) * 0.045;
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
