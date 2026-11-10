/**
 * Procedural models for the rocket pad and the landing net. Everything is both-eye: bright and
 * dark bands (never hue alone) so each reads in the red channel and in the green channel.
 */
import * as THREE from 'three';
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

export function buildRocketPad(): RocketPadModel {
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(d: T): T => {
    disposables.push(d);
    return d;
  };
  const std = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial =>
    keep(new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...extra }));
  const group = new THREE.Group();

  // Striped base ring (hazard stripes) and a dark disc under the plate.
  const baseR = ROCKET.padRadius + 0.5;
  const ring = new THREE.Mesh(keep(stripedRing(baseR, 0.34, 12, YELLOW, DARK)), keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })));
  ring.position.y = 0.17;
  ring.castShadow = ring.receiveShadow = true;
  const disc = new THREE.Mesh(keep(new THREE.CylinderGeometry(baseR, baseR + 0.1, 0.3, 32)), std(DARK, { roughness: 0.8 }));
  disc.position.y = 0.15;
  disc.receiveShadow = true;
  group.add(disc, ring);

  // Plate: dark slate with a bright rim and a big bright arrow with a dark outline.
  const plate = new THREE.Group();
  plate.position.y = ROCKET.padTop - 0.14;
  const plateTop = new THREE.Mesh(keep(new THREE.CylinderGeometry(ROCKET.padRadius, ROCKET.padRadius, 0.18, 36)), std(0x2f3a5a, { roughness: 0.5 }));
  plateTop.castShadow = plateTop.receiveShadow = true;
  const rim = new THREE.Mesh(keep(new THREE.TorusGeometry(ROCKET.padRadius, 0.11, 10, 48).rotateX(Math.PI / 2)), std(BRIGHT, { roughness: 0.4 }));
  rim.position.y = 0.09;
  const arrowGeo = keep(new THREE.ShapeGeometry(arrowShape()).rotateX(-Math.PI / 2));
  const outline = new THREE.Mesh(arrowGeo, keep(new THREE.MeshBasicMaterial({ color: NAVY })));
  outline.scale.setScalar(ROCKET.padRadius * 0.86);
  outline.position.y = 0.095;
  const inner = new THREE.Mesh(arrowGeo, keep(new THREE.MeshBasicMaterial({ color: YELLOW })));
  inner.scale.setScalar(ROCKET.padRadius * 0.68);
  inner.position.y = 0.105;
  plate.add(plateTop, rim, outline, inner);
  group.add(plate);

  // Two big coil springs on posts either side of the plate.
  const springs: THREE.Object3D[] = [];
  const coilGeo = keep(new THREE.TubeGeometry(new Helix(0.34, 1.5, 5), 90, 0.075, 6, false));
  const coilMat = std(0xc9d1de, { metalness: 0.55, roughness: 0.35 });
  const capGeo = keep(new THREE.CylinderGeometry(0.5, 0.5, 0.14, 18));
  const capMat = std(YELLOW);
  for (const s of [-1, 1]) {
    const sp = new THREE.Group();
    sp.position.set(s * (ROCKET.padRadius + 0.75), 0.15, -0.3);
    const coil = new THREE.Mesh(coilGeo, coilMat);
    coil.castShadow = true;
    const top = new THREE.Mesh(capGeo, capMat);
    top.position.y = 1.55;
    top.castShadow = true;
    const foot = new THREE.Mesh(capGeo, std(DARK));
    foot.position.y = -0.02;
    sp.add(coil, top, foot);
    group.add(sp);
    springs.push(sp);
  }

  // Thruster cones at the back (glowing orange, bright in both channels) with flame sprites.
  const flames: THREE.Sprite[] = [];
  const coneGeo = keep(new THREE.CylinderGeometry(0.42, 0.95, 1.7, 20));
  const coneMat = std(0xff8a1f, { emissive: 0xff6a10, emissiveIntensity: 0.9, roughness: 0.4 });
  const nozzleGeo = keep(new THREE.TorusGeometry(0.44, 0.1, 8, 20).rotateX(Math.PI / 2));
  const nozzleMat = std(DARK, { metalness: 0.4 });
  const flameMat = keep(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  for (const s of [-1, 1]) {
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(s * 1.05, 0.95, -ROCKET.padRadius - 0.95);
    cone.rotation.x = -0.35;
    cone.castShadow = true;
    const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
    nozzle.position.set(0, 0.85, 0);
    cone.add(nozzle);
    const flame = new THREE.Sprite(flameMat.clone());
    flame.position.set(0, 1.5, 0);
    flame.scale.setScalar(0.1);
    flame.visible = false;
    cone.add(flame);
    flames.push(flame);
    group.add(cone);
  }

  // Floating glowing arrow showing the launch direction (bobs; both-eye, unlit so always bright).
  const arrow = new THREE.Group();
  const aOut = new THREE.Mesh(keep(new THREE.ShapeGeometry(arrowShape()).rotateX(-Math.PI / 2)), keep(new THREE.MeshBasicMaterial({ color: NAVY, side: THREE.DoubleSide })));
  aOut.scale.setScalar(1.55);
  const aIn = new THREE.Mesh(aOut.geometry, keep(new THREE.MeshBasicMaterial({ color: 0xfff08a, side: THREE.DoubleSide })));
  aIn.scale.setScalar(1.2);
  aIn.position.y = 0.02;
  arrow.add(aOut, aIn);
  arrow.position.y = 3.6;
  group.add(arrow);

  return {
    group,
    plate,
    springs,
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
  dome.castShadow = dome.receiveShadow = true;
  group.add(dome);

  // Tall pole with a striped flag so the net is visible across the park.
  const pole = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.1, 0.14, 13, 10)), keep(new THREE.MeshStandardMaterial({ color: BRIGHT, roughness: 0.5 })));
  pole.position.set(R + 0.9, 6.5, 0);
  pole.castShadow = true;
  const ball = new THREE.Mesh(keep(new THREE.SphereGeometry(0.32, 14, 10)), keep(new THREE.MeshStandardMaterial({ color: YELLOW, roughness: 0.4 })));
  ball.position.set(R + 0.9, 13.1, 0);
  const flag = new THREE.Group();
  flag.position.set(R + 0.9, 12.2, 0);
  const flagGeo = keep(new THREE.PlaneGeometry(3.4, 1.6, 6, 1));
  const f1 = new THREE.Mesh(flagGeo, keep(new THREE.MeshStandardMaterial({ color: YELLOW, side: THREE.DoubleSide, roughness: 0.6 })));
  f1.position.set(1.7, 0, 0);
  const f2 = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.1, 1.6)), keep(new THREE.MeshStandardMaterial({ color: NAVY, side: THREE.DoubleSide, roughness: 0.6 })));
  f2.position.set(0.9, 0, 0.01);
  flag.add(f1, f2);
  group.add(pole, ball, flag);

  return {
    group,
    dome,
    flag,
    dispose() {
      for (const d of disposables) d.dispose();
    },
  };
}
