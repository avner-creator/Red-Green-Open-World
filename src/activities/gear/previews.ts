/**
 * Shop pictures for gear: each item renders a small image of the real thing, lazily on first call,
 * cached. One offscreen renderer of our own (never the game's vision pipeline), created on first
 * use and released once every picture is cached or after a short idle.
 * Returns a transparent PNG `data:` URL, or null if a context cannot be created. Never throws.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ShopItem } from '../../types';
import { buildGear } from './models';
import { RAINBOW_LANES } from './trailLogic';
import { bubbleTexture, sparkleTexture } from './trails';
import { paintColor, trailKind } from './catalog';
import { emotePreview } from './emotePreviews';
import type { TrailKind } from './catalog';

const SIZE = 192;
const IDLE_MS = 1500;

const cache = new Map<string, string | null>();
let renderer: THREE.WebGLRenderer | null = null;
let idle: ReturnType<typeof setTimeout> | null = null;
let total = 0;

function release(): void {
  if (idle) clearTimeout(idle);
  idle = null;
  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss();
    renderer = null;
  }
}

function getRenderer(): THREE.WebGLRenderer | null {
  if (renderer) return renderer;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    r.setPixelRatio(1);
    r.setSize(SIZE, SIZE, false);
    r.setClearColor(0x000000, 0);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NoToneMapping;
    renderer = r;
    return r;
  } catch {
    return null;
  }
}

function lights(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a93a8, 0.9));
  const key = new THREE.DirectionalLight(0xfff2dc, 2.6);
  key.position.set(2.5, 3.5, 3);
  const fill = new THREE.DirectionalLight(0xdce8ff, 1.0);
  fill.position.set(-3, 1, 2);
  const rim = new THREE.DirectionalLight(0xffffff, 2.2);
  rim.position.set(-1.5, 2.5, -3.5);
  scene.add(key, fill, rim);
}

function disposeTree(o: THREE.Object3D): void {
  o.traverse((c) => {
    if (c instanceof THREE.Mesh) {
      c.geometry.dispose();
      const m = c.material;
      for (const mm of Array.isArray(m) ? m : [m]) mm.dispose();
    }
  });
}

/** Aim a camera at `target` from direction `dir` so its bounding box fills `fill` of the frame (tight, by projection). */
function frame(cam: THREE.PerspectiveCamera, target: THREE.Object3D, dir: THREE.Vector3, fill = 0.82): void {
  target.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(target);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const d = dir.clone().normalize();
  let dist = sphere.radius / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2));
  const corners: THREE.Vector3[] = [];
  // Real vertices (and sprite corners) rather than the loose box, so wide shapes fill the frame properly.
  target.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const pos = o.geometry.getAttribute('position');
      const step = Math.max(1, Math.floor(pos.count / 400));
      for (let i = 0; i < pos.count; i += step) corners.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld));
    } else if (o instanceof THREE.Sprite) {
      const c = o.getWorldPosition(new THREE.Vector3());
      const r = o.scale.x / 2;
      for (const [dx, dy, dz] of [[r, r, 0], [-r, -r, 0], [r, -r, r], [-r, r, -r]]) corners.push(c.clone().add(new THREE.Vector3(dx, dy, dz)));
    }
  });
  if (corners.length === 0) for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
  const centre = box.getCenter(new THREE.Vector3());
  for (let pass = 0; pass < 4; pass++) {
    cam.position.copy(centre).addScaledVector(d, dist);
    cam.near = dist / 50;
    cam.far = dist * 4;
    cam.updateProjectionMatrix();
    cam.lookAt(centre);
    cam.updateMatrixWorld(true);
    let m = 0;
    for (const c of corners) {
      const p = c.clone().project(cam);
      m = Math.max(m, Math.abs(p.x), Math.abs(p.y));
    }
    if (m > 0) dist *= Math.max(0.3, m / fill);
  }
  cam.position.copy(centre).addScaledVector(d, dist);
  cam.lookAt(centre);
}

// ───────────── subjects ─────────────

