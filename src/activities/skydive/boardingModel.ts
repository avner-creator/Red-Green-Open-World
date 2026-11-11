/**
 * Balloon boarding dressing (both-eye): makes the balloon read as a ride from far away.
 *  - A ticket-booth arch over the walk-in path with a big picture sign (balloon + up arrow →
 *    parachute → landing target), candy-striped pillars and bunting.
 *  - A glowing "hop in here" pad right at the basket's open gate, with chevron arrows on the ground
 *    that scroll towards it (one textured strip: the arrows move, nothing else does).
 *  - The open gate on the basket (a dark doorway and a swung-open door), carried by the basket.
 * Bright/dark contrast throughout so it reads in R-only and G-only.
 *
 * Render cost: arch + pillars + bunting (Kit: 2 draws), sign 1, pad + arrow strip 1 (one texture),
 * gate 1 = 5 draws.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Kit, disposeTree } from '../bungee/kit';
import { BALLOON_DIMS } from './balloonModel';

const NAVY = '#16204a';
const INK = '#101320';
const CREAM = '#fff4dc';
const YEL = '#ffd23f';
const PINK = '#ff7fb6';
const SKY = '#9fe3ff';

export interface BoardingSpec {
  /** Deck centre on the ground (pad position) and deck top height above it. */
  pad: THREE.Vector3;
  deckTop: number;
  /** World yaw of the entrance direction (from the deck centre towards the arriving player). */
  yaw: number;
  /** Distance of the hop-in pad and of the arch from the deck centre. */
  padDist: number;
  padRadius: number;
  archDist: number;
  /** Ground height at a world (x, z). */
  heightAt(x: number, z: number): number;
}

export interface BoardingModel {
  readonly group: THREE.Group;
  /** Gate (add to the basket group; local to the basket floor centre). */
  readonly gate: THREE.Group;
  /** World position of the hop-in pad centre (on the deck). */
  readonly padCenter: THREE.Vector3;
  update(dt: number, glow: number): void;
  /** 0 = closed, 1 = open. */
  setGateOpen(k: number): void;
  setVisible(on: boolean): void;
  dispose(): void;
}

// ───────────────────────────── Textures ─────────────────────────────

function balloonIcon(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  // Envelope.
  g.beginPath();
  g.moveTo(x, y + 70 * s);
  g.bezierCurveTo(x - 80 * s, y + 10 * s, x - 70 * s, y - 80 * s, x, y - 80 * s);
  g.bezierCurveTo(x + 70 * s, y - 80 * s, x + 80 * s, y + 10 * s, x, y + 70 * s);
  g.fillStyle = YEL;
  g.fill();
  g.lineWidth = 9 * s;
  g.strokeStyle = INK;
  g.stroke();
  g.beginPath();
  g.moveTo(x, y - 80 * s);
  g.bezierCurveTo(x - 30 * s, y - 40 * s, x - 25 * s, y + 30 * s, x, y + 70 * s);
  g.moveTo(x, y - 80 * s);
  g.bezierCurveTo(x + 30 * s, y - 40 * s, x + 25 * s, y + 30 * s, x, y + 70 * s);
  g.stroke();
  // Ropes and basket.
  g.beginPath();
  g.moveTo(x - 18 * s, y + 66 * s);
  g.lineTo(x - 16 * s, y + 92 * s);
  g.moveTo(x + 18 * s, y + 66 * s);
  g.lineTo(x + 16 * s, y + 92 * s);
  g.lineWidth = 5 * s;
  g.stroke();
  g.fillStyle = CREAM;
  g.fillRect(x - 22 * s, y + 92 * s, 44 * s, 30 * s);
  g.strokeRect(x - 22 * s, y + 92 * s, 44 * s, 30 * s);
}

function upArrow(g: CanvasRenderingContext2D, x: number, y: number, s: number, col = CREAM): void {
  g.beginPath();
  g.moveTo(x, y - 60 * s);
  g.lineTo(x + 42 * s, y - 12 * s);
  g.lineTo(x + 16 * s, y - 12 * s);
  g.lineTo(x + 16 * s, y + 50 * s);
  g.lineTo(x - 16 * s, y + 50 * s);
  g.lineTo(x - 16 * s, y - 12 * s);
  g.lineTo(x - 42 * s, y - 12 * s);
  g.closePath();
  g.fillStyle = col;
  g.fill();
  g.lineWidth = 6 * s;
  g.strokeStyle = INK;
  g.stroke();
}

