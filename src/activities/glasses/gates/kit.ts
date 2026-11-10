/**
 * Small shared kit for the two both-eye mechanics (half-symbol gates and dot-picture signs; the
 * dotsigns folder imports it from here): the per-session tier staircase, the site frame, a
 * Canvas2D atlas with flat swatches, one merged both-eye mesh whose parts can be animated on the
 * CPU (one draw call for every static part), and a one-draw-call confetti burst.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GlassesTier } from '../../../types';

// ───────────────────────────── progression (pure) ─────────────────────────────

/** Gentle per-session staircase: a hit moves one step finer, a miss one step coarser (1..3). */
export function nextTier(tier: GlassesTier, hit: boolean): GlassesTier {
  if (hit) return tier >= 3 ? 3 : ((tier + 1) as GlassesTier);
  return tier <= 1 ? 1 : ((tier - 1) as GlassesTier);
}

/** Uniform integer in [0, n) from a 0..1 generator. */
export const randInt = (rng: () => number, n: number): number => Math.min(n - 1, Math.floor(rng() * n));

// ───────────────────────────── site frame ─────────────────────────────

export interface SiteFrame {
  /** World → site-local (x right, z towards the approach). */
  toLocal(x: number, z: number): { x: number; z: number };
  /** Site-local → world XZ. */
  toWorld(x: number, z: number): { x: number; z: number };
}

export function siteFrame(site: { x: number; z: number; yaw: number }): SiteFrame {
  const c = Math.cos(site.yaw);
  const s = Math.sin(site.yaw);
  return {
    toLocal(x, z) {
      const dx = x - site.x;
      const dz = z - site.z;
      return { x: dx * c - dz * s, z: dx * s + dz * c };
    },
    toWorld(x, z) {
      return { x: site.x + x * c + z * s, z: site.z - x * s + z * c };
    },
  };
}

// ───────────────────────────── atlas ─────────────────────────────

/** Atlas: 4 × 2 cells of 256 px. Row 0 = picture cells 0..3, row 1 = 8 × 2 flat swatches. */
export const ATLAS_W = 1024;
export const ATLAS_H = 512;
export const CELL = 256;

export type UvRect = [number, number, number, number];

/** A flat colour: `diffuse` lit colour, `glow` self-light (sRGB hex or null = 30 % of diffuse). */
export interface SwatchDef {
  diffuse: string;
  glow?: string | null;
}

export interface Atlas {
  readonly map: THREE.CanvasTexture;
  readonly glow: THREE.CanvasTexture;
  /** Draw into picture cell `i` (0..3) of both canvases: `fn` gets a 256 px context at the cell origin. */
  drawCell(i: number, fn: (g: CanvasRenderingContext2D) => void, glowScale?: number): void;
  cellUv(i: number): UvRect;
  swatchUv(name: string): UvRect;
  dispose(): void;
}

function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const g = c.getContext('2d');
  if (!g) throw new Error('2d canvas unavailable');
  return g;
}

/**
 * Two canvases with the same layout: the diffuse map and the self-light map. A swatch with a
 * black diffuse and a grey glow renders as that grey whatever the sun does (dark sign panels).
 */