const VIEWS: Record<string, THREE.Vector3> = {
  head: new THREE.Vector3(0.75, 0.55, 1.5),
  face: new THREE.Vector3(0.7, 0.25, 1.4),
  back: new THREE.Vector3(-0.75, 0.3, -1.5),
};

function wearableScene(item: ShopItem, scene: THREE.Scene, cam: THREE.PerspectiveCamera): (() => void) | null {
  const w = buildGear(item.id);
  if (!w) return null;
  w.update?.(0.07, 0);
  scene.add(w.object);
  frame(cam, w.object, VIEWS[item.slot] ?? VIEWS.head);
  return () => w.dispose();
}

function buggy(color: number): THREE.Group {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.2 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1e26, roughness: 0.7 });
  const bright = new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.3, metalness: 0.4 });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  add(new RoundedBoxGeometry(1.7, 0.36, 0.95, 4, 0.12), paint, 0, 0.42, 0); // body
  add(new RoundedBoxGeometry(0.7, 0.3, 0.8, 4, 0.1), paint, -0.1, 0.72, 0); // cabin
  add(new RoundedBoxGeometry(0.62, 0.2, 0.7, 3, 0.07), dark, -0.1, 0.78, 0).scale.set(1, 1, 1.02); // seat shadow
  add(new RoundedBoxGeometry(0.5, 0.08, 0.86, 2, 0.03), bright, 0.62, 0.62, 0); // hood stripe
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const wheel = add(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 20), dark, sx * 0.6, 0.3, sz * 0.55);
    wheel.rotation.x = Math.PI / 2;
    const hub = add(new THREE.CylinderGeometry(0.14, 0.14, 0.22, 14), bright, sx * 0.6, 0.3, sz * 0.55);
    hub.rotation.x = Math.PI / 2;
  }
  add(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 8), bright, 0.9, 0.5, 0.3).rotation.z = Math.PI / 2; // lamp
  add(new THREE.CylinderGeometry(0.06, 0.06, 0.25, 8), bright, 0.9, 0.5, -0.3).rotation.z = Math.PI / 2;
  return g;
}

function paintScene(item: ShopItem, scene: THREE.Scene, cam: THREE.PerspectiveCamera): (() => void) | null {
  const color = paintColor(item.id);
  if (color === null) return null;
  const root = new THREE.Group();
  // A pale pad under the buggy, so dark paints still stand out against a dark card.
  const pad = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.1, 0.05, 40),
    new THREE.MeshStandardMaterial({ color: 0xd8dee9, roughness: 0.6 }),
  );
  pad.position.y = -0.03;
  root.add(pad, buggy(color));
  root.rotation.y = -0.55;
  scene.add(root);
  frame(cam, root, new THREE.Vector3(0.1, 0.62, 1.4), 0.78);
  return () => disposeTree(root);
}

