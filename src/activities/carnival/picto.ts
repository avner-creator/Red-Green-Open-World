/**
 * Carnival pictograms: booth signs, strength-bell tier labels, the entrance sign. Drawn into one
 * canvas atlas, white and yellow figures with black outlines on near-black, so each reads by
 * brightness alone in the R-only and the G-only channel. The cell layout is pure data.
 */
import * as THREE from 'three';

export type PictoId =
  | 'balloonPop' | 'ringToss' | 'duckPond' | 'strengthBell' | 'glowDodge'
  | 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'tier5'
  | 'tent' | 'plush';

const ORDER: PictoId[] = [
  'balloonPop', 'ringToss', 'duckPond', 'strengthBell', 'glowDodge', 'tent',
  'tier1', 'tier2', 'tier3', 'tier4', 'tier5', 'plush',
];
const COLS = 6;
const CELL = 128;
export const ATLAS_W = COLS * CELL;
export const ATLAS_H = Math.ceil(ORDER.length / COLS) * CELL;

/** UV rectangle [u0, v0, u1, v1] of a pictogram (v up, three's convention). */
export function pictoUv(id: PictoId): [number, number, number, number] {
  const i = ORDER.indexOf(id);
  const x = (i % COLS) * CELL;
  const y = Math.floor(i / COLS) * CELL;
  return [x / ATLAS_W, 1 - (y + CELL) / ATLAS_H, (x + CELL) / ATLAS_W, 1 - y / ATLAS_H];
}

type C2 = CanvasRenderingContext2D;
const Y = '#ffd93b';
const W = '#ffffff';
const K = '#05060c';

function stroke(g: C2, w: number): void {
  g.lineWidth = w;
  g.strokeStyle = K;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.stroke();
}
function fillOut(g: C2, color: string, w = 7): void {
  stroke(g, w);
  g.fillStyle = color;
  g.fill();
}
function circle(g: C2, x: number, y: number, r: number): void {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
}

