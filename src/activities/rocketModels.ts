/**
 * Procedural models for the rocket pad and the landing net. Everything is both-eye: bright and
 * dark bands (never hue alone) so each reads in the red channel and in the green channel.
 *
 * Render cost: a pad is 4 draws (static base + thrusters, plate, both springs, floating arrow;
 * the flame sprites only while launching) and 1 shadow-proxy draw; the net is 3 draws (dome, pole,
 * flag) and 2 shadow draws. Parts are merged by transform with per-vertex finishes
 * (`core/vertex-finish`); unlit arrows on the plate are emissive-only finishes.
 */
import * as THREE from 'three';
import { asShadowProxy } from '../core/shadow-proxy';
import { finish, finishKeepColors, finishMaterial, mergeFinished, placed, type Finish } from '../core/vertex-finish';
import { NET, ROCKET } from './constants';

const BRIGHT = 0xf4f4f4;
const YELLOW = 0xffd23a;
const NAVY = 0x1d2a5c;
const DARK = 0x1c202b;

/** Open cylinder wall with hard alternating stripes (vertex colours, flat per face). */
export function stripedRing(radius: number, height: number, stripes: number, a: number, b: number): THREE.BufferGeometry {
  const seg = stripes * 2;
  const g = new THREE.CylinderGeometry(radius, radius, height, seg, 1, true).toNonIndexed();
  const pos = g.getAttribute('position');
  const cols = new Float32Array(pos.count * 3);
  const ca = new THREE.Color(a);
  const cb = new THREE.Color(b);
  for (let f = 0; f < pos.count; f += 3) {
    const cx = (pos.getX(f) + pos.getX(f + 1) + pos.getX(f + 2)) / 3;
    const cz = (pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2)) / 3;
    const k = Math.floor(((Math.atan2(cz, cx) + Math.PI) / (Math.PI * 2)) * seg) % 2;
    const c = k === 0 ? ca : cb;
    for (let v = 0; v < 3; v++) cols.set([c.r, c.g, c.b], (f + v) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

class Helix extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly r: number,
    private readonly h: number,
    private readonly turns: number,
  ) {
    super();
  }
  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const a = t * this.turns * Math.PI * 2;
    return target.set(Math.cos(a) * this.r, t * this.h, Math.sin(a) * this.r);
  }
}

let glowTex: THREE.CanvasTexture | null = null;
function glowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,200,90,0.8)');
    grad.addColorStop(1, 'rgba(255,120,20,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

export interface RocketPadModel {
  /** Root at the ground, local +Z = launch direction. */
  group: THREE.Group;
  /** The plate the player stands on (moves down in the wind-up). */
  plate: THREE.Group;
  /** Springs that squash with the plate. */
  springs: THREE.Object3D[];
  /** Floating direction arrow (bobs). */
  arrow: THREE.Object3D;
  flames: THREE.Sprite[];
  /** Squash 0..1 (wind-up) and a wobble shake amount, applied by the caller each frame. */
  dispose(): void;
}

/** Arrow lying flat, tip toward +Z. */
function arrowShape(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, -1);
  s.lineTo(-0.75, 0.15);
  s.lineTo(-0.28, 0.15);
  s.lineTo(-0.28, 1);
  s.lineTo(0.28, 1);
  s.lineTo(0.28, 0.15);
  s.lineTo(0.75, 0.15);
  s.closePath();
  return s;
}

const std = (color: number, rough = 0.55, metal = 0): Finish => ({ color, rough, metal });
/** Unlit look (as MeshBasicMaterial): black albedo, the colour as glow. */
const unlit = (color: number): Finish => ({ color: 0x000000, rough: 1, metal: 0, emissive: color, glow: 1 });

/** Shared materials (one program, shared by every pad and the net). */
let padMaterial: THREE.MeshStandardMaterial | null = null;
let flagMaterial: THREE.MeshStandardMaterial | null = null;
const sharedPadMaterial = (): THREE.MeshStandardMaterial => (padMaterial ??= finishMaterial('rg-rocket-parts'));
const sharedFlagMaterial = (): THREE.MeshStandardMaterial => (flagMaterial ??= finishMaterial('rg-rocket-flag', undefined, { side: THREE.DoubleSide }));

