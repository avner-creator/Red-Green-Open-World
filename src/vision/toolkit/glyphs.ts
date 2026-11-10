/**
 * World-space number / glyph sprites for the vision layers. One shared canvas-drawn atlas
 * (white glyphs on transparent: only coverage matters on a layer), and a sprite mesh that draws a
 * whole string as ONE draw call (a batch of camera-facing quads).
 *
 * The layout half of this file is pure (no DOM) so it can be unit-tested.
 */
import * as THREE from 'three';
import { applyFade, baseFragmentHead, baseUniforms, clamp01, layerMesh, layerShaderMaterial, linearGrey } from './common';
import type { Facing, LayerBlock } from './common';

// ───────────────────────────── Atlas layout (pure) ─────────────────────────────

/** Named glyphs that have no keyboard character. */
export const GLYPH = {
  times: '×',
  plus: '+',
  left: '←',
  right: '→',
  up: '↑',
  down: '↓',
  check: '✓',
  star: '★',
  heart: '♥',
  circle: '●',
  square: '■',
  triangle: '▲',
  diamond: '◆',
} as const;

/** Every glyph in the atlas, in cell order (row-major). */
export const GLYPHS: readonly string[] = [
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  '×', '+', '!', '?',
  '←', '→', '↑', '↓', '✓',
  '★', '♥', '●', '■', '▲', '◆',
];

/** Atlas grid: `cols × rows` square cells of `cell` pixels. */
export const ATLAS = { cols: 8, rows: 4, cell: 128 } as const;
/** Fraction of the cell height the ink of a digit fills (the sprite `height` is this ink height). */
export const GLYPH_INK = 0.78;

const ALIASES: Record<string, string> = { x: '×', X: '×', '*': '×', '<': '←', '>': '→', '^': '↑' };

/** Map a character to its atlas glyph (aliases resolved); unknown characters become '?'. Space → ' '. */
export function resolveGlyph(ch: string): string {
  if (ch === ' ') return ' ';
  const c = ALIASES[ch] ?? ch;
  return GLYPHS.includes(c) ? c : '?';
}

/** Horizontal advance of a glyph as a fraction of the cell (= quad) height. */
export function glyphAdvance(ch: string): number {
  if (ch === ' ') return 0.4;
  if (ch >= '0' && ch <= '9') return 0.62;
  if (ch === '!') return 0.36;
  if (ch === '×' || ch === '+' || ch === '?') return 0.66;
  return 0.9;
}