export function createAtlas(swatches: Record<string, SwatchDef>): Atlas {
  const mk = (): HTMLCanvasElement => {
    const c = document.createElement('canvas');
    c.width = ATLAS_W;
    c.height = ATLAS_H;
    return c;
  };
  const dc = mk();
  const gc = mk();
  const d = ctx2d(dc);
  const g = ctx2d(gc);
  d.fillStyle = '#000';
  d.fillRect(0, 0, ATLAS_W, ATLAS_H);
  g.fillStyle = '#000';
  g.fillRect(0, 0, ATLAS_W, ATLAS_H);
  const names = Object.keys(swatches);
  const slot = (i: number): [number, number] => [(i % 8) * 128, CELL + Math.floor(i / 8) * 128];
  names.forEach((n, i) => {
    const [x, y] = slot(i);
    const s = swatches[n];
    d.fillStyle = s.diffuse;
    d.fillRect(x, y, 128, 128);
    if (s.glow) {
      g.fillStyle = s.glow;
      g.fillRect(x, y, 128, 128);
    } else {
      g.globalAlpha = 0.3;
      g.fillStyle = s.diffuse;
      g.fillRect(x, y, 128, 128);
      g.globalAlpha = 1;
    }
  });
  const tex = (c: HTMLCanvasElement): THREE.CanvasTexture => {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  };
  const map = tex(dc);
  const glow = tex(gc);
  return {
    map,
    glow,
    drawCell(i, fn, glowScale = 0.32) {
      const x = i * CELL;
      for (const [c, k] of [[d, 1], [g, glowScale]] as const) {
        c.save();
        c.clearRect(x, 0, CELL, CELL);
        c.fillStyle = '#000';
        c.fillRect(x, 0, CELL, CELL);
        c.translate(x, 0);
        c.beginPath();
        c.rect(0, 0, CELL, CELL);
        c.clip();
        fn(c);
        c.restore();
        if (k < 1) {
          // Self-light = the picture scaled down.
          c.save();
          c.globalCompositeOperation = 'multiply';
          const v = Math.round(255 * k);
          c.fillStyle = `rgb(${v},${v},${v})`;
          c.fillRect(x, 0, CELL, CELL);
          c.restore();
        }
      }
      map.needsUpdate = true;
      glow.needsUpdate = true;
    },
    cellUv(i) {
      const inset = 2;
      return [(i * CELL + inset) / ATLAS_W, 1 - (CELL - inset) / ATLAS_H, (CELL - 2 * inset) / ATLAS_W, (CELL - 2 * inset) / ATLAS_H];
    },
    swatchUv(name) {
      const i = names.indexOf(name);
      if (i < 0) throw new Error(`unknown swatch ${name}`);
      const [x, y] = slot(i);
      return [(x + 24) / ATLAS_W, 1 - (y + 104) / ATLAS_H, 80 / ATLAS_W, 80 / ATLAS_H];
    },
    dispose() {
      map.dispose();
      glow.dispose();
    },
  };
}

/** Lit material for the merged both-eye mesh (diffuse atlas + self-light atlas). */
export function createSiteMaterial(atlas: Atlas): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: atlas.map,
    emissive: new THREE.Color(1, 1, 1),
    emissiveMap: atlas.glow,
    emissiveIntensity: 1,
    roughness: 0.82,
    metalness: 0,
  });
}

// ───────────────────────────── geometry helpers ─────────────────────────────

/** Map every UV of `geo` into `rect` (in place). */
export function remapUv(geo: THREE.BufferGeometry, rect: UvRect): THREE.BufferGeometry {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute | undefined;
  if (!uv) return geo;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, rect[0] + uv.getX(i) * rect[2], rect[1] + uv.getY(i) * rect[3]);
  return geo;
}

/** Every UV of `geo` at the centre of `rect` (flat colour; for geometry with odd UVs). */
export function flatUv(geo: THREE.BufferGeometry, rect: UvRect): THREE.BufferGeometry {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute | undefined;
  if (!uv) return geo;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, rect[0] + rect[2] / 2, rect[1] + rect[3] / 2);
  return geo;
}

export function boxGeo(w: number, h: number, d: number, x: number, y: number, z: number, uv: UvRect): THREE.BufferGeometry {
  return remapUv(new THREE.BoxGeometry(w, h, d).translate(x, y, z), uv);
}

/** Quad in the XY plane facing +Z (or -Z with `back`), UVs over `uv`. */
export function quadGeo(w: number, h: number, x: number, y: number, z: number, uv: UvRect, back = false): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h);
  if (back) g.rotateY(Math.PI);
  return remapUv(g.translate(x, y, z), uv);
}

// ───────────────────────────── merged, part-animated mesh ─────────────────────────────

export interface PartMesh {
  readonly mesh: THREE.Mesh;
  /** Transform part `name` by `m` (local to the mesh), or back to rest with null. */
  setPart(name: string, m: THREE.Matrix4 | null): void;
  dispose(): void;
}

/**
 * Merge named parts into ONE mesh (one draw call). A part can later be moved/squashed on the CPU
 * (rewrites only its vertex range), so celebrations need no extra draw calls.
 */
