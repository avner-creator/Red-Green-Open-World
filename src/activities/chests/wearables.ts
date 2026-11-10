/**
 * Procedural wearables for the robot (seen close-up from the third-person camera). Authored in
 * metres at the attach anchor: +Y up, +Z forward, origin on the body part. All are both-eye objects
 * with strong brightness separation from the robot's light body (dark leather, deep blue, brass).
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { merge, noise, paint } from './bake';

export interface Wearable {
  object: THREE.Object3D;
  /** Called every frame while worn. `speed` is the player's speed in m/s. */
  update?(dt: number, speed: number): void;
  dispose(): void;
}

export const LIGHT = new THREE.Vector3(0.45, 0.8, 0.4).normalize();

export function lit(hex: number, ambient = 0.55, k = 1): (x: number, y: number, z: number, nx: number, ny: number, nz: number) => THREE.Color {
  const c = new THREE.Color(hex);
  return (_x, _y, _z, nx, ny, nz) => {
    const d = Math.max(0, nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z);
    const s = (ambient + (1 - ambient) * d + 0.25 * Math.max(0, ny)) * k;
    return new THREE.Color(Math.min(1, c.r * s), Math.min(1, c.g * s), Math.min(1, c.b * s));
  };
}

export function disposer(geos: THREE.BufferGeometry[], mats: THREE.Material[], extra: { dispose(): void }[] = []): () => void {
  return () => {
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
    for (const e of extra) e.dispose();
  };
}

export function std(opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.05, ...opts });
}

export function mesh(g: THREE.BufferGeometry, m: THREE.Material, cast = true): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.castShadow = cast;
  return o;
}

// ───────────────────────────── Explorer hat ─────────────────────────────

export function buildExplorerHat(): Wearable {
  // Lathe profile (radius, height): wide brim that curls up at the edge, a pinched crown.
  const pts = [
    [0.0, 0.2], [0.07, 0.205], [0.15, 0.198], [0.19, 0.178], [0.212, 0.13], [0.218, 0.05], [0.222, 0.02],
    [0.3, 0.012], [0.37, 0.03], [0.41, 0.058], [0.412, 0.046], [0.375, 0.012], [0.3, -0.008], [0.2, -0.012],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const felt = paint(new THREE.LatheGeometry(pts, 40), (x, y, z, nx, ny, nz) => {
    const base = lit(0x6e3f1a, 0.5, 1.05)(x, y, z, nx, ny, nz);
    const under = y < 0.005 ? 0.55 : 1;
    const speck = 0.94 + 0.1 * noise(Math.floor(Math.atan2(x, z) * 40) + Math.floor(y * 90));
    return base.multiplyScalar(under * speck);
  });
  const bandPts = [[0.2175, 0.026], [0.2265, 0.03], [0.2265, 0.078], [0.2185, 0.082]].map(([r, y]) => new THREE.Vector2(r, y));
  const band = paint(new THREE.LatheGeometry(bandPts, 40), lit(0xf2d27a, 0.6));
  const buckle = paint(new RoundedBoxGeometry(0.07, 0.05, 0.014, 2, 0.006).translate(0, 0.054, 0.228), lit(0xffe07a, 0.7, 1.1));
  const buckleHole = paint(new RoundedBoxGeometry(0.036, 0.02, 0.016, 2, 0.004).translate(0, 0.054, 0.229), lit(0x3a2208, 0.9, 0.6));
  const geo = merge([felt, band, buckle, buckleHole]);
  const mat = std({ side: THREE.DoubleSide, roughness: 0.85 });
  const g = new THREE.Group();
  g.add(mesh(geo, mat));
  g.position.y = -0.065;
  g.rotation.x = -0.06; // tipped back a little: friendly, shows the face
  return { object: g, dispose: disposer([geo], [mat]) };
}

// ───────────────────────────── Party hat ─────────────────────────────

export function buildPartyHat(): Wearable {
  const H = 0.46;
  const R = 0.18;
  const cone = new THREE.ConeGeometry(R, H, 28, 8, true).translate(0, H / 2, 0);
  const yellow = new THREE.Color(0xffd21f);
  const blue = new THREE.Color(0x1d3fd0);
  const dot = new THREE.Color(0xffffff);
  const stripes = paint(cone, (x, y, z, nx, ny, nz) => {
    const ang = Math.atan2(x, z) / (Math.PI * 2);
    const u = (ang + (y / H) * 1.4) * 5;
    const stripe = Math.floor(u + 100) % 2 === 0;
    const base = stripe ? yellow : blue;
    const fu = u - Math.floor(u);
    const isDot = stripe && fu > 0.42 && fu < 0.58 && Math.abs(((y / H) * 9) % 1 - 0.5) < 0.18;
    const c = isDot ? dot : base;
    const d = Math.max(0, nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z);
    const s = 0.62 + 0.55 * d;
    return new THREE.Color(Math.min(1, c.r * s), Math.min(1, c.g * s), Math.min(1, c.b * s));
  });
  const rim = paint(new THREE.TorusGeometry(R, 0.022, 8, 28).rotateX(Math.PI / 2), lit(0xffffff, 0.7));
  const pom = paint(new THREE.IcosahedronGeometry(0.062, 1).translate(0, H + 0.01, 0), lit(0xff5fb4, 0.65, 1.1));
  const sparks: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    sparks.push(paint(new THREE.IcosahedronGeometry(0.018, 0).translate(Math.cos(a) * 0.075, H + 0.01 + Math.sin(a * 2) * 0.03, Math.sin(a) * 0.075), lit(0xffffff, 0.8)));
  }
  const geo = merge([stripes, rim, pom, ...sparks]);
  const mat = std({ side: THREE.DoubleSide, roughness: 0.6 });
  const g = new THREE.Group();
  g.add(mesh(geo, mat));
  g.position.set(0.03, -0.07, 0);
  g.rotation.set(-0.16, 0, -0.14); // jaunty tilt
  return { object: g, dispose: disposer([geo], [mat]) };
}