export interface GlyphCell {
  col: number;
  row: number;
  /** UV rectangle of the whole cell (v = 0 at the bottom, three's flipY convention). */
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export function glyphCell(ch: string): GlyphCell | null {
  const i = GLYPHS.indexOf(ch);
  if (i < 0) return null;
  const col = i % ATLAS.cols;
  const row = Math.floor(i / ATLAS.cols);
  const u0 = col / ATLAS.cols;
  const u1 = (col + 1) / ATLAS.cols;
  const v1 = 1 - row / ATLAS.rows;
  const v0 = 1 - (row + 1) / ATLAS.rows;
  return { col, row, u0, v0, u1, v1 };
}

export interface GlyphQuad {
  ch: string;
  /** Local rectangle in metres (centred string). */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** UV rectangle (cropped horizontally to the glyph's advance). */
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

export interface GlyphLayout {
  quads: GlyphQuad[];
  width: number;
  height: number;
}

/** Lay out `text` centred on the origin. `height` is the ink height of a digit in metres. */
export function layoutGlyphs(text: string, height: number, spacing = 0.06): GlyphLayout {
  const cellH = height / GLYPH_INK;
  const chars = [...text].map(resolveGlyph);
  const adv = chars.map(glyphAdvance);
  const width = adv.reduce((s, a) => s + a * cellH, 0) + Math.max(0, chars.length - 1) * spacing * cellH;
  const quads: GlyphQuad[] = [];
  let x = -width / 2;
  for (let i = 0; i < chars.length; i++) {
    const w = adv[i] * cellH;
    const cell = glyphCell(chars[i]);
    if (cell) {
      const cu = (cell.u0 + cell.u1) / 2;
      const hu = ((cell.u1 - cell.u0) * adv[i]) / 2;
      quads.push({ ch: chars[i], x0: x, x1: x + w, y0: -cellH / 2, y1: cellH / 2, u0: cu - hu, u1: cu + hu, v0: cell.v0, v1: cell.v1 });
    }
    x += w + spacing * cellH;
  }
  return { quads, width, height: cellH };
}

// ───────────────────────────── Atlas drawing (DOM) ─────────────────────────────

function drawGlyph(g: CanvasRenderingContext2D, ch: string, cx: number, cy: number, s: number): void {
  // s = cell size. Ink box ≈ GLYPH_INK × s tall.
  const h = s * GLYPH_INK;
  const line = s * 0.15;
  g.save();
  g.translate(cx, cy);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = line;
  const poly = (pts: number[][], fill = true): void => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x * h * 0.5, y * h * 0.5) : g.moveTo(x * h * 0.5, y * h * 0.5)));
    if (fill) {
      g.closePath();
      g.fill();
    } else g.stroke();
  };
  const k = h * 0.5;
  switch (ch) {
    case '×':
      g.beginPath();
      g.moveTo(-0.5 * k, -0.5 * k);
      g.lineTo(0.5 * k, 0.5 * k);
      g.moveTo(0.5 * k, -0.5 * k);
      g.lineTo(-0.5 * k, 0.5 * k);
      g.stroke();
      break;
    case '+':
      g.beginPath();
      g.moveTo(-0.6 * k, 0);
      g.lineTo(0.6 * k, 0);
      g.moveTo(0, -0.6 * k);
      g.lineTo(0, 0.6 * k);
      g.stroke();
      break;
    case '→':
      poly([[-0.95, -0.22], [0.15, -0.22], [0.15, -0.7], [0.98, 0], [0.15, 0.7], [0.15, 0.22], [-0.95, 0.22]]);
      break;
    case '←':
      poly([[0.95, -0.22], [-0.15, -0.22], [-0.15, -0.7], [-0.98, 0], [-0.15, 0.7], [-0.15, 0.22], [0.95, 0.22]]);
      break;
    case '↑':
      poly([[-0.22, 0.95], [-0.22, -0.15], [-0.7, -0.15], [0, -0.98], [0.7, -0.15], [0.22, -0.15], [0.22, 0.95]]);
      break;
    case '↓':
      poly([[-0.22, -0.95], [-0.22, 0.15], [-0.7, 0.15], [0, 0.98], [0.7, 0.15], [0.22, 0.15], [0.22, -0.95]]);
      break;
    case '✓':
      g.lineWidth = line * 1.25;
      poly([[-0.75, 0.05], [-0.25, 0.6], [0.8, -0.65]], false);
      break;
    case '★': {
      const pts: number[][] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 0.42 : 1;
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        pts.push([Math.cos(a) * r, Math.sin(a) * r + 0.08]);
      }
      poly(pts);
      break;
    }
    case '♥':
      g.beginPath();
      g.moveTo(0, 0.9 * k);
      g.bezierCurveTo(-1.1 * k, 0.05 * k, -0.95 * k, -0.95 * k, 0, -0.42 * k);
      g.bezierCurveTo(0.95 * k, -0.95 * k, 1.1 * k, 0.05 * k, 0, 0.9 * k);
      g.fill();
      break;
    case '●':
      g.beginPath();
      g.arc(0, 0, 0.82 * k, 0, Math.PI * 2);
      g.fill();
      break;
    case '■':
      g.fillRect(-0.74 * k, -0.74 * k, 1.48 * k, 1.48 * k);
      break;
    case '▲':
      poly([[0, -0.9], [0.95, 0.75], [-0.95, 0.75]]);
      break;
    case '◆':
      poly([[0, -0.98], [0.8, 0], [0, 0.98], [-0.8, 0]]);
      break;
    default:
      // Digits, '!' and '?': heavy font, thickened by a stroke of the same colour.
      g.font = `900 ${Math.round(h * 1.32)}px "Arial Black", "Helvetica Neue", Arial, "DejaVu Sans", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = s * 0.06;
      g.fillText(ch, 0, h * 0.05);
      g.strokeText(ch, 0, h * 0.05);
  }
  g.restore();
}

let atlas: THREE.CanvasTexture | null = null;

/** The shared glyph atlas (built on first use; never disposed). */
export function glyphAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS.cols * ATLAS.cell;
  canvas.height = ATLAS.rows * ATLAS.cell;
  const g = canvas.getContext('2d');
  if (g) {
    for (const ch of GLYPHS) {
      const c = glyphCell(ch);
      if (!c) continue;
      drawGlyph(g, ch, (c.col + 0.5) * ATLAS.cell, (c.row + 0.5) * ATLAS.cell, ATLAS.cell);
    }
  }
  atlas = new THREE.CanvasTexture(canvas);
  atlas.name = 'Toolkit.GlyphAtlas';
  atlas.generateMipmaps = true;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.magFilter = THREE.LinearFilter;
  atlas.anisotropy = 4;
  return atlas;
}

// ───────────────────────────── Sprite ─────────────────────────────

const glyphFragment = /* glsl */ `
${baseFragmentHead}
uniform sampler2D atlas;
void main() {
  float s = texture2D(atlas, vUv).a;
  // Crisp edge when magnified, smooth when minified.
  float w = clamp(fwidth(s) * 0.75, 0.02, 0.5);
  float a = smoothstep(0.5 - w, 0.5 + w, s) * opacity * fade;
  if (a <= 0.0) discard;
  gl_FragColor = vec4(color, a);
}
`;

export interface GlyphSpriteOptions {
  /** Initial text (digits, × + ! ?, arrows ← → ↑ ↓, ✓, ★ ♥ ● ■ ▲ ◆; aliases x * < > ^). */
  text?: string;
  /** Initial number (rounded); used when `text` is not given. */
  value?: number;
  /** Ink height of a digit in metres. Default 0.6. */
  height?: number;
  /** Maximum characters (buffer capacity). Default 8. */
  maxChars?: number;
  level?: number;
  opacity?: number;
  /** Default 'billboard'. 'ground' lies flat facing up, upright for a viewer on the +Z side looking towards −Z. */
  facing?: Facing;
}

export interface GlyphSpriteBlock extends LayerBlock {
  readonly mesh: THREE.Mesh;
  readonly text: string;
  /** Width of the current text in metres. */
  readonly width: number;
  setText(text: string): void;
  setValue(n: number): void;
  set(opts: Pick<GlyphSpriteOptions, 'level' | 'opacity'>): void;
}

export function createGlyphSprite(opts: GlyphSpriteOptions = {}): GlyphSpriteBlock {
  const cap = Math.max(1, opts.maxChars ?? 8);
  const height = opts.height ?? 0.6;
  const facing = opts.facing ?? 'billboard';
  const pos = new Float32Array(cap * 4 * 3);
  const uv = new Float32Array(cap * 4 * 2);
  const idx: number[] = [];
  for (let i = 0; i < cap; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
  const geo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3);
  const uvAttr = new THREE.BufferAttribute(uv, 2);
  posAttr.setUsage(THREE.DynamicDrawUsage);
  uvAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', posAttr);
  geo.setAttribute('uv', uvAttr);
  geo.setIndex(idx);
  const u = { ...baseUniforms(opts.level ?? 1, opts.opacity ?? 1), atlas: { value: glyphAtlas() } };
  const mat = layerShaderMaterial({ name: 'ToolkitGlyphs', uniforms: u, fragmentShader: glyphFragment, billboard: facing === 'billboard' });
  const mesh = layerMesh(geo, mat, 'ToolkitGlyphs');
  let text = '';
  let width = 0;

  const setText = (t: string): void => {
    const chars = [...t].slice(0, cap).join('');
    if (chars === text) return;
    text = chars;
    const lay = layoutGlyphs(text, height);
    width = lay.width;
    pos.fill(0);
    uv.fill(0);
    lay.quads.forEach((q, i) => {
      const p = i * 12;
      // Wall/billboard: XY plane. Ground: XZ plane with the top of the text towards −Z.
      const put = (k: number, x: number, y: number): void => {
        if (facing === 'ground') {
          pos[p + k * 3] = x;
          pos[p + k * 3 + 1] = 0;
          pos[p + k * 3 + 2] = -y;
        } else {
          pos[p + k * 3] = x;
          pos[p + k * 3 + 1] = y;
          pos[p + k * 3 + 2] = 0;
        }
      };
      put(0, q.x0, q.y0);
      put(1, q.x1, q.y0);
      put(2, q.x1, q.y1);
      put(3, q.x0, q.y1);
      const t2 = i * 8;
      uv.set([q.u0, q.v0, q.u1, q.v0, q.u1, q.v1, q.u0, q.v1], t2);
    });
    geo.setDrawRange(0, lay.quads.length * 6);
    posAttr.needsUpdate = true;
    uvAttr.needsUpdate = true;
    geo.computeBoundingSphere();
  };
  setText(opts.text ?? String(Math.round(opts.value ?? 0)));

  return {
    object: mesh,
    mesh,
    get text() {
      return text;
    },
    get width() {
      return width;
    },
    setText,
    setValue: (n) => setText(String(Math.round(n))),
    set(o) {
      if (o.level !== undefined) u.color.value.copy(linearGrey(o.level));
      if (o.opacity !== undefined) u.opacity.value = clamp01(o.opacity);
    },
    setFade: (f) => applyFade(mat, f),
    update() {},
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
