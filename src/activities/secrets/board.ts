/**
 * The vault's rule-demo board (both eyes): a wordless 6-second loop next to the door.
 *
 *   1. With glasses on, three shapes light up in the door's windows: 1, 2, 3.
 *   2. A little hero hops onto the floor pads with the same shapes, in that order; each right step
 *      lights its pad and its window ring.
 *   3. The door slides down and a big star bursts out.
 *
 * The demo uses its OWN shapes (heart, diamond, square, plus), never the vault's (star, moon, ring,
 * triangle), so it teaches the rule and never gives the answer. White and yellow on near-black with
 * black outlines, so it reads in the red-only and green-only channel.
 *
 * Canvas redraws are cheap and rare: 8 frames a second, only while the camera is near, and driven
 * by game time (a frozen frame is redrawn identically).
 */
import * as THREE from 'three';
import { INK, PANEL, WHITE, YELLOW, drawIcon, drawPanel, drawShape, makeCanvas } from '../chests/picto';
import type { BoardShape } from '../chests/picto';
import { BOARD } from './models';

const W = 400;
const H = Math.round((W * BOARD.h) / BOARD.w);
export const BOARD_LOOP = 6;
const FPS = 8;

/** Demo door order and the pads' shapes (left → right). */
const ORDER: readonly BoardShape[] = ['heart', 'diamond', 'square'];
const PADS: readonly BoardShape[] = ['diamond', 'plus', 'heart', 'square'];

const easeOut = (t: number): number => 1 - (1 - t) * (1 - t);
const clamp01 = (t: number): number => Math.max(0, Math.min(1, t));

/** Which step of the loop is showing at time `t` (for tests): 'show' | 'step1..3' | 'open'. */
export function boardPhase(t: number): string {
  const u = ((t % BOARD_LOOP) + BOARD_LOOP) % BOARD_LOOP;
  if (u < 1.2) return 'show';
  if (u < 3.6) return `step${1 + Math.floor((u - 1.2) / 0.8)}`;
  return 'open';
}