// ───────────────────────────── Hero cape ─────────────────────────────

export interface CapeSpec {
  /** Cloth gradient (top, bottom), CSS colours. */
  top: string;
  bottom: string;
  trim: string;
  trimDark: string;
  emblem: 'star' | 'flame' | 'bolt';
  emblemFill: string;
  emblemStroke: string;
}

export const HERO_CAPE: CapeSpec = {
  top: '#2a3fd8', bottom: '#1a1f8c', trim: '#ffd24a', trimDark: '#c88a14', emblem: 'star', emblemFill: '#ffe36e', emblemStroke: '#c88a14',
};

function capeTexture(spec: CapeSpec): THREE.CanvasTexture {
  const w = 128;
  const h = 192;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (g) {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, spec.top);
    grad.addColorStop(1, spec.bottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    g.fillStyle = spec.trim;
    g.fillRect(0, h - 14, w, 14);
    g.fillRect(0, 0, 5, h);
    g.fillRect(w - 5, 0, 5, h);
    g.fillStyle = spec.trimDark;
    g.fillRect(0, h - 14, w, 3);
    g.fillStyle = spec.emblemFill;
    g.strokeStyle = spec.emblemStroke;
    g.lineWidth = 3;
    g.beginPath();
    if (spec.emblem === 'star') {
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 40 : 18;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const x = w / 2 + Math.cos(a) * r;
        const y = h * 0.42 + Math.sin(a) * r;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
    } else if (spec.emblem === 'bolt') {
      const cx = w / 2;
      const cy = h * 0.42;
      const pts: Array<[number, number]> = [[8, -48], [-22, 6], [-2, 6], [-14, 48], [26, -10], [4, -10], [20, -48]];
      pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(cx + x, cy + y) : g.lineTo(cx + x, cy + y)));
    } else {
      // Flame: three tongues rising from the hem of the emblem.
      const cx = w / 2;
      const cy = h * 0.5;
      g.moveTo(cx - 36, cy + 34);
      g.quadraticCurveTo(cx - 40, cy - 6, cx - 18, cy - 30);
      g.quadraticCurveTo(cx - 16, cy - 8, cx - 8, cy - 4);
      g.quadraticCurveTo(cx - 6, cy - 40, cx + 2, cy - 56);
      g.quadraticCurveTo(cx + 12, cy - 30, cx + 20, cy - 12);
      g.quadraticCurveTo(cx + 26, cy - 22, cx + 28, cy - 30);
      g.quadraticCurveTo(cx + 46, cy, cx + 36, cy + 34);
    }
    g.closePath();
    g.fill();
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildClothCape(spec: CapeSpec): Wearable {
  const NX = 14;
  const NY = 20;
  const L = 0.95;
  const top = 0.36;
  const geo = new THREE.PlaneGeometry(1, 1, NX, NY);
  const pos = geo.getAttribute('position');
  const tex = capeTexture(spec);
  const mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 });
  const cloth = mesh(geo, mat);
  cloth.frustumCulled = false;

  let t = 0;
  let lag = 0; // smoothed speed (how far the cape trails)
  const shape = (speed: number): void => {
    lag += (speed - lag) * 0.08;
    const k = Math.min(1, lag / 8);
    for (let i = 0; i < pos.count; i++) {
      const u = (i % (NX + 1)) / NX - 0.5; // -0.5..0.5
      const v = Math.floor(i / (NX + 1)) / NY; // 0 top .. 1 hem
      const width = 0.3 + 0.17 * v;
      const x = u * 2 * width + Math.sin(t * 2.2 + v * 3) * 0.02 * v * (0.4 + k);
      const y = top - v * L;
      const ripple = Math.sin(t * 5.5 + v * 5 + u * 6) * (0.012 + 0.04 * k) * v;
      const trail = (0.05 + 0.1 * v * v) + k * 0.5 * Math.pow(v, 1.4) + 0.025 * Math.sin(t * 1.7 + u * 3) * v;
      const z = -(0.06 + trail) + ripple;
      pos.setXYZ(i, x, y - k * 0.1 * v * v, z);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
  };
  shape(0);

  const collarGeo = merge([
    paint(new RoundedBoxGeometry(0.66, 0.06, 0.1, 2, 0.02).translate(0, top, -0.04), lit(0xffd24a, 0.6, 1.1)),
    paint(new THREE.SphereGeometry(0.042, 10, 8).translate(0.27, top, 0.0), lit(0xffe36e, 0.7, 1.1)),
    paint(new THREE.SphereGeometry(0.042, 10, 8).translate(-0.27, top, 0.0), lit(0xffe36e, 0.7, 1.1)),
    paint(new THREE.TorusGeometry(0.31, 0.022, 6, 20, Math.PI).rotateZ(Math.PI).translate(0, top - 0.01, 0.0), lit(0xffd24a, 0.6, 1.1)),
  ]);
  const collarMat = std({ roughness: 0.4, metalness: 0.3 });
  const collar = mesh(collarGeo, collarMat);

  const g = new THREE.Group();
  g.add(cloth, collar);
  return {
    object: g,
    update(dt, speed) {
      t += dt;
      shape(speed);
    },
    dispose: disposer([geo, collarGeo], [mat, collarMat], [tex]),
  };
}