function ribbonMesh(): THREE.Mesh {
  const L = RAINBOW_LANES.length;
  const N = 26;
  const lane = RAINBOW_LANES.map((h) => new THREE.Color(h));
  const centre = (t: number): THREE.Vector3 =>
    new THREE.Vector3(-1.3 + t * 2.6, 0.1 + Math.sin(t * Math.PI * 2.4) * 0.07, Math.sin(t * Math.PI * 1.6) * 0.5);
  const P: number[] = [];
  const C: number[] = [];
  const side = (t: number): THREE.Vector3 => {
    const a = centre(Math.max(0, t - 0.02));
    const b = centre(Math.min(1, t + 0.02));
    const d = b.sub(a);
    return new THREE.Vector3(-d.z, 0, d.x).normalize();
  };
  const at = (t: number, f: number): THREE.Vector3 => {
    const half = 0.28 * (0.3 + 0.7 * Math.min(1, t * 1.6));
    return centre(t).addScaledVector(side(t), -half + f * half * 2);
  };
  for (let i = 0; i < N - 1; i++) {
    const t0 = i / (N - 1);
    const t1 = (i + 1) / (N - 1);
    for (let l = 0; l < L; l++) {
      const q = [at(t0, l / L), at(t0, (l + 1) / L), at(t1, l / L), at(t1, (l + 1) / L)];
      for (const k of [0, 1, 2, 1, 3, 2]) {
        P.push(q[k].x, q[k].y, q[k].z);
        C.push(lane[l].r, lane[l].g, lane[l].b);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
}

function trailScene(kind: TrailKind, scene: THREE.Scene, cam: THREE.PerspectiveCamera): (() => void) | null {
  const root = new THREE.Group();
  const disposables: Array<{ dispose(): void }> = [];
  const sprites = (tex: THREE.Texture, n: number, size: (i: number) => number, at: (i: number) => THREE.Vector3): void => {
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      disposables.push(mat);
      const s = new THREE.Sprite(mat);
      s.scale.setScalar(size(i));
      s.position.copy(at(i));
      root.add(s);
    }
  };
  if (kind === 'rainbow') {
    const r = ribbonMesh();
    root.add(r);
    disposables.push(r.geometry, r.material as THREE.Material);
    const tex = sparkleTexture();
    disposables.push(tex);
    sprites(tex, 4, (i) => 0.34 - i * 0.04, (i) => new THREE.Vector3(-0.8 + i * 0.6, 0.55 + (i % 2) * 0.25, Math.sin(i * 2) * 0.3));
    root.rotation.y = -0.35;
  } else if (kind === 'sparkle') {
    const tex = sparkleTexture();
    disposables.push(tex);
    const sizes = [0.9, 0.5, 0.65, 0.38, 0.55, 0.3, 0.42];
    sprites(tex, sizes.length, (i) => sizes[i], (i) => new THREE.Vector3(-1.3 + i * 0.43, Math.sin(i * 1.3) * 0.45, 0));
  } else {
    const tex = bubbleTexture();
    disposables.push(tex);
    const sizes = [0.85, 0.5, 0.65, 0.36, 0.5, 0.28];
    sprites(tex, sizes.length, (i) => sizes[i], (i) => new THREE.Vector3(-1.2 + i * 0.5, Math.sin(i * 1.7) * 0.5, 0));
  }
  scene.add(root);
  frame(cam, root, new THREE.Vector3(0.0, kind === 'rainbow' ? 0.9 : 0.05, 1.6), kind === 'rainbow' ? 0.86 : 0.8);
  return () => {
    disposeTree(root);
    for (const d of disposables) d.dispose();
  };
}

function render(item: ShopItem): string | null {
  const r = getRenderer();
  if (!r) return null;
  const scene = new THREE.Scene();
  lights(scene);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  let cleanup: (() => void) | null = null;
  if (item.slot === 'head' || item.slot === 'face' || item.slot === 'back') cleanup = wearableScene(item, scene, cam);
  else if (item.slot === 'carColor') cleanup = paintScene(item, scene, cam);
  else if (item.slot === 'trail') {
    const k = trailKind(item.id);
    if (k) cleanup = trailScene(k, scene, cam);
  }
  if (!cleanup) return null;
  r.render(scene, cam);
  const url = r.domElement.toDataURL('image/png');
  cleanup();
  return url;
}

/** Picture for an item (cached); null for items without one (emotes) or when no context is available. */
export function previewFor(item: ShopItem): string | null {
  if (cache.has(item.id)) return cache.get(item.id) ?? null;
  let url: string | null;
  try {
    url = render(item);
  } catch {
    url = null;
  }
  cache.set(item.id, url);
  if (idle) clearTimeout(idle);
  idle = setTimeout(release, IDLE_MS);
  if (total > 0 && cache.size >= total) release();
  return url;
}

/** Give every gear item that has a picture a `preview()` (emotes use the UI icon). */
export function withPreviews(items: readonly ShopItem[], enabled: () => boolean = () => true): ShopItem[] {
  const out = items.map((it): ShopItem => {
    if (it.slot === 'emote') return { ...it, preview: () => emotePreview(it.id) };
    return { ...it, preview: () => (enabled() ? previewFor(it) : null) };
  });
  total = out.filter((i) => i.preview).length;
  return out;
}
