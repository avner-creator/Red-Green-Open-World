/**
 * Collects many small coloured parts and merges them into one mesh per material (one draw each).
 * Inside each mesh, parts are grouped in 16 m cells; when the camera moves, the index list is rebuilt
 * from the cells in view, and small parts drop out with distance (per quality). The main meshes cast
 * no shadow: one position-only proxy of the bigger, non-flat parts (on the shadow-proxy layer) does,
 * culled to the sun's shadow box.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MatKey, Materials } from './materials';
import type { Quality } from '../types';
import { asShadowProxy, shadowProxyMaterial } from '../core/shadow-proxy';

export interface AddOpts {
  /** Darken vertices close to this world y (fake contact AO). */
  aoY?: number;
  /** Height over which the AO fades out (default 1.2 m). */
  aoH?: number;
  /** AO strength 0..1 (default 0.45). */
  ao?: number;
}

/** Cell size (m) for culling and distance LOD inside each merged mesh. */
const CELL = 16;
/** Flat or tiny things: decals, road paint, paving, bunting and flags cast no shadow. */
const NO_SHADOW: ReadonlySet<MatKey> = new Set<MatKey>(['glow', 'window', 'paving', 'road', 'cloth']);
const NO_RECEIVE: ReadonlySet<MatKey> = new Set<MatKey>(['glow']);
/**
 * Size classes by bounding radius (m) and how far away each is still drawn, per quality (index 0 =
 * the biggest class). Small props stop drawing where they would be a few pixels tall.
 */
const CLASS_R = [0.3, 0.6, 1.5, 4] as const;
const CLASSES = CLASS_R.length + 1;
export const STATIC_MAX_DIST: Record<Quality, readonly number[]> = {
  low: [Infinity, 140, 80, 45, 30],
  medium: [Infinity, 220, 125, 75, 50],
  high: [Infinity, 320, 180, 110, 75],
};
/**
 * Shadow proxy: only parts at least this big (radius, m) and this tall (m) cast a shadow, and the
 * smaller ones only close to the camera (props like benches keep their contact shadow up close).
 */
const PROXY_MIN_R = 0.3;
const PROXY_MIN_H = 0.12;
const PROXY_MAX_DIST: readonly number[] = [Infinity, 120, 45, 22, 0];
/** Proxy parts smaller than this (radius, m) with more than 12 triangles cast as their box. */
const PROXY_BOX_R = 1;

const tmpColor = new THREE.Color();
const tmpBox = new THREE.Box3();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3();

interface Part {
  geo: THREE.BufferGeometry;
  cell: number;
  /** Size class, 0 = biggest. */
  cls: number;
}

/**
 * A cell's range in a merged mesh. Parts are sorted by cell and, within a cell, from big to small,
 * so what a cell shows at some distance is a prefix of its range.
 */
interface CellRange {
  x: number;
  y: number;
  z: number;
  r: number;
  start: number;
  /** End (in vertices) of the parts of each size class and all bigger ones. */
  ends: number[];
}

interface Layer {
  mesh: THREE.Mesh;
  cells: CellRange[];
  index: THREE.BufferAttribute;
}

const cellOf = (x: number, z: number): number => (Math.floor(x / CELL) + 512) * 1024 + Math.floor(z / CELL) + 512;

function buildLayer(parts: Part[], material: THREE.Material, positionsOnly: boolean): Layer | null {
  if (!parts.length) return null;
  parts.sort((a, b) => a.cell - b.cell || a.cls - b.cls);
  const geos = parts.map((p) => {
    if (!positionsOnly) return p.geo;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', p.geo.attributes.position);
    return g;
  });
  const merged = mergeGeometries(geos, false);
  if (!merged) return null;
  const total = merged.attributes.position.count;
  const cells: CellRange[] = [];
  const box = new THREE.Box3();
  let v = 0;
  let cur: CellRange | null = null;
  let curKey = -1;
  for (const p of parts) {
    if (p.cell !== curKey || !cur) {
      if (cur) cells.push(cur);
      curKey = p.cell;
      box.makeEmpty();
      cur = { x: 0, y: 0, z: 0, r: 0, start: v, ends: new Array<number>(CLASSES).fill(v) };
    }
    tmpBox.setFromBufferAttribute(p.geo.attributes.position as THREE.BufferAttribute);
    box.union(tmpBox);
    box.getCenter(tmpV);
    cur.x = tmpV.x;
    cur.y = tmpV.y;
    cur.z = tmpV.z;
    cur.r = box.getSize(tmpS).length() / 2;
    v += p.geo.attributes.position.count;
    for (let k = p.cls; k < CLASSES; k++) cur.ends[k] = v;
  }
  if (cur) cells.push(cur);
  // Identity index rewritten per view. It starts with everything, so a mesh nobody updates draws whole.
  const idx = new Uint32Array(total);
  for (let i = 0; i < total; i++) idx[i] = i;
  const index = new THREE.BufferAttribute(idx, 1);
  index.setUsage(THREE.DynamicDrawUsage);
  merged.setIndex(index);
  merged.computeBoundingSphere();
  const mesh = new THREE.Mesh(merged, material);
  mesh.matrixAutoUpdate = false;
  // Culled per cell in `Batcher.update`.
  mesh.frustumCulled = false;
  return { mesh, cells, index };
}

