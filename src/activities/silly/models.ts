/**
 * Silly Zone props (both-eye, procedural, bright/dark brightness contrast so they read in R-only
 * and G-only): beach ball, bumper mushrooms, wobbly tube characters (instanced), the FLOP button,
 * the see-saw with its jelly counterweight, and the floor mats.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Kit } from '../bungee/kit';
import { SILLY } from './logic';

export const COL = {
  navy: 0x1b2252,
  ink: 0x14161f,
  cream: 0xfff1cf,
  white: 0xffffff,
  yellow: 0xffd23f,
  sky: 0x9fe3ff,
  pink: 0xff9ed8,
  lime: 0xc8f26a,
} as const;

// ───────────────────────────── Beach ball ─────────────────────────────

export function createBallMesh(): THREE.Mesh {
  const r = SILLY.ball.radius;
  const geo = new THREE.SphereGeometry(r, 48, 32);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const gores = [COL.white, COL.navy, COL.yellow, COL.navy, COL.sky, COL.navy];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (Math.abs(y) > r * 0.9) c.set(COL.white);
    else if (Math.abs(y) > r * 0.86) c.set(COL.ink);
    else {
      const a = Math.atan2(z, x) + Math.PI;
      c.set(gores[Math.floor((a / (Math.PI * 2)) * 6 + 1e-6) % 6]);
    }
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3 }));
  mesh.name = 'silly-ball';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ───────────────────────────── Bumper mushrooms ─────────────────────────────

export interface MushroomModel {
  /** Everything static (stems, bases), one merged mesh group. */
  stems: THREE.Group;
  /** One spinning cap per mushroom (centred on its axis, at its base height). */
  caps: THREE.Group[];
}

export function createMushrooms(spots: readonly THREE.Vector3[]): MushroomModel {
  const b = SILLY.bumper;
  const k = new Kit();
  for (const p of spots) {
    k.cyl('matte', COL.navy, p.x, p.y + 0.06, p.z, 1.5, 0.12, 28);
    k.add('gloss', new THREE.CylinderGeometry(0.38, 0.55, b.top - 0.55, 18), COL.cream, k.t(p.x, p.y + (b.top - 0.55) / 2, p.z));
    k.add('matte', new THREE.TorusGeometry(0.47, 0.07, 8, 20), COL.navy, k.t(p.x, p.y + 0.55, p.z, Math.PI / 2));
  }
  const stems = k.build('silly-mushroom-stems');
  const caps = spots.map((p, i) => {
    const kc = new Kit();
    const dark = i % 2 === 1;
    const capCol = dark ? COL.navy : COL.yellow;
    const spotCol = dark ? COL.cream : COL.navy;
    kc.add('gloss', new THREE.SphereGeometry(1, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), capCol, kc.t(0, 0, 0, 0, 0, 0, b.capRadius, 0.78, b.capRadius));
    kc.add('gloss', new THREE.TorusGeometry(b.capRadius, 0.16, 10, 36), dark ? COL.yellow : COL.ink, kc.t(0, 0.02, 0, Math.PI / 2));
    kc.add('matte', new THREE.CircleGeometry(b.capRadius, 32), COL.cream, kc.t(0, -0.01, 0, Math.PI / 2));
    // Spots on the cap surface (they show the spin).
    for (let s = 0; s < 7; s++) {
      const a = (s / 7) * Math.PI * 2 + i;
      const el = s % 2 ? 0.55 : 0.95;
      const nx = Math.cos(a) * Math.cos(el);
      const ny = Math.sin(el);
      const nz = Math.sin(a) * Math.cos(el);
      const g = new THREE.SphereGeometry(0.24, 12, 8);
      const n = new THREE.Vector3(nx * b.capRadius, ny * 0.78, nz * b.capRadius);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx / b.capRadius, ny / 0.78, nz / b.capRadius).normalize());
      kc.add('gloss', g, spotCol, new THREE.Matrix4().compose(n, q, new THREE.Vector3(1, 0.3, 1)));
    }
    kc.add('gloss', new THREE.SphereGeometry(0.28, 12, 8), spotCol, kc.t(0, 0.74, 0, 0, 0, 0, 1, 0.45, 1));
    const cap = kc.build(`silly-mushroom-cap${i}`);
    cap.position.set(p.x, p.y + b.top - 0.78, p.z);
    return cap;
  });
  return { stems, caps };
}

// ───────────────────────────── Tube characters ─────────────────────────────

export interface TubeModels {
  root: THREE.Group;
  body: THREE.InstancedMesh;
  arms: THREE.InstancedMesh;
  eyes: THREE.InstancedMesh;
  pupils: THREE.InstancedMesh;
  mouths: THREE.InstancedMesh;
}