export function createPartMesh(parts: Record<string, THREE.BufferGeometry[]>, material: THREE.Material, name: string): PartMesh {
  const ranges = new Map<string, [number, number]>();
  const geos: THREE.BufferGeometry[] = [];
  let at = 0;
  for (const [key, list] of Object.entries(parts)) {
    let n = 0;
    for (const g of list) {
      const ng = g.index ? g.toNonIndexed() : g;
      if (ng !== g) g.dispose();
      if (!ng.getAttribute('normal')) ng.computeVertexNormals();
      geos.push(ng);
      n += ng.getAttribute('position').count;
    }
    ranges.set(key, [at, n]);
    at += n;
  }
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) throw new Error(`${name}: merge failed`);
  const pos = merged.getAttribute('position') as THREE.BufferAttribute;
  const nor = merged.getAttribute('normal') as THREE.BufferAttribute;
  pos.setUsage(THREE.DynamicDrawUsage);
  nor.setUsage(THREE.DynamicDrawUsage);
  const basePos = Float32Array.from(pos.array as Float32Array);
  const baseNor = Float32Array.from(nor.array as Float32Array);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  // Room for squash/stretch without culling glitches.
  if (merged.boundingSphere) merged.boundingSphere.radius += 1.5;
  const mesh = new THREE.Mesh(merged, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const v = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  return {
    mesh,
    setPart(key, m) {
      const r = ranges.get(key);
      if (!r) return;
      const [start, count] = r;
      const P = pos.array as Float32Array;
      const N = nor.array as Float32Array;
      if (m) nm.getNormalMatrix(m);
      for (let i = start; i < start + count; i++) {
        const k = i * 3;
        if (!m) {
          P[k] = basePos[k];
          P[k + 1] = basePos[k + 1];
          P[k + 2] = basePos[k + 2];
          N[k] = baseNor[k];
          N[k + 1] = baseNor[k + 1];
          N[k + 2] = baseNor[k + 2];
          continue;
        }
        v.set(basePos[k], basePos[k + 1], basePos[k + 2]).applyMatrix4(m);
        P[k] = v.x;
        P[k + 1] = v.y;
        P[k + 2] = v.z;
        v.set(baseNor[k], baseNor[k + 1], baseNor[k + 2]).applyMatrix3(nm).normalize();
        N[k] = v.x;
        N[k + 1] = v.y;
        N[k + 2] = v.z;
      }
      pos.addUpdateRange(start * 3, count * 3);
      nor.addUpdateRange(start * 3, count * 3);
      pos.needsUpdate = true;
      nor.needsUpdate = true;
    },
    dispose() {
      merged.dispose();
    },
  };
}

const _m = new THREE.Matrix4();
const _t = new THREE.Matrix4();

/**
 * Squash/stretch + tilt about a pivot on the ground: scale (sx, sy, sz) and roll `roll` (radians
 * about Z) around (px, py, pz), then lift by `lift`.
 */
export function pivotMatrix(px: number, py: number, pz: number, sx: number, sy: number, sz: number, roll = 0, lift = 0, out = new THREE.Matrix4()): THREE.Matrix4 {
  out.makeTranslation(px, py + lift, pz);
  out.multiply(_m.makeRotationZ(roll));
  out.multiply(_t.makeScale(sx, sy, sz));
  out.multiply(_m.makeTranslation(-px, -py, -pz));
  return out;
}

/** Happy squash (0..1 progress): down, up with a stretch, settle. */
export function squashCurve(t: number): { sy: number; sxz: number } {
  if (t >= 1 || t <= 0) return { sy: 1, sxz: 1 };
  const s = Math.sin(t * Math.PI * 3) * (1 - t) * 0.22;
  return { sy: 1 - s, sxz: 1 + s * 0.6 };
}

/** Wobble (0..1 progress): a decaying side-to-side roll, radians. */
export const wobbleCurve = (t: number): number => (t >= 1 || t <= 0 ? 0 : Math.sin(t * Math.PI * 6) * (1 - t) * 0.09);

// ───────────────────────────── confetti (one draw call) ─────────────────────────────

/** Bright and dark entries so the burst reads by brightness in the R-only and the G-only picture. */
const CONFETTI = [0xffffff, 0xffe066, 0x1b2a6b, 0xffffff, 0x9fd8ff, 0x101318, 0xffb0e0, 0xfff2b0];

