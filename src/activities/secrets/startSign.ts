/**
 * Start markers for the secret paths (both eyes): a glowing ring on the ground where a path begins,
 * and a floating picture sign over it: glasses → stepping stones going up → the gold trophy star.
 * "Put your glasses on, follow the hidden stones up, win the star." No words.
 *
 * The marker only says where a path STARTS (the ring sits on the ground at the arrow trail's end, not
 * on a stone), so it gives the strong eye no stone positions. The sign texture is drawn once and
 * shared by all four signs.
 */
import * as THREE from 'three';
import { INK, WHITE, YELLOW, drawArrow, drawIcon, drawPanel, makeCanvas } from '../chests/picto';
import { merge } from '../chests/bake';
import { surface } from './batch';

const SIZE = 256;

function drawSign(g: CanvasRenderingContext2D): void {
  drawPanel(g, 6, 6, SIZE - 12, SIZE - 12, 30, YELLOW);
  // Glasses (top left) → stones rising to the star (top right).
  drawIcon(g, 'glasses', 62, 70, 82, WHITE);
  drawArrow(g, 108, 74, 146, 74, 14, WHITE);
  drawIcon(g, 'star', 192, 68, 84, YELLOW);
  // Stepping stones going up from bottom left to the star.
  const stones: [number, number, number][] = [[52, 214, 26], [104, 190, 24], [152, 160, 22], [194, 128, 20]];
  for (const [x, y, r] of stones) {
    g.beginPath();
    g.ellipse(x, y, r, r * 0.42, 0, 0, Math.PI * 2);
    g.fillStyle = WHITE;
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = INK;
    g.stroke();
    g.beginPath();
    g.ellipse(x, y + r * 0.42, r * 0.7, r * 0.3, 0, 0, Math.PI);
    g.fillStyle = '#7a8090';
    g.fill();
  }
  // Dotted hop line between the stones.
  g.setLineDash([3, 9]);
  g.lineCap = 'round';
  g.lineWidth = 5;
  g.strokeStyle = YELLOW;
  g.beginPath();
  g.moveTo(52, 196);
  g.quadraticCurveTo(78, 168, 104, 174);
  g.quadraticCurveTo(128, 140, 152, 146);
  g.quadraticCurveTo(172, 112, 194, 116);
  g.quadraticCurveTo(200, 104, 194, 108);
  g.stroke();
  g.setLineDash([]);
}

let shared: { refs: number; mat: THREE.SpriteMaterial; tex: THREE.Texture } | null = null;

function sharedSign(): { mat: THREE.SpriteMaterial; release(): void } {
  if (!shared) {
    const { canvas, g } = makeCanvas(SIZE, SIZE);
    drawSign(g);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    shared = { refs: 0, tex, mat: new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.05, depthWrite: false, fog: false }) };
  }
  shared.refs++;
  const s = shared;
  return {
    mat: s.mat,
    release() {
      if (--s.refs > 0) return;
      s.mat.dispose();
      s.tex.dispose();
      shared = null;
    },
  };
}

export interface StartMarker {
  /** World-placed: the ring at the ground, the sign floating over it. */
  root: THREE.Group;
  sign: THREE.Sprite;
  ring: THREE.Mesh;
  /** Bob the sign and pulse the ring (`claimed` dims the ring: done). */
  update(t: number, claimed: boolean): void;
  dispose(): void;
}

/** A start marker at ground point (x, y, z); `material` is the shared both-eye surface material. */
export function buildStartMarker(x: number, y: number, z: number, material: THREE.Material): StartMarker {
  const root = new THREE.Group();
  root.name = 'secret-start';
  root.position.set(x, y, z);
  const parts = [
    surface(new THREE.CylinderGeometry(1.25, 1.3, 0.06, 40).translate(0, 0.03, 0), 0x1d1b19, { rough: 0.8, metal: 0 }),
    surface(new THREE.TorusGeometry(1.1, 0.09, 8, 48).rotateX(Math.PI / 2).translate(0, 0.08, 0), 0xffd23a, { rough: 0.4, metal: 0.2, glow: 0.9 }),
    surface(new THREE.TorusGeometry(0.62, 0.06, 6, 40).rotateX(Math.PI / 2).translate(0, 0.08, 0), 0xf4ecd8, { rough: 0.5, metal: 0, glow: 0.4 }),
  ];
  // A ring of short gold dashes pointing up (a "start here" pad).
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    parts.push(surface(new THREE.BoxGeometry(0.1, 0.05, 0.3).rotateY(a).translate(Math.sin(a) * 0.86, 0.07, Math.cos(a) * 0.86), 0xffd23a, { rough: 0.4, metal: 0.2, glow: 0.6 }));
  }
  const geo = merge(parts);
  for (const p of parts) p.dispose();
  const ring = new THREE.Mesh(geo, material);
  ring.receiveShadow = true;
  ring.userData.cameraIgnore = true;
  root.add(ring);
  const s = sharedSign();
  const sign = new THREE.Sprite(s.mat);
  sign.scale.setScalar(1.7);
  sign.position.y = 2.7;
  sign.renderOrder = 3;
  sign.userData.cameraIgnore = true;
  root.add(sign);
  return {
    root,
    sign,
    ring,
    update(t, claimed) {
      sign.position.y = 2.7 + Math.sin(t * 2.1) * 0.12;
      const k = claimed ? 1 : 1 + 0.05 * Math.sin(t * 4);
      ring.scale.set(k, 1, k);
    },
    dispose() {
      geo.dispose();
      s.release();
    },
  };
}
