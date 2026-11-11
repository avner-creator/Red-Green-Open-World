/**
 * Both-eye pictogram badges that float over a locked chest (a billboard sprite, one draw each):
 *
 *  - `find`: a big yellow key with a "?" — "this chest needs a key: go and find it";
 *  - `use`:  key → chest — "you have the key: open me".
 *
 * Drawn once on two shared canvases with the HUD's own icons (white/yellow on near-black with black
 * outlines), so they read in the red-only and green-only channel. They sit over the chest itself and
 * never point anywhere, so they reveal nothing about where the (weak-eye) key is.
 */
import * as THREE from 'three';
import { INK, PANEL, WHITE, YELLOW, drawArrow, drawIcon, makeCanvas } from './picto';

export type BadgeState = 'find' | 'use';

const SIZE = 256;

function drawDisc(g: CanvasRenderingContext2D): void {
  const c = SIZE / 2;
  g.beginPath();
  g.arc(c, c, c - 10, 0, Math.PI * 2);
  g.fillStyle = INK;
  g.fill();
  g.beginPath();
  g.arc(c, c, c - 18, 0, Math.PI * 2);
  g.fillStyle = PANEL;
  g.fill();
  g.lineWidth = 9;
  g.strokeStyle = YELLOW;
  g.stroke();
}

function drawFind(g: CanvasRenderingContext2D): void {
  drawDisc(g);
  drawIcon(g, 'key', 118, 136, 150, YELLOW);
  // "?" bubble, top right.
  g.beginPath();
  g.arc(192, 66, 40, 0, Math.PI * 2);
  g.fillStyle = WHITE;
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = INK;
  g.stroke();
  g.fillStyle = INK;
  g.font = '900 62px ui-rounded, "Nunito", "Trebuchet MS", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('?', 192, 70);
}

function drawUse(g: CanvasRenderingContext2D): void {
  drawDisc(g);
  drawIcon(g, 'key', 70, 128, 92, YELLOW);
  drawArrow(g, 108, 128, 150, 128, 16, WHITE);
  drawIcon(g, 'chest', 192, 126, 84, WHITE);
}

interface Shared {
  refs: number;
  mats: Record<BadgeState, THREE.SpriteMaterial>;
  textures: THREE.Texture[];
}
let shared: Shared | null = null;

function getShared(): Shared {
  if (shared) {
    shared.refs++;
    return shared;
  }
  const make = (draw: (g: CanvasRenderingContext2D) => void): { mat: THREE.SpriteMaterial; tex: THREE.Texture } => {
    const { canvas, g } = makeCanvas(SIZE, SIZE);
    draw(g);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return { mat: new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.05, depthWrite: false, fog: false }), tex };
  };
  const f = make(drawFind);
  const u = make(drawUse);
  shared = { refs: 1, mats: { find: f.mat, use: u.mat }, textures: [f.tex, u.tex] };
  return shared;
}

export interface PictoBadge {
  sprite: THREE.Sprite;
  /** null hides it. */
  set(state: BadgeState | null): void;
  dispose(): void;
}

export function buildPictoBadge(): PictoBadge {
  const s = getShared();
  const sprite = new THREE.Sprite(s.mats.find);
  sprite.name = 'chest-badge';
  sprite.scale.setScalar(1.35);
  sprite.visible = false;
  sprite.renderOrder = 3;
  sprite.userData.cameraIgnore = true;
  return {
    sprite,
    set(state) {
      sprite.visible = state !== null;
      if (state) sprite.material = s.mats[state];
    },
    dispose() {
      if (--s.refs > 0) return;
      for (const m of Object.values(s.mats)) m.dispose();
      for (const t of s.textures) t.dispose();
      shared = null;
    },
  };
}
