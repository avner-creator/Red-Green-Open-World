/**
 * Half-symbol pairs: a symbol is a LEFT half-shape joined to a RIGHT half-shape. One half is drawn
 * for the weak eye, the other for the strong eye, exactly aligned, so only both eyes together see
 * the whole symbol. A both-eye full-symbol board (main scene) shows the candidates.
 *
 * Every half runs from the top of the symbol axis (0, 1) round its side to the bottom (0, −1), so
 * any left joins any right into one closed outline.
 */
import * as THREE from 'three';
import { applyFade, baseUniforms, clamp01, layerMesh, layerShaderMaterial, linearGrey } from './common';
import type { Facing } from './common';
import { mulberry32, shuffle } from './rng';
import type { Rng } from './rng';

export type HalfShape = 'round' | 'square' | 'point' | 'spiky';
export const HALF_SHAPES: readonly HalfShape[] = ['round', 'square', 'point', 'spiky'];

export interface HalfSymbol {
  left: HalfShape;
  right: HalfShape;
}

export const sameSymbol = (a: HalfSymbol, b: HalfSymbol): boolean => a.left === b.left && a.right === b.right;

/** Outline of a LEFT half in symbol units (x ≤ 0, y −1..1), from (0, 1) to (0, −1), y up. */
export function leftHalfOutline(shape: HalfShape): Array<[number, number]> {
  switch (shape) {
    case 'round': {
      const pts: Array<[number, number]> = [];
      const n = 24;
      for (let i = 0; i <= n; i++) {
        const a = Math.PI / 2 + (i / n) * Math.PI;
        pts.push([Math.cos(a), Math.sin(a)]);
      }
      pts[0] = [0, 1];
      pts[n] = [0, -1];
      return pts;
    }
    case 'square':
      return [[0, 1], [-0.86, 1], [-0.86, -1], [0, -1]];
    case 'point':
      return [[0, 1], [-1, 0], [0, -1]];
    case 'spiky':
      return [[0, 1], [-0.34, 0.5], [-1, 0.62], [-0.56, 0], [-1, -0.62], [-0.34, -0.5], [0, -1]];
  }
}

/** Outline of a half on the given side (right = mirror of the left outline). */
export function halfOutline(shape: HalfShape, side: 'left' | 'right'): Array<[number, number]> {
  const l = leftHalfOutline(shape);
  return side === 'left' ? l : l.map(([x, y]) => [0 - x || 0, y] as [number, number]).reverse();
}

/** Closed outline of the whole symbol (left half top→bottom, then right half bottom→top). */
export function symbolOutline(s: HalfSymbol): Array<[number, number]> {
  return [...halfOutline(s.left, 'left'), ...halfOutline(s.right, 'right').slice(1, -1)];
}

export function randomSymbol(rng: Rng): HalfSymbol {
  const pick = (): HalfShape => HALF_SHAPES[Math.floor(rng() * HALF_SHAPES.length)];
  return { left: pick(), right: pick() };
}

export interface CandidateSet {
  /** Three different symbols, shuffled. */
  candidates: HalfSymbol[];
  /** Index of the answer in `candidates`. */
  answerIndex: number;
}

/**
 * Three candidates for `answer` such that neither half alone identifies it: one decoy shares the
 * answer's left half, the other shares its right half. Only the whole symbol (both eyes) is unique.
 */
export function pickCandidates(answer: HalfSymbol, seedOrRng: number | Rng): CandidateSet {
  const rng = typeof seedOrRng === 'number' ? mulberry32(seedOrRng) : seedOrRng;
  const other = (not: HalfShape): HalfShape => {
    const opts = HALF_SHAPES.filter((s) => s !== not);
    return opts[Math.floor(rng() * opts.length)];
  };
  const a = { ...answer };
  const sameLeft: HalfSymbol = { left: answer.left, right: other(answer.right) };
  const sameRight: HalfSymbol = { left: other(answer.left), right: answer.right };
  const candidates = shuffle([a, sameLeft, sameRight], rng);
  return { candidates, answerIndex: candidates.indexOf(a) };
}

// ───────────────────────────── Layer halves ─────────────────────────────

function halfGeometry(shape: HalfShape, side: 'left' | 'right', size: number, facing: Facing): THREE.BufferGeometry {
  const k = size / 2;
  const pts = halfOutline(shape, side).map(([x, y]) => new THREE.Vector2(x * k, y * k));
  const geo = new THREE.ShapeGeometry(new THREE.Shape(pts), 1);
  if (facing === 'ground') geo.rotateX(-Math.PI / 2);
  geo.computeBoundingSphere();
  return geo;
}

const halfFragment = /* glsl */ `
uniform vec3 color;
uniform float opacity;
uniform float fade;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(color, opacity * fade);
}
`;

export interface HalfSymbolOptions {
  shape: HalfShape;
  side: 'left' | 'right';
  /** Symbol height in metres. Default 1. */
  size?: number;
  level?: number;
  opacity?: number;
  /** Default 'billboard'. */
  facing?: Facing;
}

export interface HalfSymbolBlock {
  readonly object: THREE.Mesh;
  setShape(shape: HalfShape): void;
  set(opts: Pick<HalfSymbolOptions, 'level' | 'opacity'>): void;
  setFade(fade: number): void;
  update(dt: number): void;
  dispose(): void;
}