export function buildCape(): Wearable {
  return buildClothCape(HERO_CAPE);
}

// ───────────────────────────── Star glasses ─────────────────────────────

function starPath(r: number, inner: number, rot = 0): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * inner;
    const a = Math.PI / 2 + rot + (i * Math.PI) / 5;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath();
  return s;
}

export function buildStarGlasses(): Wearable {
  const frameParts: THREE.BufferGeometry[] = [];
  const lensParts: THREE.BufferGeometry[] = [];
  const gold = lit(0xffd21f, 0.65, 1.1);
  const dx = 0.125;
  for (const sx of [-1, 1]) {
    const outer = starPath(0.105, 0.5);
    const hole = new THREE.Path();
    const inner = starPath(0.062, 0.5);
    hole.setFromPoints(inner.getPoints().reverse());
    outer.holes.push(hole);
    const frame = new THREE.ExtrudeGeometry(outer, { depth: 0.026, bevelEnabled: true, bevelSize: 0.006, bevelThickness: 0.006, bevelSegments: 1 });
    frame.translate(sx * dx, 0, -0.013);
    frameParts.push(paint(frame, gold));
    const lens = new THREE.ShapeGeometry(starPath(0.064, 0.5)).translate(sx * dx, 0, 0);
    lensParts.push(paint(lens, new THREE.Color(0xbfeaff)));
    // Temple arm going back to the ear.
    frameParts.push(paint(new RoundedBoxGeometry(0.02, 0.022, 0.26, 2, 0.008).translate(sx * (dx + 0.1), 0.01, -0.13), gold));
  }
  frameParts.push(paint(new RoundedBoxGeometry(0.075, 0.026, 0.026, 2, 0.01).translate(0, 0.02, 0), gold));
  const frameGeo = merge(frameParts);
  const lensGeo = merge(lensParts);
  const frameMat = std({ roughness: 0.35, metalness: 0.2, emissive: 0x3a2800 });
  const lensMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.38, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false });
  const g = new THREE.Group();
  g.add(mesh(frameGeo, frameMat), mesh(lensGeo, lensMat, false));
  g.position.z = 0.03;
  return { object: g, dispose: disposer([frameGeo, lensGeo], [frameMat, lensMat]) };
}

export function buildWearable(id: string): Wearable | null {
  switch (id) {
    case 'hat-explorer':
      return buildExplorerHat();
    case 'hat-party':
      return buildPartyHat();
    case 'cape-hero':
      return buildCape();
    case 'glasses-star':
      return buildStarGlasses();
    default:
      return null;
  }
}