export class Confetti {
  readonly mesh: THREE.InstancedMesh;
  private readonly geo = new THREE.PlaneGeometry(0.16, 0.1);
  private readonly mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: true });
  private readonly p: Float32Array; // px py pz vx vy vz age life spin
  private readonly max: number;
  private alive = 0;
  private next = 0;
  private readonly obj = new THREE.Object3D();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(max = 90) {
    this.max = max;
    this.p = new Float32Array(max * 9);
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, max);
    this.mesh.name = 'glasses:confetti';
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const c = new THREE.Color();
    for (let i = 0; i < max; i++) {
      this.mesh.setMatrixAt(i, this.zero);
      this.mesh.setColorAt(i, c.setHex(CONFETTI[i % CONFETTI.length]));
    }
    this.mesh.visible = false;
  }

  /** Burst `n` pieces at a world point (deterministic: driven by `rng`). */
  burst(x: number, y: number, z: number, rng: () => number, n = 45, up = 5): void {
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const o = i * 9;
      const a = rng() * Math.PI * 2;
      const sp = 1.2 + rng() * 2.6;
      this.p[o] = x;
      this.p[o + 1] = y;
      this.p[o + 2] = z;
      this.p[o + 3] = Math.cos(a) * sp;
      this.p[o + 4] = up * (0.6 + rng() * 0.6);
      this.p[o + 5] = Math.sin(a) * sp;
      this.p[o + 6] = 0;
      this.p[o + 7] = 1.6 + rng() * 0.8;
      this.p[o + 8] = (rng() - 0.5) * 14;
    }
    this.alive = this.max;
    this.mesh.visible = true;
  }

  update(dt: number): void {
    if (!this.mesh.visible) return;
    let live = 0;
    for (let i = 0; i < this.max; i++) {
      const o = i * 9;
      if (this.p[o + 7] <= 0 || this.p[o + 6] >= this.p[o + 7]) {
        this.mesh.setMatrixAt(i, this.zero);
        continue;
      }
      live++;
      const age = (this.p[o + 6] += dt);
      this.p[o + 4] -= 7.5 * dt;
      const drag = Math.exp(-1.6 * dt);
      this.p[o + 3] *= drag;
      this.p[o + 5] *= drag;
      if (this.p[o + 4] < -1.4) this.p[o + 4] = -1.4; // flutter down
      this.p[o] += this.p[o + 3] * dt;
      this.p[o + 1] += this.p[o + 4] * dt;
      this.p[o + 2] += this.p[o + 5] * dt;
      const s = Math.min(1, (this.p[o + 7] - age) * 3);
      this.obj.position.set(this.p[o], this.p[o + 1], this.p[o + 2]);
      this.obj.rotation.set(age * this.p[o + 8], age * this.p[o + 8] * 0.7, age * 3);
      this.obj.scale.setScalar(Math.max(0, s));
      this.obj.updateMatrix();
      this.mesh.setMatrixAt(i, this.obj.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.alive = live;
    if (live === 0) this.mesh.visible = false;
  }

  /** Drop every piece at once (far-idle, reset). */
  clear(): void {
    for (let i = 0; i < this.max; i++) {
      this.p[i * 9 + 7] = 0;
      this.mesh.setMatrixAt(i, this.zero);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.alive = 0;
    this.mesh.visible = false;
  }

  get live(): number {
    return this.alive;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    this.mesh.dispose();
  }
}

// ───────────────────────────── crossing test (pure) ─────────────────────────────

export interface Opening {
  /** Centre x of the opening and its plane z (site-local), half width, height above the ground. */
  cx: number;
  z: number;
  halfWidth: number;
  height: number;
}

/**
 * Did the move from `a` to `b` (site-local x, z and feet height above the opening's ground `y`)
 * pass through the opening? Either direction counts; a jump through counts while the feet are
 * below `height`; going round the posts or over the top does not. Moves longer than `maxStep`
 * (teleports, respawns) never count.
 */
export function crossesOpening(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  o: Opening,
  maxStep = 4,
): boolean {
  if (Math.hypot(b.x - a.x, b.z - a.z) > maxStep) return false;
  const da = a.z - o.z;
  const db = b.z - o.z;
  // Strictly leaving one side and reaching (or passing) the plane: counted once per pass.
  if (!((da > 0 && db <= 0) || (da < 0 && db >= 0))) return false;
  const t = da / (da - db);
  const x = a.x + (b.x - a.x) * t;
  const y = a.y + (b.y - a.y) * t;
  return Math.abs(x - o.cx) <= o.halfWidth && y < o.height && y > -1;
}