function parachute(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.beginPath();
  g.arc(x, y, 80 * s, Math.PI, 0);
  for (let i = 3; i >= 0; i--) g.quadraticCurveTo(x - 80 * s + (i + 0.5) * 40 * s, y + 18 * s, x - 80 * s + i * 40 * s, y);
  g.closePath();
  g.fillStyle = PINK;
  g.fill();
  g.lineWidth = 8 * s;
  g.strokeStyle = INK;
  g.stroke();
  g.beginPath();
  g.moveTo(x - 78 * s, y + 2 * s);
  g.lineTo(x - 6 * s, y + 92 * s);
  g.moveTo(x + 78 * s, y + 2 * s);
  g.lineTo(x + 6 * s, y + 92 * s);
  g.moveTo(x, y);
  g.lineTo(x, y + 92 * s);
  g.lineWidth = 4 * s;
  g.stroke();
  // Little rider.
  g.fillStyle = CREAM;
  g.beginPath();
  g.arc(x, y + 100 * s, 14 * s, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillRect(x - 10 * s, y + 112 * s, 20 * s, 34 * s);
  g.strokeRect(x - 10 * s, y + 112 * s, 20 * s, 34 * s);
}

function target(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  const cols = [CREAM, NAVY, YEL, NAVY, CREAM];
  for (let i = 0; i < cols.length; i++) {
    g.beginPath();
    g.ellipse(x, y, (90 - i * 18) * s, (34 - i * 6.8) * s, 0, 0, Math.PI * 2);
    g.fillStyle = cols[i];
    g.fill();
    if (i === 0) {
      g.lineWidth = 6 * s;
      g.strokeStyle = INK;
      g.stroke();
    }
  }
  // A down arrow onto it.
  g.save();
  g.translate(x, y - 75 * s);
  g.rotate(Math.PI);
  upArrow(g, 0, 0, 0.55 * s, YEL);
  g.restore();
}

function chevronRight(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  g.beginPath();
  g.moveTo(x - 18 * s, y - 34 * s);
  g.lineTo(x + 16 * s, y);
  g.lineTo(x - 18 * s, y + 34 * s);
  g.lineWidth = 16 * s;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = CREAM;
  g.stroke();
}

function signTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = NAVY;
    g.fillRect(0, 0, 1024, 512);
    // Bright frame with dark stripes.
    g.fillStyle = YEL;
    g.fillRect(0, 0, 1024, 24);
    g.fillRect(0, 488, 1024, 24);
    g.fillRect(0, 0, 24, 512);
    g.fillRect(1000, 0, 24, 512);
    g.fillStyle = INK;
    for (let x = 0; x < 1024; x += 64) {
      g.fillRect(x, 0, 28, 24);
      g.fillRect(x + 32, 488, 28, 24);
    }
    balloonIcon(g, 150, 220, 1.45);
    upArrow(g, 310, 230, 1.15, YEL);
    chevronRight(g, 390, 250, 1.2);
    parachute(g, 560, 160, 1.15);
    chevronRight(g, 720, 250, 1.2);
    target(g, 870, 330, 1.2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Pad (left 512×512) + chevron strip tile (right 512×512, arrows point to +V). */
function padTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const g = c.getContext('2d');
  if (g) {
    // Pad: yellow disc, dark ring, a big up arrow (into the basket) and a balloon.
    g.fillStyle = INK;
    g.fillRect(0, 0, 512, 512);
    g.beginPath();
    g.arc(256, 256, 250, 0, Math.PI * 2);
    g.fillStyle = YEL;
    g.fill();
    g.beginPath();
    g.arc(256, 256, 200, 0, Math.PI * 2);
    g.fillStyle = NAVY;
    g.fill();
    g.fillStyle = CREAM;
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      g.beginPath();
      g.arc(256 + Math.cos(a) * 225, 256 + Math.sin(a) * 225, 9, 0, Math.PI * 2);
      g.fill();
    }
    balloonIcon(g, 256, 230, 1.15);
    // Strip tile: dark track with a bright chevron pointing up (+V).
    g.fillStyle = NAVY;
    g.fillRect(512, 0, 512, 512);
    g.fillStyle = SKY;
    g.fillRect(512, 0, 26, 512);
    g.fillRect(998, 0, 26, 512);
    g.beginPath();
    g.moveTo(768 - 190, 380);
    g.lineTo(768, 150);
    g.lineTo(768 + 190, 380);
    g.lineWidth = 70;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.strokeStyle = YEL;
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ───────────────────────────── Model ─────────────────────────────

export function createBoardingModel(spec: BoardingSpec): BoardingModel {
  const group = new THREE.Group();
  group.name = 'balloon-boarding';
  const fwd = new THREE.Vector3(Math.sin(spec.yaw), 0, Math.cos(spec.yaw));
  const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
  const deckY = spec.pad.y + spec.deckTop;
  const padCenter = spec.pad.clone().addScaledVector(fwd, spec.padDist).setY(deckY);
  const archC = spec.pad.clone().addScaledVector(fwd, spec.archDist);
  archC.y = spec.heightAt(archC.x, archC.z);

  // ── Arch: candy-striped pillars, a beam, the sign, bunting ──
  const k = new Kit();
  const halfW = 1.9;
  const archH = 3.3;
  const pillars: THREE.Vector3[] = [];
  for (const s of [-1, 1]) {
    const p = archC.clone().addScaledVector(right, s * halfW);
    p.y = spec.heightAt(p.x, p.z);
    pillars.push(p);
    const segs = 8;
    const top = archC.y + archH;
    for (let i = 0; i < segs; i++) {
      const y0 = p.y - 0.2 + ((top - p.y + 0.2) * i) / segs;
      const h = (top - p.y + 0.2) / segs;
      k.cyl('gloss', i % 2 ? '#fff4dc' : '#ff5f9e', p.x, y0 + h / 2, p.z, 0.2, h, 14);
    }
    k.add('gloss', new THREE.SphereGeometry(0.34, 14, 10), YEL, k.t(p.x, top + 0.15, p.z));
    k.cyl('matte', '#16204a', p.x, p.y + 0.12, p.z, 0.42, 0.3, 16);
  }
  const beamY = archC.y + archH;
  k.add('gloss', new THREE.BoxGeometry(halfW * 2 + 0.6, 0.32, 0.32), '#16204a', k.t(archC.x, beamY, archC.z, 0, spec.yaw, 0));
  // Sign frame (behind the sign plane).
  const signW = 3.6;
  const signH = 1.8;
  const signY = beamY + 0.25 + signH / 2;
  k.add('gloss', new THREE.BoxGeometry(signW + 0.24, signH + 0.24, 0.12), YEL, k.t(archC.x - fwd.x * 0.08, signY, archC.z - fwd.z * 0.08, 0, spec.yaw, 0));
  // Bunting: two swags from the arch top down to the deck edge, little flags alternating bright/dark.
  const flagGeo = (): THREE.BufferGeometry => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.16, 0, 0, 0.16, 0, 0, 0, -0.34, 0], 3));
    g.computeVertexNormals();
    return g;
  };
  for (const s of [-1, 1]) {
    const a = pillars[s < 0 ? 0 : 1].clone().setY(beamY + 0.1);
    const b = spec.pad.clone().addScaledVector(fwd, 1.9).addScaledVector(right, s * 1.6);
    b.y = deckY + 2.6;
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = a.clone().lerp(b, t);
      p.y -= Math.sin(Math.PI * t) * 0.5;
      if (i < n) {
        const q = a.clone().lerp(b, (i + 1) / n);
        q.y -= Math.sin((Math.PI * (i + 1)) / n) * 0.5;
        k.rod('matte', '#fff4dc', p, q, 0.015, 4);
      }
      const yaw = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
      k.add('matte', flagGeo(), i % 2 ? '#16204a' : i % 4 === 0 ? YEL : PINK, k.t(p.x, p.y, p.z, 0, yaw, 0));
    }
  }
  const arch = k.build('balloon-arch');
  arch.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) (m.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  });
  group.add(arch);

  // Sign (both faces readable: two planes back to back).
  const signTex = signTexture();
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.6 });
  const front = new THREE.PlaneGeometry(signW, signH);
  const back = new THREE.PlaneGeometry(signW, signH).rotateY(Math.PI);
  back.translate(0, 0, -0.16);
  const signGeo = mergeGeometries([front, back], false) ?? front;
  const sign = new THREE.Mesh(signGeo, signMat);
  sign.name = 'balloon-sign';
  sign.position.set(archC.x, signY, archC.z);
  sign.rotation.y = spec.yaw;
  group.add(sign);

  // ── Hop-in pad + scrolling arrow strip (one texture, one mesh) ──
  const padTex = padTexture();
  padTex.wrapT = THREE.RepeatWrapping;
  const disc = new THREE.CircleGeometry(spec.padRadius, 36).rotateX(-Math.PI / 2);
  const duv = disc.attributes.uv;
  for (let i = 0; i < duv.count; i++) duv.setXY(i, duv.getX(i) * 0.5, duv.getY(i));
  // Texture up → towards the basket (−fwd): upright for a child walking in.
  disc.rotateY(spec.yaw);
  disc.translate(padCenter.x, padCenter.y + 0.02, padCenter.z);
  // The arrow strip runs from just inside the arch to the pad, on the ground then up the deck edge.
  const stripLen = spec.archDist - spec.padDist - spec.padRadius - 0.6;
  const tiles = Math.max(1, Math.round(stripLen / 1.1));
  const strip = new THREE.PlaneGeometry(1.1, stripLen, 1, tiles * 2).rotateX(-Math.PI / 2);
  const suv = strip.attributes.uv;
  const spos = strip.attributes.position;
  for (let i = 0; i < suv.count; i++) {
    // V counts tiles (RepeatWrapping in V); `update` shifts it so the chevrons crawl to the pad.
    suv.setXY(i, 0.5 + suv.getX(i) * 0.5, suv.getY(i) * tiles);
  }
  strip.rotateY(spec.yaw);
  const stripMid = spec.pad.clone().addScaledVector(fwd, spec.padDist + spec.padRadius + 0.3 + stripLen / 2);
  strip.translate(stripMid.x, 0, stripMid.z);
  // Follow the ground (and the deck lip).
  for (let i = 0; i < spos.count; i++) {
    const x = spos.getX(i);
    const z = spos.getZ(i);
    const onDeck = Math.hypot(x - spec.pad.x, z - spec.pad.z) < 2.45;
    spos.setY(i, (onDeck ? deckY : spec.heightAt(x, z)) + 0.04);
  }
  const padGeo = mergeGeometries([disc.toNonIndexed(), strip.toNonIndexed()], false) ?? disc;
  const padCount = disc.index ? disc.index.count : disc.attributes.position.count;
  disc.dispose();
  // The strip's UVs after toNonIndexed: rebuild the base from the merged attribute.
  const uvAttr = padGeo.attributes.uv as THREE.BufferAttribute;
  const base = Float32Array.from(uvAttr.array as ArrayLike<number>);
  strip.dispose();
  const padMat = new THREE.MeshStandardMaterial({ map: padTex, emissiveMap: padTex, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
  const padMesh = new THREE.Mesh(padGeo, padMat);
  padMesh.name = 'balloon-hop-pad';
  padMesh.receiveShadow = true;
  padMesh.userData.cameraIgnore = true;
  group.add(padMesh);

  // ── Gate on the basket: a dark doorway and a door swung open (local to the basket floor) ──
  const half = BALLOON_DIMS.basketHalf;
  const gate = new THREE.Group();
  gate.name = 'balloon-gate';
  const gk = new Kit();
  // Doorway: a dark panel just outside the wall (reads as an opening).
  gk.box('matte', '#0c0d14', 0, 0.42, half + 0.005, 0.7, 0.86, 0.02);
  gk.box('gloss', YEL, -0.37, 0.42, half + 0.02, 0.06, 0.9, 0.05);
  gk.box('gloss', YEL, 0.37, 0.42, half + 0.02, 0.06, 0.9, 0.05);
  gk.box('gloss', YEL, 0, 0.88, half + 0.02, 0.8, 0.06, 0.05);
  const frame = gk.build('balloon-gate-frame', false);
  gate.add(frame);
  const dk = new Kit();
  dk.box('matte', '#c99a5b', 0.35, 0.42, 0, 0.7, 0.84, 0.06);
  dk.box('gloss', '#16204a', 0.35, 0.42, 0.04, 0.5, 0.12, 0.02);
  dk.box('gloss', '#16204a', 0.35, 0.68, 0.04, 0.5, 0.08, 0.02);
  const door = dk.build('balloon-gate-door', false);
  const hinge = new THREE.Group();
  hinge.position.set(-0.35, 0, half + 0.04);
  hinge.add(door);
  gate.add(hinge);
  // The gate faces the entrance: turn it to the basket face nearest the entrance (set by caller).

  let time = 0;
  return {
    group,
    gate,
    padCenter,
    update(dt, glow) {
      time += dt;
      // Scroll the chevrons towards the pad (strip V shifts each frame).
      const shift = (time * 1.4) % 1;
      const arr = uvAttr.array as Float32Array;
      for (let i = padCount * 2 + 1; i < arr.length; i += 2) arr[i] = base[i] - shift;
      uvAttr.needsUpdate = true;
      padMat.emissiveIntensity = 0.3 + 0.5 * glow;
    },
    setGateOpen(kOpen) {
      hinge.rotation.y = -1.9 * Math.max(0, Math.min(1, kOpen));
    },
    setVisible(on) {
      padMesh.visible = on;
    },
    dispose() {
      disposeTree(group);
      disposeTree(gate);
      signTex.dispose();
      padTex.dispose();
    },
  };
}