/** Instanced parts for `count` tube characters, coloured in bright/dark bands. */
export function createTubes(count: number, bases: readonly THREE.Vector3[], yaws: readonly number[]): TubeModels {
  const segs = SILLY.tube.segments;
  const root = new THREE.Group();
  root.name = 'silly-tubes';
  const bodyMat = new THREE.MeshStandardMaterial({ roughness: 0.42 });
  const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.34, SILLY.tube.segLen, 6, 14), bodyMat, count * segs);
  const arms = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.12, 0.42, 4, 8), bodyMat, count * 4);
  const eyes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 12, 8), new THREE.MeshStandardMaterial({ color: COL.white, roughness: 0.3 }), count * 2);
  const pupils = new THREE.InstancedMesh(new THREE.SphereGeometry(0.055, 10, 6), new THREE.MeshStandardMaterial({ color: COL.ink, roughness: 0.4 }), count * 2);
  const mouths = new THREE.InstancedMesh(new THREE.TorusGeometry(0.11, 0.03, 6, 14, Math.PI), new THREE.MeshStandardMaterial({ color: COL.ink, roughness: 0.6 }), count);
  const schemes: [number, number][] = [
    [COL.yellow, COL.navy],
    [COL.sky, COL.ink],
    [COL.pink, COL.navy],
    [COL.lime, COL.ink],
    [COL.cream, COL.navy],
  ];
  const c = new THREE.Color();
  for (let t = 0; t < count; t++) {
    const [light, dark] = schemes[t % schemes.length];
    for (let i = 0; i < segs; i++) body.setColorAt(t * segs + i, c.set(i === segs - 1 ? light : i % 2 ? dark : light));
    for (let a = 0; a < 4; a++) arms.setColorAt(t * 4 + a, c.set(a % 2 ? light : dark));
  }
  for (const m of [body, arms, eyes, pupils, mouths]) {
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.castShadow = m === body || m === arms;
    m.frustumCulled = false;
    root.add(m);
  }
  // Blower bases (static).
  const k = new Kit();
  bases.forEach((p, i) => {
    k.add('gloss', new THREE.CylinderGeometry(0.62, 0.72, 0.5, 20), COL.navy, k.t(p.x, p.y + 0.25, p.z));
    k.add('matte', new THREE.TorusGeometry(0.62, 0.08, 8, 24), COL.yellow, k.t(p.x, p.y + 0.5, p.z, Math.PI / 2));
    // A vent grille on the front.
    for (let g = 0; g < 3; g++) {
      const yaw = yaws[i];
      k.box('matte', COL.cream, p.x + Math.sin(yaw) * 0.66, p.y + 0.15 + g * 0.11, p.z + Math.cos(yaw) * 0.66, 0.5, 0.05, 0.04, 0, yaw, 0);
    }
  });
  root.add(k.build('silly-tube-bases'));
  return { root, body, arms, eyes, pupils, mouths };
}

// ───────────────────────────── FLOP button ─────────────────────────────

function flopTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#ffd23f';
    g.fillRect(0, 0, 256, 256);
    // Starburst rays (dark on bright).
    g.fillStyle = '#1b2252';
    for (let i = 0; i < 16; i++) {
      g.save();
      g.translate(128, 128);
      g.rotate((i / 16) * Math.PI * 2);
      g.beginPath();
      g.moveTo(-8, 70);
      g.lineTo(8, 70);
      g.lineTo(0, 128);
      g.fill();
      g.restore();
    }
    g.beginPath();
    g.arc(128, 128, 72, 0, Math.PI * 2);
    g.fill();
    // The game's flop icon (a tumble arrow), bright on the dark disc.
    g.save();
    g.translate(128 - 60, 128 - 60);
    g.scale(5, 5);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const arc = new Path2D('M20 12a8 8 0 1 1-2.5-5.8');
    g.strokeStyle = '#fff1cf';
    g.lineWidth = 3.2;
    g.stroke(arc);
    g.fillStyle = '#fff1cf';
    g.fill(new Path2D('M14.5 2.5l5.5.5-.5 5.5z'));
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export interface FlopButtonModel {
  base: THREE.Group;
  cap: THREE.Mesh;
}

export function createFlopButton(p: THREE.Vector3): FlopButtonModel {
  const r = SILLY.flop.radius;
  const k = new Kit();
  k.cyl('matte', COL.navy, p.x, p.y + 0.03, p.z, r + 0.45, 0.06, 40);
  k.add('matte', new THREE.TorusGeometry(r + 0.3, 0.09, 8, 40), COL.cream, k.t(p.x, p.y + 0.06, p.z, Math.PI / 2));
  // Dotted ring of bright studs around it.
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    k.cyl('gloss', i % 2 ? COL.yellow : COL.cream, p.x + Math.cos(a) * (r + 0.95), p.y + 0.04, p.z + Math.sin(a) * (r + 0.95), 0.16, 0.08, 10);
  }
  const base = k.build('silly-flop-base');
  const side = new THREE.MeshStandardMaterial({ color: COL.ink, roughness: 0.5 });
  const top = new THREE.MeshStandardMaterial({ map: flopTexture(), roughness: 0.4 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.24, 40), [side, top, side]);
  cap.name = 'silly-flop-button';
  cap.position.set(p.x, p.y + 0.06 + 0.12, p.z);
  cap.castShadow = true;
  cap.receiveShadow = true;
  return { base, cap };
}

// ───────────────────────────── See-saw ─────────────────────────────