/** One half of a symbol as a filled shape (one draw call; MSAA smooths its edges). */
export function createHalfSymbol(opts: HalfSymbolOptions): HalfSymbolBlock {
  const size = opts.size ?? 1;
  const facing = opts.facing ?? 'billboard';
  const u = baseUniforms(opts.level ?? 1, opts.opacity ?? 1);
  const mat = layerShaderMaterial({ name: 'ToolkitHalfSymbol', uniforms: u, fragmentShader: halfFragment, billboard: facing === 'billboard' });
  const mesh = layerMesh(halfGeometry(opts.shape, opts.side, size, facing), mat, 'ToolkitHalfSymbol');
  return {
    object: mesh,
    setShape(shape) {
      mesh.geometry.dispose();
      mesh.geometry = halfGeometry(shape, opts.side, size, facing);
    },
    set(o) {
      if (o.level !== undefined) u.color.value.copy(linearGrey(o.level));
      if (o.opacity !== undefined) u.opacity.value = clamp01(o.opacity);
    },
    setFade: (f) => applyFade(mat, f),
    update() {},
    dispose() {
      mesh.geometry.dispose();
      mat.dispose();
    },
  };
}

export interface HalfSymbolPairOptions {
  symbol: HalfSymbol;
  /** Which half the weak eye gets. Default 'left'. */
  weakSide?: 'left' | 'right';
  size?: number;
  level?: number;
  opacity?: number;
  facing?: Facing;
}

export interface HalfSymbolPair {
  /** Register with `VisionLayer.WeakOnly`. */
  readonly weak: THREE.Mesh;
  /** Register with `VisionLayer.StrongOnly`. Same transform as `weak` (keep them aligned). */
  readonly strong: THREE.Mesh;
  setSymbol(symbol: HalfSymbol): void;
  setFade(fade: number): void;
  update(dt: number): void;
  dispose(): void;
}

/**
 * Weak half + strong half of one symbol. Both meshes have identical local geometry frames: give
 * them the same position/rotation/scale (or parent both to transforms that match).
 */
export function createHalfSymbolPair(opts: HalfSymbolPairOptions): HalfSymbolPair {
  const weakSide = opts.weakSide ?? 'left';
  const strongSide = weakSide === 'left' ? 'right' : 'left';
  const common = { size: opts.size, level: opts.level, opacity: opts.opacity, facing: opts.facing };
  const shapeFor = (s: HalfSymbol, side: 'left' | 'right'): HalfShape => (side === 'left' ? s.left : s.right);
  const w = createHalfSymbol({ ...common, shape: shapeFor(opts.symbol, weakSide), side: weakSide });
  const s = createHalfSymbol({ ...common, shape: shapeFor(opts.symbol, strongSide), side: strongSide });
  return {
    weak: w.object,
    strong: s.object,
    setSymbol(sym) {
      w.setShape(shapeFor(sym, weakSide));
      s.setShape(shapeFor(sym, strongSide));
    },
    setFade(f) {
      w.setFade(f);
      s.setFade(f);
    },
    update() {},
    dispose() {
      w.dispose();
      s.dispose();
    },
  };
}

// ───────────────────────────── Both-eye full symbol (main scene) ─────────────────────────────

/** Colours of the both-eye symbol board: light symbol, thick near-black outline, dark board. */
export const FULL_SYMBOL_STYLE = { board: '#1d2436', fill: '#f6f1e3', outline: '#06080d', rim: '#c9c2ad' } as const;

/**
 * Canvas texture of a whole symbol for the main scene (both eyes). Light on dark with a thick dark
 * outline, so it reads by brightness alone in the R-only and the G-only picture.
 */
export function createFullSymbolTexture(symbol: HalfSymbol, px = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const g = canvas.getContext('2d');
  if (g) {
    const r = px * 0.12;
    g.fillStyle = FULL_SYMBOL_STYLE.rim;
    g.beginPath();
    g.roundRect(0, 0, px, px, r);
    g.fill();
    g.fillStyle = FULL_SYMBOL_STYLE.board;
    g.beginPath();
    g.roundRect(px * 0.04, px * 0.04, px * 0.92, px * 0.92, r * 0.8);
    g.fill();
    const k = px * 0.33;
    g.beginPath();
    symbolOutline(symbol).forEach(([x, y], i) => {
      const cx = px / 2 + x * k;
      const cy = px / 2 - y * k;
      if (i) g.lineTo(cx, cy);
      else g.moveTo(cx, cy);
    });
    g.closePath();
    g.lineJoin = 'round';
    g.lineWidth = px * 0.075;
    g.strokeStyle = FULL_SYMBOL_STYLE.outline;
    g.stroke();
    g.fillStyle = FULL_SYMBOL_STYLE.fill;
    g.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Both-eye board showing a whole symbol (add it to the MAIN scene, e.g. `ctx.vision.add(m, VisionLayer.Both)`).
 * Unlit so it reads the same in sun and shade. `size` is the board edge in metres.
 */
export function createFullSymbolMesh(symbol: HalfSymbol, size = 1): THREE.Mesh {
  const tex = createFullSymbolTexture(symbol);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  mesh.name = 'ToolkitFullSymbol';
  return mesh;
}