const DRAW: Record<PictoId, (g: C2) => void> = {
  balloonPop(g) {
    for (const [x, y, c] of [[40, 48, W], [88, 44, Y], [64, 70, W]] as const) {
      g.beginPath();
      g.ellipse(x, y, 20, 25, 0, 0, Math.PI * 2);
      fillOut(g, c);
      g.beginPath();
      g.moveTo(x, y + 25);
      g.lineTo(x - 3, y + 50);
      g.lineWidth = 3;
      g.strokeStyle = W;
      g.stroke();
    }
    // a beanbag flying in
    g.beginPath();
    g.roundRect(14, 92, 26, 20, 6);
    fillOut(g, Y);
  },
  ringToss(g) {
    g.beginPath();
    g.roundRect(18, 100, 92, 14, 4);
    fillOut(g, W);
    for (const x of [36, 64, 92]) {
      g.beginPath();
      g.roundRect(x - 5, 52, 10, 50, 4);
      fillOut(g, W, 6);
    }
    g.beginPath();
    g.ellipse(64, 40, 26, 10, -0.2, 0, Math.PI * 2);
    g.lineWidth = 16;
    g.strokeStyle = K;
    g.stroke();
    g.lineWidth = 8;
    g.strokeStyle = Y;
    g.stroke();
  },
  duckPond(g) {
    g.beginPath();
    g.ellipse(64, 100, 52, 14, 0, 0, Math.PI * 2);
    fillOut(g, W);
    // duck
    g.beginPath();
    g.ellipse(60, 78, 30, 18, 0, 0, Math.PI * 2);
    fillOut(g, Y);
    circle(g, 80, 52, 15);
    fillOut(g, Y);
    g.beginPath();
    g.moveTo(92, 50);
    g.lineTo(110, 56);
    g.lineTo(92, 60);
    g.closePath();
    fillOut(g, W, 5);
    circle(g, 83, 48, 3.5);
    g.fillStyle = K;
    g.fill();
  },
  strengthBell(g) {
    g.beginPath();
    g.roundRect(56, 34, 16, 82, 5);
    fillOut(g, W);
    g.beginPath();
    g.moveTo(42, 34);
    g.quadraticCurveTo(44, 6, 64, 6);
    g.quadraticCurveTo(84, 6, 86, 34);
    g.closePath();
    fillOut(g, Y);
    circle(g, 64, 38, 6);
    fillOut(g, Y, 5);
    g.beginPath();
    g.roundRect(48, 84, 32, 14, 5);
    fillOut(g, Y);
  },
  glowDodge(g) {
    // a figure leaning away from a ball
    circle(g, 40, 30, 12);
    fillOut(g, W);
    g.beginPath();
    g.moveTo(40, 44);
    g.lineTo(30, 80);
    g.moveTo(34, 56);
    g.lineTo(16, 48);
    g.moveTo(34, 56);
    g.lineTo(54, 50);
    g.moveTo(30, 80);
    g.lineTo(22, 112);
    g.moveTo(30, 80);
    g.lineTo(46, 110);
    g.lineWidth = 16;
    g.strokeStyle = K;
    g.stroke();
    g.lineWidth = 8;
    g.strokeStyle = W;
    g.stroke();
    circle(g, 92, 74, 20);
    fillOut(g, Y);
    for (const [x, y] of [[118, 60], [120, 80], [114, 98]]) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 6, y);
      g.lineWidth = 5;
      g.strokeStyle = Y;
      g.stroke();
    }
  },
  tent(g) {
    g.beginPath();
    g.moveTo(64, 10);
    g.lineTo(116, 70);
    g.lineTo(12, 70);
    g.closePath();
    fillOut(g, Y);
    g.beginPath();
    g.rect(20, 70, 88, 44);
    fillOut(g, W);
    g.beginPath();
    g.moveTo(64, 70);
    g.lineTo(50, 114);
    g.lineTo(78, 114);
    g.closePath();
    g.fillStyle = K;
    g.fill();
    g.beginPath();
    g.moveTo(64, 10);
    g.lineTo(64, 0);
    g.lineWidth = 4;
    g.strokeStyle = W;
    g.stroke();
  },
  // Strength-bell tiers, weakest to strongest: snail, chick, cat, rocket, crown.
  tier1(g) {
    g.beginPath();
    g.ellipse(64, 96, 46, 12, 0, 0, Math.PI * 2);
    fillOut(g, W);
    circle(g, 70, 70, 26);
    fillOut(g, Y);
    g.beginPath();
    g.arc(70, 70, 12, 0, Math.PI * 1.6);
    stroke(g, 5);
    g.beginPath();
    g.moveTo(28, 88);
    g.lineTo(22, 60);
    g.moveTo(36, 88);
    g.lineTo(38, 62);
    stroke(g, 5);
  },
  tier2(g) {
    circle(g, 64, 76, 34);
    fillOut(g, Y);
    circle(g, 54, 66, 5);
    g.fillStyle = K;
    g.fill();
    circle(g, 76, 66, 5);
    g.fill();
    g.beginPath();
    g.moveTo(58, 80);
    g.lineTo(70, 80);
    g.lineTo(64, 92);
    g.closePath();
    fillOut(g, W, 4);
    g.beginPath();
    g.moveTo(56, 42);
    g.lineTo(64, 30);
    g.lineTo(72, 42);
    stroke(g, 5);
  },
  tier3(g) {
    g.beginPath();
    g.moveTo(30, 40);
    g.lineTo(40, 18);
    g.lineTo(54, 36);
    g.lineTo(74, 36);
    g.lineTo(88, 18);
    g.lineTo(98, 40);
    g.arc(64, 70, 38, -0.4, Math.PI + 0.4);
    g.closePath();
    fillOut(g, W);
    circle(g, 50, 64, 5);
    g.fillStyle = K;
    g.fill();
    circle(g, 78, 64, 5);
    g.fill();
    g.beginPath();
    g.moveTo(64, 78);
    g.quadraticCurveTo(56, 88, 50, 82);
    g.moveTo(64, 78);
    g.quadraticCurveTo(72, 88, 78, 82);
    stroke(g, 4);
  },
  tier4(g) {
    g.beginPath();
    g.moveTo(64, 8);
    g.quadraticCurveTo(92, 34, 84, 88);
    g.lineTo(44, 88);
    g.quadraticCurveTo(36, 34, 64, 8);
    fillOut(g, W);
    circle(g, 64, 46, 9);
    fillOut(g, Y, 5);
    g.beginPath();
    g.moveTo(50, 90);
    g.lineTo(64, 122);
    g.lineTo(78, 90);
    g.closePath();
    fillOut(g, Y, 5);
  },
  tier5(g) {
    g.beginPath();
    g.moveTo(16, 100);
    g.lineTo(22, 40);
    g.lineTo(44, 70);
    g.lineTo(64, 26);
    g.lineTo(84, 70);
    g.lineTo(106, 40);
    g.lineTo(112, 100);
    g.closePath();
    fillOut(g, Y);
    for (const x of [22, 64, 106]) {
      circle(g, x, x === 64 ? 22 : 36, 8);
      fillOut(g, W, 4);
    }
  },
  plush(g) {
    circle(g, 40, 34, 14);
    fillOut(g, Y);
    circle(g, 88, 34, 14);
    fillOut(g, Y);
    circle(g, 64, 64, 38);
    fillOut(g, Y);
    circle(g, 52, 58, 5);
    g.fillStyle = K;
    g.fill();
    circle(g, 76, 58, 5);
    g.fill();
    g.beginPath();
    g.ellipse(64, 78, 12, 9, 0, 0, Math.PI * 2);
    fillOut(g, W, 4);
  },
};

/** Draw one pictogram into a 128×128 cell at x, y (no background). */
export function drawPicto(g: C2, id: PictoId, x = 0, y = 0, size = CELL): void {
  g.save();
  g.translate(x, y);
  g.scale(size / CELL, size / CELL);
  DRAW[id](g);
  g.restore();
}

/** Atlas texture: each cell has a near-black rounded plate with a thin yellow border. */
export function createPictoAtlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = ATLAS_W;
  c.height = ATLAS_H;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = '#0d1022';
    g.fillRect(0, 0, ATLAS_W, ATLAS_H);
    ORDER.forEach((id, i) => {
      const x = (i % COLS) * CELL;
      const y = Math.floor(i / COLS) * CELL;
      drawPicto(g, id, x, y);
    });
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A small SVG-free data URL of one pictogram for the DOM HUD. */
export function pictoDataUrl(id: PictoId, size = 128): string {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) drawPicto(g, id, 0, 0, size);
  return c.toDataURL('image/png');
}