export interface SeesawModel {
  fixed: THREE.Group;
  /** Plank pivot (rotation.z tilts it; +Z up at the +X end). */
  plank: THREE.Group;
  jelly: THREE.Group;
  /** Jelly face (wobble target). */
  jellyBody: THREE.Mesh;
}

export const SEESAW = { half: 3.2, pivotY: 0.85, pedestal: 1.25 } as const;

export function createSeesaw(): SeesawModel {
  const { half, pivotY, pedestal } = SEESAW;
  const k = new Kit();
  // Fulcrum: a chunky striped wedge.
  k.add('gloss', new THREE.CylinderGeometry(0.2, 0.75, pivotY, 3, 1), COL.navy, k.t(0, pivotY / 2, 0, 0, Math.PI / 2, 0, 1, 1, 1.4));
  k.cyl('metal', COL.cream, 0, pivotY, 0, 0.12, 1.2, 12, Math.PI / 2);
  // Jelly pedestal beside the high end.
  k.cyl('gloss', COL.navy, half + 0.2, pedestal / 2, 1.7, 0.6, pedestal, 20);
  k.add('matte', new THREE.TorusGeometry(0.6, 0.07, 8, 20), COL.yellow, k.t(half + 0.2, pedestal, 1.7, Math.PI / 2));
  // Floor mat with chevrons pointing the way you fly (−X).
  k.box('matte', COL.navy, -half - 3.5, 0.015, 0, 5.5, 0.03, 2.2);
  for (let i = 0; i < 4; i++) {
    for (const s of [-1, 1]) k.box('matte', COL.yellow, -half - 1.6 - i * 1.3, 0.035, s * 0.42, 0.22, 0.02, 0.95, 0, s * 0.75, 0);
  }
  const fixed = k.build('silly-seesaw-fixed');

  const plank = new THREE.Group();
  plank.position.y = pivotY;
  const kp = new Kit();
  const n = 8;
  for (let i = 0; i < n; i++) kp.box('matte', i % 2 ? COL.cream : COL.yellow, -half + ((i + 0.5) * 2 * half) / n, 0, 0, (2 * half) / n, 0.16, 0.95);
  // The cup (−X end): a ring you stand in.
  kp.add('gloss', new THREE.TorusGeometry(0.62, 0.12, 8, 24), COL.ink, kp.t(-half + 0.55, 0.12, 0, Math.PI / 2));
  kp.cyl('matte', COL.navy, -half + 0.55, 0.09, 0, 0.62, 0.04, 24);
  // Stomp pad (+X end).
  kp.cyl('gloss', COL.navy, half - 0.6, 0.11, 0, 0.55, 0.06, 20);
  plank.add(kp.build('silly-seesaw-plank'));

  const jelly = new THREE.Group();
  const jellyBody = new THREE.Mesh(new RoundedBoxGeometry(1.2, 1.1, 1.2, 4, 0.28), new THREE.MeshStandardMaterial({ color: COL.pink, roughness: 0.25, emissive: 0x220011 }));
  jellyBody.position.y = 0.55;
  jellyBody.castShadow = true;
  jelly.add(jellyBody);
  const kf = new Kit();
  for (const s of [-1, 1]) {
    kf.add('gloss', new THREE.SphereGeometry(0.13, 12, 8), COL.white, kf.t(s * 0.22, 0.68, 0.6));
    kf.add('gloss', new THREE.SphereGeometry(0.065, 10, 6), COL.ink, kf.t(s * 0.22, 0.68, 0.71));
  }
  kf.add('matte', new THREE.TorusGeometry(0.16, 0.04, 6, 16, Math.PI), COL.ink, kf.t(0, 0.45, 0.61, 0, 0, Math.PI));
  const face = kf.build('silly-jelly-face', false);
  jellyBody.add(face);
  face.position.y = -0.55;
  return { fixed, plank, jelly, jellyBody };
}

// ───────────────────────────── Floor dressing ─────────────────────────────

/** Mats under the attractions (inside the anchor radius only). */
export function createFloorDressing(mushrooms: readonly THREE.Vector3[]): THREE.Group {
  const k = new Kit();
  if (mushrooms.length > 1) {
    const a = mushrooms[0];
    const b = mushrooms[mushrooms.length - 1];
    const cx = (a.x + b.x) / 2;
    const cz = (a.z + b.z) / 2;
    const len = Math.hypot(b.x - a.x, b.z - a.z) + 4;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    k.box('matte', COL.navy, cx, a.y + 0.012, cz, 3.6, 0.02, len, 0, yaw, 0);
    for (let i = 0; i < Math.floor(len / 0.9); i++) {
      const t = (i + 0.5) / Math.floor(len / 0.9) - 0.5;
      for (const s of [-1, 1]) {
        k.cyl('matte', COL.cream, cx + Math.sin(yaw) * t * len + Math.cos(yaw) * s * 1.55, a.y + 0.026, cz + Math.cos(yaw) * t * len - Math.sin(yaw) * s * 1.55, 0.13, 0.01, 10);
      }
    }
  }
  return k.build('silly-floor', false);
}
