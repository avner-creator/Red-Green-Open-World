/**
 * Red-green dot pictures: a different dot pattern per eye; the hidden shape exists only in the
 * relation between the two patterns.
 *
 *   S (strong eye) = i.i.d. 50 % dots from the seed ONLY (identical for every shape)
 *   W (weak eye)   = S outside the shape, NOT S inside it
 *
 * So `W XOR S` is exactly the shape mask, and each pattern alone is plain 50 % noise. One quad per
 * eye (2 draw calls for the pair); dots are drawn from a cell-occupancy texture.
 */
import * as THREE from 'three';
import { applyFade, baseFragmentHead, baseUniforms, clamp01, layerMesh, layerShaderMaterial, linearGrey, planeGeometry } from './common';
import type { Facing } from './common';
import { mulberry32 } from './rng';
import { rasterizeShape } from './shapes';
import type { ShapeId } from './shapes';

/**
 * Display-sRGB grey of the both-eye board behind a dot picture (same value in R and G). The
 * compositor brightens layer objects on dark backgrounds and darkens them on bright ones, and its
 * contrast is weakest around mid-grey (0.5) where the polarity flips; a dark neutral board gives
 * the biggest, most even dot contrast in both eyes. Use an unlit material (e.g. MeshBasicMaterial
 * with `new THREE.Color().setScalar(DOT_BOARD_GREY).convertSRGBToLinear()`), or a lit one that
 * renders near this value.
 */
export const DOT_BOARD_GREY = 0.2;

/** Default grid size (cells per side). */
export const DOT_CELLS = 28;

export interface DotPattern {
  /** Cells per side. */
  cells: number;
  /** Shape mask, row-major, row 0 at the top. */
  mask: Uint8Array;
  /** Strong-eye dots (depends on `seed` and `cells` only). */
  strongCells: Uint8Array;
  /** Weak-eye dots: S outside the shape, NOT S inside. */
  weakCells: Uint8Array;
}

/** The strong pattern: i.i.d. 50 % occupancy from the seed only. */
export function strongPattern(seed: number, cells = DOT_CELLS): Uint8Array {
  const rng = mulberry32(seed);
  const s = new Uint8Array(cells * cells);
  for (let i = 0; i < s.length; i++) s[i] = rng() < 0.5 ? 1 : 0;
  return s;
}

export function generateDotPicture(shape: ShapeId, seed: number, cells = DOT_CELLS): DotPattern {
  const mask = rasterizeShape(shape, cells);
  const strongCells = strongPattern(seed, cells);
  const weakCells = new Uint8Array(strongCells.length);
  for (let i = 0; i < weakCells.length; i++) weakCells[i] = strongCells[i] ^ mask[i];
  return { cells, mask, strongCells, weakCells };
}

// ───────────────────────────── Material ─────────────────────────────

const dotFragment = /* glsl */ `
${baseFragmentHead}
uniform sampler2D cellTex;
uniform float cells;
uniform float dotScale;
void main() {
  vec2 g = vUv * cells;
  vec2 c = floor(g);
  float occ = texture2D(cellTex, (c + 0.5) / cells).r;
  if (occ < 0.5) discard;
  float d = length(fract(g) - 0.5);
  float w = max(length(fwidth(g)) * 0.7, 1e-4);
  float a = clamp((0.5 * dotScale - d) / w + 0.5, 0.0, 1.0) * opacity * fade;
  if (a <= 0.0) discard;
  gl_FragColor = vec4(color, a);
}
`;

/** Pack row-0-at-top cells into a texture (GL rows start at the bottom). */
function fillTexture(tex: THREE.DataTexture, cellsArr: Uint8Array, n: number): void {
  const data = tex.image.data as Uint8Array;
  for (let j = 0; j < n; j++) {
    const src = j * n;
    const dst = (n - 1 - j) * n;
    for (let i = 0; i < n; i++) data[dst + i] = cellsArr[src + i] ? 255 : 0;
  }
  tex.needsUpdate = true;
}

function cellTexture(n: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array(n * n), n, n, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.unpackAlignment = 1;
  return tex;
}

export interface DotPictureOptions {
  shape: ShapeId;
  seed: number;
  /** Edge length of the (square) picture in metres. Default 2. */
  size?: number;
  /** Cells per side. Default 28 (≥ 2.4 m wide reads well at 640×360 from ~5 m). */
  cells?: number;
  /** Dot diameter as a fraction of the cell. Default 0.8. */
  dotScale?: number;
  level?: number;
  opacity?: number;
  /** Default 'wall' (the local XY plane, facing +Z). */
  facing?: Facing;
}

export interface DotPicturePair {
  /** Register with `VisionLayer.WeakOnly`. */
  readonly weak: THREE.Mesh;
  /** Register with `VisionLayer.StrongOnly`. Give it the same transform as `weak`. */
  readonly strong: THREE.Mesh;
  readonly pattern: DotPattern;
  /** New picture (same grid size). */
  setPicture(shape: ShapeId, seed: number): void;
  set(opts: Pick<DotPictureOptions, 'dotScale' | 'level' | 'opacity'>): void;
  setFade(fade: number): void;
  update(dt: number): void;
  dispose(): void;
}

/**
 * Weak quad + strong quad of one dot picture, exactly registered (identical geometry frames).
 * Put them ~2–3 cm in front of a both-eye backing board of `DOT_BOARD_GREY`.
 */
export function createDotPicturePair(opts: DotPictureOptions): DotPicturePair {
  const n = Math.max(4, Math.round(opts.cells ?? DOT_CELLS));
  const size = opts.size ?? 2;
  const facing = opts.facing ?? 'wall';
  const make = (name: string): { mesh: THREE.Mesh; tex: THREE.DataTexture; mat: THREE.ShaderMaterial; u: ReturnType<typeof baseUniforms> & { dotScale: THREE.IUniform<number> } } => {
    const tex = cellTexture(n);
    const u = {
      ...baseUniforms(opts.level ?? 1, opts.opacity ?? 1),
      cellTex: { value: tex },
      cells: { value: n },
      dotScale: { value: clamp01(opts.dotScale ?? 0.8) },
    };
    const mat = layerShaderMaterial({ name, uniforms: u, fragmentShader: dotFragment, billboard: facing === 'billboard' });
    return { mesh: layerMesh(planeGeometry(size, size, facing), mat, name), tex, mat, u };
  };
  const w = make('ToolkitDotsWeak');
  const s = make('ToolkitDotsStrong');
  let pattern = generateDotPicture(opts.shape, opts.seed, n);
  const upload = (): void => {
    fillTexture(w.tex, pattern.weakCells, n);
    fillTexture(s.tex, pattern.strongCells, n);
  };
  upload();
  return {
    weak: w.mesh,
    strong: s.mesh,
    get pattern() {
      return pattern;
    },
    setPicture(shape, seed) {
      pattern = generateDotPicture(shape, seed, n);
      upload();
    },
    set(o) {
      for (const p of [w, s]) {
        if (o.dotScale !== undefined) p.u.dotScale.value = clamp01(o.dotScale);
        if (o.level !== undefined) p.u.color.value.copy(linearGrey(o.level));
        if (o.opacity !== undefined) p.u.opacity.value = clamp01(o.opacity);
      }
    },
    setFade(f) {
      applyFade(w.mat, f);
      applyFade(s.mat, f);
    },
    update() {},
    dispose() {
      for (const p of [w, s]) {
        p.mesh.geometry.dispose();
        p.mat.dispose();
        p.tex.dispose();
      }
    },
  };
}