export function buildRocketPad(): RocketPadModel {
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(d: T): T => {
    disposables.push(d);
    return d;
  };
  const material = sharedPadMaterial();
  const group = new THREE.Group();
  const baseR = ROCKET.padRadius + 0.5;

  // Static base: dark disc, striped hazard ring, two thruster cones with nozzles.
  const base: THREE.BufferGeometry[] = [
    finish(placed(new THREE.CylinderGeometry(baseR, baseR + 0.1, 0.3, 32), 0, 0.15, 0), std(DARK, 0.8)),
    finishKeepColors(placed(stripedRing(baseR, 0.34, 12, YELLOW, DARK), 0, 0.17, 0), { rough: 0.6, metal: 0 }),
  ];
  const coneFinish: Finish = { color: 0xff8a1f, rough: 0.4, metal: 0, emissive: 0xff6a10, glow: 0.9 };
  const flameSpots: THREE.Vector3[] = [];
  for (const s of [-1, 1]) {
    const coneM = new THREE.Matrix4().compose(new THREE.Vector3(s * 0.95, 0.7, -ROCKET.padRadius - 0.6), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.5, 0, 0)), new THREE.Vector3(1, 1, 1));
    base.push(finish(new THREE.CylinderGeometry(0.3, 0.7, 1.2, 20).applyMatrix4(coneM), coneFinish));
    base.push(finish(new THREE.TorusGeometry(0.31, 0.08, 8, 20).rotateX(Math.PI / 2).translate(0, 0.6, 0).applyMatrix4(coneM), std(DARK, 0.55, 0.4)));
    flameSpots.push(new THREE.Vector3(0, 1.05, 0).applyMatrix4(coneM));
  }
  const baseMesh = new THREE.Mesh(keep(mergeFinished(base)), material);
  baseMesh.name = 'rocketPad-base';
  baseMesh.receiveShadow = true;
  group.add(baseMesh);

  // Plate: dark slate with a bright rim and a big bright (unlit) arrow with a dark outline.
  const plate = new THREE.Group();
  plate.position.y = ROCKET.padTop - 0.14;
  const plateGeo = mergeFinished([
    finish(new THREE.CylinderGeometry(ROCKET.padRadius, ROCKET.padRadius, 0.18, 36), std(0x2f3a5a, 0.5)),
    finish(placed(new THREE.TorusGeometry(ROCKET.padRadius, 0.11, 10, 48).rotateX(Math.PI / 2), 0, 0.09, 0), std(BRIGHT, 0.4)),
    finish(placed(new THREE.ShapeGeometry(arrowShape()).rotateX(-Math.PI / 2), 0, 0.095, 0, 0, 0, 0, ROCKET.padRadius * 0.86), unlit(NAVY)),
    finish(placed(new THREE.ShapeGeometry(arrowShape()).rotateX(-Math.PI / 2), 0, 0.105, 0, 0, 0, 0, ROCKET.padRadius * 0.68), unlit(YELLOW)),
  ]);
  const plateMesh = new THREE.Mesh(keep(plateGeo), material);
  plateMesh.name = 'rocketPad-plate';
  plateMesh.receiveShadow = true;
  plate.add(plateMesh);
  group.add(plate);

  // Two big coil springs on posts either side of the plate (one mesh; they squash together).
  const springs = new THREE.Group();
  springs.position.set(0, 0.15, -0.3);
  const springParts: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const x = s * (ROCKET.padRadius + 0.75);
    springParts.push(finish(new THREE.TubeGeometry(new Helix(0.34, 1.5, 5), 90, 0.075, 6, false).translate(x, 0, 0), std(0xc9d1de, 0.35, 0.55)));
    springParts.push(finish(placed(new THREE.CylinderGeometry(0.5, 0.5, 0.14, 18), x, 1.55, 0), std(YELLOW)));
    springParts.push(finish(placed(new THREE.CylinderGeometry(0.5, 0.5, 0.14, 18), x, -0.02, 0), std(DARK)));
  }
  const springMesh = new THREE.Mesh(keep(mergeFinished(springParts)), material);
  springMesh.name = 'rocketPad-springs';
  springMesh.receiveShadow = true;
  springs.add(springMesh);
  group.add(springs);

  // Flame sprites at the thruster mouths (hidden until a launch).
  const flames: THREE.Sprite[] = [];
  const flameMat = keep(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  for (const p of flameSpots) {
    const flame = new THREE.Sprite(flameMat.clone());
    flame.position.copy(p);
    flame.scale.setScalar(0.1);
    flame.visible = false;
    group.add(flame);
    flames.push(flame);
  }

  // Floating glowing arrow showing the launch direction (bobs; both-eye, unlit so always bright).
  const arrow = new THREE.Group();
  const arrowColor = (g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry => {
    const c = new THREE.Color(hex);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g.deleteAttribute('uv');
    return g;
  };
  const arrowGeo = mergeFinished([
    arrowColor(placed(new THREE.ShapeGeometry(arrowShape()).rotateX(-Math.PI / 2), 0, 0, 0, 0, 0, 0, 1.55), NAVY),
    arrowColor(placed(new THREE.ShapeGeometry(arrowShape()).rotateX(-Math.PI / 2), 0, 0.02, 0, 0, 0, 0, 1.2), 0xfff08a),
  ]);
  const arrowMesh = new THREE.Mesh(keep(arrowGeo), keep(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  arrowMesh.name = 'rocketPad-arrow';
  arrow.add(arrowMesh);
  arrow.position.y = 3.6;
  group.add(arrow);

  // Shadow proxy: base ring, thrusters, springs and plate as a few coarse solids (static).
  const proxy: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(baseR, baseR, 0.34, 16).translate(0, 0.17, 0)];
  proxy.push(new THREE.CylinderGeometry(ROCKET.padRadius - 0.05, ROCKET.padRadius - 0.05, 0.16, 16).translate(0, ROCKET.padTop - 0.14, 0));
  for (const s of [-1, 1]) {
    proxy.push(new THREE.CylinderGeometry(0.26, 0.64, 1.1, 8).rotateX(-0.5).translate(s * 0.95, 0.7, -ROCKET.padRadius - 0.6));
    proxy.push(new THREE.CylinderGeometry(0.36, 0.36, 1.6, 8).translate(s * (ROCKET.padRadius + 0.75), 0.95, -0.3));
  }
  group.add(asShadowProxy(new THREE.Mesh(keep(mergeFinished(proxy.map((g) => g.toNonIndexed()))))));

  return {
    group,
    plate,
    springs: [springs],
    arrow,
    flames,
    dispose() {
      for (const d of disposables) d.dispose();
      for (const f of flames) (f.material as THREE.Material).dispose();
    },
  };
}

export interface NetModel {
  group: THREE.Group;
  /** The inflated cushion (squashes on a landing). */
  dome: THREE.Mesh;
  /** Pole flag etc. that spins/flutters. */
  flag: THREE.Object3D;
  dispose(): void;
}

/** Inflatable cushion with a bullseye: hard bright/dark rings on top, a fat bright rim, a tall pole. */
export function buildNet(): NetModel {
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(d: T): T => {
    disposables.push(d);
    return d;
  };
  const group = new THREE.Group();
  const R = NET.radius;
  const H = NET.height;

  // Profile from the centre out; band edges are duplicated points so the colours stay hard.
  const bands = [
    { to: 0.16, c: YELLOW },
    { to: 0.34, c: NAVY },
    { to: 0.54, c: BRIGHT },
    { to: 0.74, c: NAVY },
    { to: 0.9, c: BRIGHT },
  ];
  const top = (f: number): number => H - 0.45 * f * f;
  const pts: THREE.Vector2[] = [];
  const cols: THREE.Color[] = [];
  let from = 0;
  for (const b of bands) {
    const c = new THREE.Color(b.c);
    const steps = 4;
    for (let i = 0; i <= steps; i++) {
      const f = from + ((b.to - from) * i) / steps;
      pts.push(new THREE.Vector2(f * R, top(f)));
      cols.push(c);
    }
    from = b.to;
  }
  // Fat rounded rim down to the ground, bright yellow.
  const rimC = new THREE.Color(YELLOW);
  for (let i = 1; i <= 8; i++) {
    const a = (i / 8) * Math.PI * 0.5;
    pts.push(new THREE.Vector2(0.9 * R + Math.sin(a) * (0.1 * R + 0.5), top(0.9) * Math.cos(a)));
    cols.push(rimC);
  }
  const seg = 64;
  const lathe = new THREE.LatheGeometry(pts, seg);
  const colArr = new Float32Array(lathe.getAttribute('position').count * 3);
  for (let s = 0; s <= seg; s++) {
    for (let j = 0; j < pts.length; j++) {
      const c = cols[j];
      colArr.set([c.r, c.g, c.b], (s * pts.length + j) * 3);
    }
  }
  lathe.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
  lathe.computeVertexNormals();
  keep(lathe);
  const dome = new THREE.Mesh(lathe, keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, side: THREE.DoubleSide })));
  dome.receiveShadow = true;
  group.add(dome);
  // Shadow proxy: a coarse lathe just inside the cushion (child of the dome, so it squashes too).
  const proxyPts = pts.filter((_, i) => i % 3 === 0 || i === pts.length - 1).map((p) => new THREE.Vector2(p.x * 0.97, p.y * 0.95));
  dome.add(asShadowProxy(new THREE.Mesh(keep(new THREE.LatheGeometry(proxyPts, 16)))));

  // Tall pole with a striped flag so the net is visible across the park: pole + ball one mesh.
  const poleParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) poleParts.push(finish(placed(new THREE.CylinderGeometry(0.2, 0.24, 1.45, 12), R + 0.9, 0.72 + i * 1.45, 0), std(i % 2 === 0 ? BRIGHT : NAVY, 0.5)));
  poleParts.push(finish(placed(new THREE.SphereGeometry(0.5, 14, 10), R + 0.9, 13.3, 0), std(YELLOW, 0.4)));
  const pole = new THREE.Mesh(keep(mergeFinished(poleParts)), sharedPadMaterial());
  pole.name = 'net-pole';
  pole.castShadow = true;
  group.add(pole);
  const flag = new THREE.Group();
  flag.position.set(R + 0.9, 11.9, 0);
  const flagGeo = mergeFinished([
    finish(placed(new THREE.PlaneGeometry(4.6, 2.2, 6, 1), 2.3, 0, 0), std(YELLOW, 0.6)),
    finish(placed(new THREE.PlaneGeometry(1.5, 2.2), 1.0, 0, 0.01), std(NAVY, 0.6)),
  ]);
  flag.add(new THREE.Mesh(keep(flagGeo), sharedFlagMaterial()));
  group.add(flag);

  return {
    group,
    dome,
    flag,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
