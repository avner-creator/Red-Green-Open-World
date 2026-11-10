/**
 * Layer objects of a chest lock. Both are drawn through `ctx.vision` only, never in the main scene:
 *  - the KEY (weak eye): a glowing key whose bow holds the right symbol,
 *  - the SYMBOL HINT (strong eye): the right symbol, large and glowing above the chest, and small on the lid.
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

export function extrudeShape(shape: THREE.Shape, depth: number, bevel = depth * 0.3): THREE.BufferGeometry {
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

export interface SymbolHintModel {
  /** Chest-local root: add to the StrongOnly layer; position it on the chest and copy its yaw. */
  root: THREE.Group;
  /** Floating symbol that always faces the camera. */
  float: THREE.Group;
  /** Small symbol on top of the lid. */
  lid: THREE.Group;
  update(t: number, bill: number): void;
  dispose(): void;
}

/** Height of the floating symbol's centre above the chest origin. */
export const HINT_HEIGHT = 2.55;

/**
 * The answer to the lock, for the STRONG eye only: a large glowing symbol floating over the chest
 * (turns to face the camera) and a small matching one on the lid. The six floor buttons in the main
 * scene never reveal which one is right, so the two eyes have to work together.
 */
export function buildSymbolHint(symbol: number): SymbolHintModel {
  const kind = SYMBOLS[symbol % 3];
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T): T => {
    disposables.push(d);
    return d;
  };
  const root = new THREE.Group();
  root.name = 'chest-symbol';
  const symMat = track(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const haloMat = track(createGlowMaterial({ level: 1, coreOpacity: 0.3, rimPower: 1.6, pulse: 0.25 }));

  const bigGeo = track(shadeGrey(extrudeShape(symbolShape(kind, 0.6), 0.12, 0.035), 1, 0.62, facet));
  const float = new THREE.Group();
  float.position.y = HINT_HEIGHT;
  float.add(new THREE.Mesh(bigGeo, symMat));
  const haloGeo = track(new THREE.SphereGeometry(1.05, 20, 14));
  float.add(new THREE.Mesh(haloGeo, haloMat));
  root.add(float);

  const smallGeo = track(shadeGrey(extrudeShape(symbolShape(kind, 0.12), 0.03, 0.01), 1, 0.62, facet));
  const lid = new THREE.Group();
  lid.position.set(0, CHEST.bodyH + CHEST.lidR + 0.03, 0);
  const small = new THREE.Mesh(smallGeo, symMat);
  small.rotation.x = -Math.PI / 2; // lie flat, facing up
  lid.add(small);
  const lidHalo = new THREE.Mesh(track(new THREE.CircleGeometry(0.2, 20)), track(createLayerMaterial(1, 0.4)));
  lidHalo.rotation.x = -Math.PI / 2;
  lidHalo.position.y = -0.012;
  lid.add(lidHalo);
  root.add(lid);

  return {
    root,
    float,
    lid,
    update(t, bill) {
      float.position.y = HINT_HEIGHT + Math.sin(t * 1.9) * 0.1;
      float.rotation.y = bill - root.rotation.y + Math.sin(t * 1.3) * 0.12;
      float.scale.setScalar(1 + 0.06 * Math.sin(t * 3.1));
    },
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