function draw(g: CanvasRenderingContext2D, t: number): void {
  const u = ((t % BOARD_LOOP) + BOARD_LOOP) % BOARD_LOOP;
  g.clearRect(0, 0, W, H);
  drawPanel(g, 4, 4, W - 8, H - 8, 26, YELLOW);

  // How many right steps are done at this moment (0..3), and the hop in progress.
  const stepT = (u - 1.2) / 0.8;
  const done = u < 1.2 ? 0 : Math.min(3, Math.floor(stepT + 0.0001) + (stepT % 1 > 0.55 ? 1 : 0));
  const opening = clamp01((u - 3.6) / 0.9);

  // ── The door (top): three windows with the order shapes, glasses icon on its left.
  const dx = 112;
  const dy = 22;
  const dw = 270;
  const dh = 150;
  drawIcon(g, 'glasses', 56, dy + 56, 82, WHITE);
  g.save();
  g.beginPath();
  g.rect(dx - 6, dy - 6, dw + 12, dh + 12);
  g.clip();
  // Rock frame and the door leaf, sliding down as it opens.
  g.fillStyle = '#d9cfb8';
  g.fillRect(dx - 6, dy - 6, dw + 12, dh + 12);
  g.fillStyle = '#05060a';
  g.fillRect(dx, dy, dw, dh);
  if (opening > 0) {
    // Treasure glow behind the door.
    const grd = g.createRadialGradient(dx + dw / 2, dy + dh * 0.7, 4, dx + dw / 2, dy + dh * 0.7, dw * 0.6);
    grd.addColorStop(0, '#fff3b0');
    grd.addColorStop(1, '#05060a');
    g.fillStyle = grd;
    g.fillRect(dx, dy, dw, dh);
  }
  const off = easeOut(opening) * (dh + 10);
  g.translate(0, off);
  g.fillStyle = '#3e4752';
  g.fillRect(dx, dy, dw, dh);
  g.strokeStyle = '#e8b84a';
  g.lineWidth = 5;
  g.strokeRect(dx + 6, dy + 6, dw - 12, dh - 12);
  for (let i = 0; i < 3; i++) {
    const cx = dx + 50 + i * 85;
    const cy = dy + 64;
    const pulse = u < 1.2 && Math.floor(u / 0.4) === i ? 1.2 : 1;
    g.beginPath();
    g.arc(cx, cy, 34, 0, Math.PI * 2);
    g.fillStyle = '#0b0c10';
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = i < done ? YELLOW : '#555b66';
    g.stroke();
    drawShape(g, ORDER[i], cx, cy, 20 * pulse, WHITE);
    // 1, 2, 3 pips under each window.
    for (let p = 0; p <= i; p++) {
      g.beginPath();
      g.arc(cx + (p - i / 2) * 13, cy + 50, 5, 0, Math.PI * 2);
      g.fillStyle = WHITE;
      g.fill();
    }
  }
  g.restore();
  if (opening > 0.35) {
    // The prize bursts out: a big star and sparkles.
    const k = easeOut(clamp01((opening - 0.35) / 0.65));
    const sx = dx + dw / 2;
    const sy = dy + dh * 0.6 - k * 40;
    for (let r = 0; r < 8; r++) {
      const a = (r / 8) * Math.PI * 2 + u;
      g.beginPath();
      g.moveTo(sx + Math.cos(a) * 30 * k, sy + Math.sin(a) * 30 * k);
      g.lineTo(sx + Math.cos(a) * 62 * k, sy + Math.sin(a) * 62 * k);
      g.strokeStyle = YELLOW;
      g.lineWidth = 7;
      g.lineCap = 'round';
      g.stroke();
    }
    drawIcon(g, 'star', sx, sy, 40 + 56 * k, YELLOW);
  }

  // ── The floor pads (bottom), and the little hero hopping between them.
  const py = H - 52;
  const padX = (i: number): number => 66 + i * 90;
  for (let i = 0; i < PADS.length; i++) {
    const order = ORDER.indexOf(PADS[i]);
    const lit = order >= 0 && order < done;
    g.beginPath();
    g.ellipse(padX(i), py, 42, 20, 0, 0, Math.PI * 2);
    g.fillStyle = INK;
    g.fill();
    g.beginPath();
    g.ellipse(padX(i), py - 5, 36, 15, 0, 0, Math.PI * 2);
    g.fillStyle = lit ? YELLOW : '#e9dfc8';
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = INK;
    g.stroke();
    // The pad's shape stands over it.
    drawShape(g, PADS[i], padX(i), py - 48, 20, lit ? YELLOW : WHITE);
  }
  // Hero: walks in from the left, then hops to each right pad in turn; stays on the last.
  const home = { x: 18, y: py - 4 };
  const at = (k: number): { x: number; y: number } => (k < 0 ? home : { x: padX(PADS.indexOf(ORDER[k])), y: py - 6 });
  let hx: number;
  let hy: number;
  if (u < 1.2) {
    hx = home.x;
    hy = home.y;
  } else if (u < 3.6) {
    const k = Math.min(2, Math.floor(stepT));
    const f = clamp01((stepT - k) / 0.55);
    const a = at(k - 1);
    const b = at(k);
    hx = a.x + (b.x - a.x) * easeOut(f);
    hy = a.y + (b.y - a.y) * f - Math.sin(Math.PI * f) * 44;
  } else {
    const b = at(2);
    hx = b.x;
    hy = b.y;
  }
  g.beginPath();
  g.ellipse(hx, py + 2, 14, 5, 0, 0, Math.PI * 2);
  g.fillStyle = 'rgba(0,0,0,.45)';
  g.fill();
  drawIcon(g, 'character', hx, hy - 26, 54, YELLOW);
  g.fillStyle = PANEL;
}

export interface DemoBoard {
  mesh: THREE.Mesh;
  /** Redraw for game time `t` when `near` (at most 8 frames per second of game time). */
  update(t: number, near: boolean): void;
  dispose(): void;
}

export function buildDemoBoard(): DemoBoard {
  const { canvas, g } = makeCanvas(W, H);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const geo = new THREE.PlaneGeometry(BOARD.w, BOARD.h);
  const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true, alphaTest: 0.05 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'vault-board';
  mesh.userData.cameraIgnore = true;
  let frame = -1;
  draw(g, 0);
  return {
    mesh,
    update(t, near) {
      if (!near) return;
      const f = Math.floor(t * FPS);
      if (f === frame) return;
      frame = f;
      draw(g, f / FPS);
      tex.needsUpdate = true;
    },
    dispose() {
      tex.dispose();
      geo.dispose();
      mat.dispose();
    },
  };
}