const _frustum = new THREE.Frustum();
const _pv = new THREE.Matrix4();
const _sphere = new THREE.Sphere();
const _cam = new THREE.Vector3();
const _dir = new THREE.Vector3();

/** Rewrite a layer's index list: cells in the frustum, each up to the size class its distance allows. */
function selectLayer(L: Layer, frustum: THREE.Frustum, cam: THREE.Vector3, maxD: readonly number[], pad: number): void {
  const arr = L.index.array as Uint32Array;
  let k = 0;
  for (const c of L.cells) {
    _sphere.center.set(c.x, c.y, c.z);
    _sphere.radius = c.r + pad;
    if (!frustum.intersectsSphere(_sphere)) continue;
    const d = Math.hypot(c.x - cam.x, c.y - cam.y, c.z - cam.z) - c.r;
    let cls = -1;
    while (cls + 1 < CLASSES && d <= maxD[cls + 1]) cls++;
    const end = cls < 0 ? c.start : c.ends[cls];
    for (let i = c.start; i < end; i++) arr[k++] = i;
  }
  L.index.clearUpdateRanges();
  L.index.addUpdateRange(0, k);
  L.index.needsUpdate = true;
  L.mesh.geometry.setDrawRange(0, k);
}

export class Batcher {
  private buckets = new Map<MatKey, Part[]>();
  private proxyParts: Part[] = [];
  private layers: Layer[] = [];
  private proxy: Layer | null = null;
  private quality: Quality = 'medium';
  private lastPos = new THREE.Vector3(1e9, 0, 0);
  private lastDir = new THREE.Vector3();
  private lastShadow = new THREE.Vector3(1e9, 0, 0);
  private dirty = true;
  triangles = 0;

