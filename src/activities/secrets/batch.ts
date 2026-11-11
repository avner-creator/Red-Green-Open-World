/**
 * Draw-call batching for the secrets: many small parts merged into ONE geometry (one draw), where a
 * few parts still move on their own (the vault door sinking, a trophy star spinning, a button
 * popping). A moving part's vertices are rewritten on the CPU from their rest pose and only that
 * slice of the buffer is uploaded, so a vault, a pedestal, a sign or a button row is one draw call.
 *
 * Also the both-eye surface material: a MeshStandardMaterial whose roughness, metalness and glow
 * (emissive = colour × glow) come per vertex from a `surface` attribute, so stone, brass, steel,
 * gold and lit lamps share one material and merge into one mesh.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { paint } from '../chests/bake';
import type { VertexPainter } from '../chests/bake';

/** Per-vertex surface: roughness, metalness and glow (emissive strength as a multiple of the colour). */
export interface Surf {
  rough: number;
  metal: number;
  glow?: number;
}

/** Paint a part (non-indexed, colour + `surface` attributes) for the shared surface material. */
export function surface(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation | VertexPainter, s: Surf): THREE.BufferGeometry {
  const g = paint(geo, color);
  const n = g.getAttribute('position').count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = s.rough;
    a[i * 3 + 1] = s.metal;
    a[i * 3 + 2] = s.glow ?? 0;
  }
  g.setAttribute('surface', new THREE.BufferAttribute(a, 3));
  return g;
}

/** Turn a closed shape inside out (reverse winding, flip normals): a room seen from inside. */
export function insideOut(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const name of ['position', 'normal', 'uv']) {
    const a = g.getAttribute(name);
    if (!a) continue;
    for (let i = 0; i < a.count; i += 3) {
      for (let k = 0; k < a.itemSize; k++) {
        const t = a.array[(i + 1) * a.itemSize + k];
        a.array[(i + 1) * a.itemSize + k] = a.array[(i + 2) * a.itemSize + k];
        a.array[(i + 2) * a.itemSize + k] = t;
      }
    }
  }
  const nrm = g.getAttribute('normal');
  for (let i = 0; i < nrm.array.length; i++) nrm.array[i] = -nrm.array[i];
  return g;
}

/** The shared both-eye material (see the file comment). Every geometry drawn with it needs `surface`. */
export function surfaceMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  m.name = 'SecretSurface';
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 surface;\nvarying vec3 vSurface;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvSurface = surface;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSurface;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vSurface.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vSurface.y;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += diffuseColor.rgb * vSurface.z;');
  };
  m.customProgramCacheKey = (): string => 'rg-secret-surface';
  return m;
}

const tmpN = new THREE.Matrix3();

/** Merged parts; part `i` can be moved (`setMatrix`) or recoloured (`setColor`, `setGlow`). */
export class PartBatch {
  readonly geometry: THREE.BufferGeometry;
  private readonly ranges: { start: number; count: number }[] = [];
  private readonly basePos: Float32Array;
  private readonly baseNrm: Float32Array | null;
  private readonly dirty = new Map<string, [number, number]>();

  /** `parts` must share their attribute set (all painted the same way); they are not disposed. */
  constructor(parts: readonly THREE.BufferGeometry[]) {
    let v = 0;
    for (const p of parts) {
      const n = p.getAttribute('position').count;
      this.ranges.push({ start: v, count: n });
      v += n;
    }
    const g = mergeGeometries(parts as THREE.BufferGeometry[], false);
    if (!g) throw new Error('secrets: part merge failed');
    this.geometry = g;
    this.basePos = (g.getAttribute('position').array as Float32Array).slice();
    const nrm = g.getAttribute('normal');
    this.baseNrm = nrm ? (nrm.array as Float32Array).slice() : null;
    g.computeBoundingSphere();
    g.computeBoundingBox();
  }

  get parts(): number {
    return this.ranges.length;
  }

  private mark(name: string, start: number, count: number): void {
    const attr = this.geometry.getAttribute(name) as THREE.BufferAttribute;
    if (attr.usage !== THREE.DynamicDrawUsage) attr.setUsage(THREE.DynamicDrawUsage);
    const d = this.dirty.get(name);
    if (d) {
      d[0] = Math.min(d[0], start);
      d[1] = Math.max(d[1], start + count);
    } else this.dirty.set(name, [start, start + count]);
  }

  /** Place part `i` with `m` applied to its rest pose. */
  setMatrix(i: number, m: THREE.Matrix4): void {
    const { start, count } = this.ranges[i];
    const pos = this.geometry.getAttribute('position').array as Float32Array;
    const e = m.elements;
    const b = this.basePos;
    for (let v = start * 3, end = (start + count) * 3; v < end; v += 3) {
      const x = b[v];
      const y = b[v + 1];
      const z = b[v + 2];
      pos[v] = e[0] * x + e[4] * y + e[8] * z + e[12];
      pos[v + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      pos[v + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    this.mark('position', start, count);
    if (this.baseNrm && m.determinant() !== 0) {
      const nrm = this.geometry.getAttribute('normal').array as Float32Array;
      const n = tmpN.getNormalMatrix(m).elements;
      const bn = this.baseNrm;
      for (let v = start * 3, end = (start + count) * 3; v < end; v += 3) {
        const x = bn[v];
        const y = bn[v + 1];
        const z = bn[v + 2];
        const nx = n[0] * x + n[3] * y + n[6] * z;
        const ny = n[1] * x + n[4] * y + n[7] * z;
        const nz = n[2] * x + n[5] * y + n[8] * z;
        const l = Math.hypot(nx, ny, nz) || 1;
        nrm[v] = nx / l;
        nrm[v + 1] = ny / l;
        nrm[v + 2] = nz / l;
      }
      this.mark('normal', start, count);
    }
  }

  /** Overwrite part `i`'s vertex colour (linear) with one colour. */
  setColor(i: number, c: THREE.Color): void {
    const { start, count } = this.ranges[i];
    const attr = this.geometry.getAttribute('color');
    const a = attr.array as Float32Array;
    const k = attr.itemSize;
    for (let v = start; v < start + count; v++) {
      a[v * k] = c.r;
      a[v * k + 1] = c.g;
      a[v * k + 2] = c.b;
    }
    this.mark('color', start, count);
  }

  /** Overwrite part `i`'s surface (shared surface material only). */
  setSurface(i: number, s: Surf): void {
    const { start, count } = this.ranges[i];
    const a = this.geometry.getAttribute('surface').array as Float32Array;
    for (let v = start; v < start + count; v++) {
      a[v * 3] = s.rough;
      a[v * 3 + 1] = s.metal;
      a[v * 3 + 2] = s.glow ?? 0;
    }
    this.mark('surface', start, count);
  }

  /** Upload only what changed since the last commit. */
  commit(): void {
    for (const [name, [lo, hi]] of this.dirty) {
      const attr = this.geometry.getAttribute(name) as THREE.BufferAttribute;
      attr.clearUpdateRanges();
      attr.addUpdateRange(lo * attr.itemSize, (hi - lo) * attr.itemSize);
      attr.needsUpdate = true;
    }
    this.dirty.clear();
  }

  dispose(): void {
    this.geometry.dispose();
  }
}

/** A distance cull: `content` is drawn only while the camera is within `distance` of `lod`. */
export function distanceCull(content: THREE.Object3D, distance: number): THREE.LOD {
  const lod = new THREE.LOD();
  lod.addLevel(content, 0);
  lod.addLevel(new THREE.Object3D(), distance);
  return lod;
}