  add(key: MatKey, geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, matrix?: THREE.Matrix4, opts?: AddOpts): void {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    for (const name of Object.keys(g.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'color' && name !== 'aWave') g.deleteAttribute(name);
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    const pos = g.attributes.position;
    const n = pos.count;
    if (!g.attributes.color) {
      tmpColor.set(color);
      const c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        c[i * 3] = tmpColor.r;
        c[i * 3 + 1] = tmpColor.g;
        c[i * 3 + 2] = tmpColor.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    }
    if (opts?.aoY !== undefined) {
      const col = g.attributes.color;
      const hh = opts.aoH ?? 1.2;
      const k = opts.ao ?? 0.45;
      for (let i = 0; i < n; i++) {
        const t = THREE.MathUtils.clamp((pos.getY(i) - opts.aoY) / hh, 0, 1);
        const f = 1 - k * (1 - t * t * (3 - 2 * t));
        col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f);
      }
    }
    if (key === 'cloth' && !g.attributes.aWave) g.setAttribute('aWave', new THREE.BufferAttribute(new Float32Array(n), 1));
    if (key !== 'cloth' && g.attributes.aWave) g.deleteAttribute('aWave');
    tmpBox.setFromBufferAttribute(pos as THREE.BufferAttribute).getCenter(tmpV);
    tmpBox.getSize(tmpS);
    const r = tmpS.length() / 2;
    let small = 0;
    while (small < CLASS_R.length && r < CLASS_R[CLASS_R.length - 1 - small]) small++;
    const part: Part = { geo: g, cell: cellOf(tmpV.x, tmpV.z), cls: small };
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = []));
    b.push(part);
    // Shadow proxy: big enough, not flat, on a material that casts.
    // Small detailed parts (posts, knobs, finials) cast through their oriented box: same footprint
    // at shadow-map resolution, a fraction of the triangles.
    if (!NO_SHADOW.has(key) && r >= PROXY_MIN_R && tmpS.y >= PROXY_MIN_H) {
      if (r < PROXY_BOX_R && n > 36) {
        tmpBox.setFromBufferAttribute(geo.attributes.position as THREE.BufferAttribute);
        const bs = tmpBox.getSize(new THREE.Vector3());
        const bc = tmpBox.getCenter(new THREE.Vector3());
        const bx = new THREE.BoxGeometry(Math.max(bs.x, 0.01), Math.max(bs.y, 0.01), Math.max(bs.z, 0.01)).translate(bc.x, bc.y, bc.z).toNonIndexed();
        if (matrix) bx.applyMatrix4(matrix);
        this.proxyParts.push({ geo: bx, cell: part.cell, cls: part.cls });
      } else this.proxyParts.push(part);
    }
    this.triangles += n / 3;
  }

  /** Merge everything into meshes (one per material, plus one shadow proxy) and add them to `parent`. */
  build(parent: THREE.Object3D, mats: Materials): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    // The proxy shares the parts' position arrays; build it before the colour meshes dispose them.
    this.proxy = buildLayer([...this.proxyParts], shadowProxyMaterial(), true);
    if (this.proxy) {
      asShadowProxy(this.proxy.mesh);
      this.proxy.mesh.name = 'static:shadow';
      parent.add(this.proxy.mesh);
    }
    for (const [key, parts] of this.buckets) {
      const L = buildLayer(parts, mats.get(key), false);
      for (const p of parts) p.geo.dispose();
      if (!L) continue;
      L.mesh.name = `static:${key}`;
      L.mesh.castShadow = false;
      L.mesh.receiveShadow = !NO_RECEIVE.has(key);
      parent.add(L.mesh);
      this.layers.push(L);
      out.push(L.mesh);
    }
    this.buckets.clear();
    this.proxyParts = [];
    return out;
  }

  setQuality(q: Quality): void {
    this.quality = q;
    this.dirty = true;
  }

  /**
   * Cull cells for this camera, and the shadow proxy to the sun's shadow box (hidden when the sun
   * casts no shadow). Cheap; only re-selects after the camera or the shadow box moved.
   */
  update(camera: THREE.Camera, sun?: THREE.DirectionalLight): void {
    camera.updateMatrixWorld();
    camera.getWorldPosition(_cam);
    camera.getWorldDirection(_dir);
    const maxD = STATIC_MAX_DIST[this.quality];
    const moved = this.dirty || _cam.distanceToSquared(this.lastPos) > 1 || _dir.dot(this.lastDir) < 0.9993;
    if (moved) {
      this.lastPos.copy(_cam);
      this.lastDir.copy(_dir);
      _pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_pv);
      for (const L of this.layers) selectLayer(L, _frustum, _cam, maxD, 4);
    }
    const P = this.proxy;
    this.dirty = false;
    if (!P) return;
    P.mesh.visible = sun?.castShadow === true;
    if (!sun || !P.mesh.visible) return;
    // The shadow box follows the camera in texel steps: re-select when it or the camera moved.
    sun.shadow.updateMatrices(sun);
    const sc = sun.shadow.camera;
    if (!moved && sc.position.distanceToSquared(this.lastShadow) < 1) return;
    this.lastShadow.copy(sc.position);
    _pv.multiplyMatrices(sc.projectionMatrix, sc.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_pv);
    selectLayer(P, _frustum, _cam, PROXY_MAX_DIST, 0);
  }
}

// ───────────── transform helpers ─────────────

const q = new THREE.Quaternion();
const e = new THREE.Euler();
const p = new THREE.Vector3();
const s = new THREE.Vector3();

/** Matrix from position, yaw (and optional pitch/roll) and scale. */
export function T(x: number, y: number, z: number, yaw = 0, sx = 1, sy = 1, sz = 1, pitch = 0, roll = 0): THREE.Matrix4 {
  e.set(pitch, yaw, roll, 'YXZ');
  q.setFromEuler(e);
  return new THREE.Matrix4().compose(p.set(x, y, z), q, s.set(sx, sy, sz));
}

/** parent × local */
export function M(parent: THREE.Matrix4, local: THREE.Matrix4): THREE.Matrix4 {
  return parent.clone().multiply(local);
}
