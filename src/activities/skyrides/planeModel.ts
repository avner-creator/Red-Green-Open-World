/**
 * A chunky toy biplane (original design, procedural). Five draws: the body (every solid part merged
 * with per-vertex finishes), a dark inverted-hull outline so it reads against the sky in R-only and
 * G-only, the propeller blades, the propeller blur disc and a fluttering scarf. A low-poly shadow
 * proxy (layer 7) stands in for it in the shadow pass.
 *
 * Plane space: +Z = nose, +Y = up, origin = centre of the lower wing. `seat` is where the pilot's
 * feet go (the avatar plays `sit` there).
 */
import * as THREE from 'three';
import { finish, finishMaterial, mergeFinished, placed, rodBetween } from '../../core/vertex-finish';
import { shadowProxy } from '../../core/shadow-proxy';

export interface PlaneLivery {
  /** Main body and wings (sRGB). Bright, so it pops in both channels. */
  body: number;
  /** Stripes, cowling, struts (dark in both channels). */
  trim: number;
  /** Wing roundels and spinner. */
  accent: number;
  scarf: number;
}

export const LIVERIES: readonly PlaneLivery[] = [
  { body: 0xffd23a, trim: 0x1d2a5c, accent: 0xffffff, scarf: 0xfff4e0 }, // sunny yellow, navy
  { body: 0xf4f6ff, trim: 0x2a2a36, accent: 0x55c6ff, scarf: 0xffe04a }, // white, charcoal
  { body: 0xff9a4a, trim: 0x2d1a40, accent: 0xfff1c4, scarf: 0xffffff }, // tangerine, plum
];

export const PLANE_DIMS = {
  /** Feet of the pilot (plane space). */
  seat: new THREE.Vector3(0, 0.02, -0.55),
  /** Under the wheels, plane space y (parked on the ground). */
  wheelBase: -1.18,
  span: 6.6,
  length: 4.6,
} as const;

export interface PlaneModel {
  readonly root: THREE.Group;
  /** Visual-only inner group for squash/wobble (bounces). */
  readonly body: THREE.Group;
  readonly seat: THREE.Object3D;
  /** Spin the propeller: rpm 0..1 (0 = stopped, 1 = full blur). */
  update(dt: number, rpm: number, airSpeed: number, time: number): void;
  setVisible(v: boolean): void;
  dispose(): void;
}

const shared: { mat?: THREE.MeshStandardMaterial; outline?: THREE.MeshBasicMaterial; blur?: THREE.MeshBasicMaterial; blurTex?: THREE.Texture } = {};

function outlineMaterial(): THREE.MeshBasicMaterial {
  return (shared.outline ??= new THREE.MeshBasicMaterial({ color: 0x05060c, side: THREE.BackSide }));
}

function bodyMaterial(): THREE.MeshStandardMaterial {
  return (shared.mat ??= finishMaterial('skyrides-finish'));
}

function blurMaterial(): THREE.MeshBasicMaterial {
  if (shared.blur) return shared.blur;
  const size = 128;
  let tex: THREE.Texture;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    if (g) {
      const grad = g.createRadialGradient(size / 2, size / 2, size * 0.06, size / 2, size / 2, size / 2);
      grad.addColorStop(0, 'rgba(40,40,52,0.9)');
      grad.addColorStop(0.55, 'rgba(60,60,72,0.35)');
      grad.addColorStop(0.92, 'rgba(255,255,255,0.45)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, size, size);
      // Two soft blade sweeps.
      g.translate(size / 2, size / 2);
      for (let k = 0; k < 2; k++) {
        g.rotate(Math.PI);
        g.fillStyle = 'rgba(20,20,28,0.35)';
        g.beginPath();
        g.moveTo(0, 0);
        g.arc(0, 0, size * 0.48, -0.35, 0.35);
        g.closePath();
        g.fill();
      }
    }
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
  } else {
    tex = new THREE.Texture();
  }
  shared.blurTex = tex;
  shared.blur = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  return shared.blur;
}

/** Inverted hull: copy of the geometry pushed out along its normals. */
export function outlineGeometry(g: THREE.BufferGeometry, width: number): THREE.BufferGeometry {
  const o = new THREE.BufferGeometry();
  const pos = g.getAttribute('position');
  const nor = g.getAttribute('normal');
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    out[i * 3] = pos.getX(i) + nor.getX(i) * width;
    out[i * 3 + 1] = pos.getY(i) + nor.getY(i) * width;
    out[i * 3 + 2] = pos.getZ(i) + nor.getZ(i) * width;
  }
  o.setAttribute('position', new THREE.BufferAttribute(out, 3));
  return o;
}

const R = (rough = 0.5, metal = 0.02) => ({ rough, metal });

function buildBody(l: PlaneLivery): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const body = { color: l.body, ...R(0.42) };
  const trim = { color: l.trim, ...R(0.5) };
  const accent = { color: l.accent, ...R(0.4) };
  const tyre = { color: 0x16161c, ...R(0.85) };
  const chrome = { color: 0xd8dde8, ...R(0.25, 0.6) };

  // Fuselage: fat at the nose, tapering to the tail.
  parts.push(finish(placed(new THREE.CylinderGeometry(0.66, 0.3, 3.4, 14, 1), 0, 0.2, -0.25, Math.PI / 2, 0, 0), body));
  // Rounded tail cap and nose cowling.
  parts.push(finish(placed(new THREE.SphereGeometry(0.3, 10, 8), 0, 0.2, -1.95), body));
  parts.push(finish(placed(new THREE.CylinderGeometry(0.7, 0.68, 0.55, 16, 1), 0, 0.2, 1.62, Math.PI / 2, 0, 0), trim));
  parts.push(finish(placed(new THREE.ConeGeometry(0.26, 0.55, 12), 0, 0.2, 2.15, Math.PI / 2, 0, 0), accent));
  // Belly stripe and cockpit rim.
  parts.push(finish(placed(new THREE.CylinderGeometry(0.56, 0.52, 0.22, 14, 1), 0, 0.2, -0.95, Math.PI / 2, 0, 0), trim));
  parts.push(finish(placed(new THREE.TorusGeometry(0.42, 0.09, 8, 18), 0, 0.72, -0.5, Math.PI / 2, 0, 0), trim));
  // Little windscreen.
  parts.push(finish(placed(new THREE.BoxGeometry(0.7, 0.32, 0.05), 0, 0.92, 0.0, -0.35, 0, 0), { color: 0xcfe8ff, ...R(0.1, 0.1) }));
  // Wings: rounded, chunky (flattened capsules).
  const wing = (y: number, z: number, span: number): THREE.BufferGeometry => {
    const g = new THREE.CapsuleGeometry(0.62, span - 1.24, 6, 12);
    g.rotateZ(Math.PI / 2);
    g.scale(1, 0.17, 1);
    return placed(g, 0, y, z);
  };
  parts.push(finish(wing(-0.32, 0.45, 6.2), body));
  parts.push(finish(wing(1.32, 0.62, PLANE_DIMS.span), body));
  // Roundels on the top wing and wing-tip stripes.
  for (const s of [-1, 1]) {
    parts.push(finish(placed(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 16), s * 2.2, 1.44, 0.62), trim));
    parts.push(finish(placed(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 16), s * 2.2, 1.45, 0.62), accent));
    parts.push(finish(placed(new THREE.BoxGeometry(0.22, 0.24, 1.22), s * 2.95, 1.32, 0.62), trim));
    parts.push(finish(placed(new THREE.BoxGeometry(0.22, 0.24, 1.22), s * 2.75, -0.32, 0.45), trim));
    // Interplane struts (N-shape) and cabane struts.
    parts.push(finish(rodBetween(new THREE.Vector3(s * 2.4, -0.25, 0.75), new THREE.Vector3(s * 2.4, 1.25, 0.9), 0.06), trim));
    parts.push(finish(rodBetween(new THREE.Vector3(s * 2.4, -0.25, 0.15), new THREE.Vector3(s * 2.4, 1.25, 0.3), 0.06), trim));
    parts.push(finish(rodBetween(new THREE.Vector3(s * 0.45, 0.6, 1.0), new THREE.Vector3(s * 0.55, 1.25, 0.85), 0.05), trim));
    parts.push(finish(rodBetween(new THREE.Vector3(s * 0.45, 0.6, 0.25), new THREE.Vector3(s * 0.55, 1.25, 0.35), 0.05), trim));
    // Undercarriage and fat cartoon tyres.
    parts.push(finish(rodBetween(new THREE.Vector3(s * 0.25, -0.2, 1.0), new THREE.Vector3(s * 0.75, -0.85, 1.05), 0.06), chrome));
    parts.push(finish(rodBetween(new THREE.Vector3(s * 0.25, -0.2, 0.4), new THREE.Vector3(s * 0.75, -0.85, 1.05), 0.06), chrome));
    parts.push(finish(placed(new THREE.TorusGeometry(0.24, 0.13, 8, 16), s * 0.8, -0.85, 1.05, 0, Math.PI / 2, 0), tyre));
    parts.push(finish(placed(new THREE.CylinderGeometry(0.13, 0.13, 0.2, 10), s * 0.8, -0.85, 1.05, 0, 0, Math.PI / 2), accent));
  }
  // Tail: stabiliser, fin with a stripe, and a skid.
  const stab = new THREE.CapsuleGeometry(0.42, 1.6, 4, 10);
  stab.rotateZ(Math.PI / 2);
  stab.scale(1, 0.14, 1);
  parts.push(finish(placed(stab, 0, 0.28, -1.85), body));
  const fin = new THREE.CapsuleGeometry(0.4, 0.55, 4, 10);
  fin.scale(0.16, 1, 1);
  parts.push(finish(placed(fin, 0, 0.85, -1.85, -0.25, 0, 0), body));
  parts.push(finish(placed(new THREE.BoxGeometry(0.2, 0.22, 0.7), 0, 1.12, -1.98, -0.25, 0, 0), trim));
  parts.push(finish(rodBetween(new THREE.Vector3(0, 0.05, -1.9), new THREE.Vector3(0, -0.35, -2.1), 0.05), trim));
  // Seat bump (headrest) behind the pilot.
  parts.push(finish(placed(new THREE.SphereGeometry(0.22, 10, 8), 0, 0.86, -1.02, 0, 0, 0, 1), trim));
  return mergeFinished(parts);
}

function buildBlades(l: PlaneLivery): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const a of [0, Math.PI]) {
    const blade = new THREE.CapsuleGeometry(0.11, 0.78, 4, 8);
    blade.scale(1, 1, 0.35);
    blade.translate(0, 0.52, 0);
    blade.rotateZ(a);
    parts.push(finish(blade, { color: l.trim, rough: 0.5, metal: 0.05 }));
  }
  return mergeFinished(parts);
}

const SCARF_SEGS = 8;

function buildScarf(color: number): THREE.BufferGeometry {
  // A ribbon along -Z (trailing), 2 vertices per segment; vertex colours give two stripes.
  const pos = new Float32Array((SCARF_SEGS + 1) * 2 * 3);
  const col = new Float32Array((SCARF_SEGS + 1) * 2 * 3);
  const c = new THREE.Color(color);
  const d = new THREE.Color(0x202432);
  const idx: number[] = [];
  for (let i = 0; i <= SCARF_SEGS; i++) {
    const cc = i % 3 === 2 ? d : c;
    for (let k = 0; k < 2; k++) col.set([cc.r, cc.g, cc.b], (i * 2 + k) * 3);
    if (i < SCARF_SEGS) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}

function proxyGeometry(): THREE.BufferGeometry {
  const parts = [
    new THREE.BoxGeometry(6.2, 0.12, 1.2).translate(0, 1.3, 0.6),
    new THREE.BoxGeometry(5.8, 0.12, 1.2).translate(0, -0.3, 0.45),
    new THREE.BoxGeometry(1.1, 1.1, 4.2).translate(0, 0.2, 0),
    new THREE.BoxGeometry(2.2, 0.1, 0.8).translate(0, 0.28, -1.85),
  ].map((g) => g.toNonIndexed());
  const merged = new THREE.BufferGeometry();
  const arrays = parts.map((p) => p.getAttribute('position').array as Float32Array);
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const all = new Float32Array(total);
  let o = 0;
  for (const a of arrays) {
    all.set(a, o);
    o += a.length;
  }
  merged.setAttribute('position', new THREE.BufferAttribute(all, 3));
  for (const p of parts) p.dispose();
  return merged;
}

export function createPlaneModel(livery: PlaneLivery, castShadow = true): PlaneModel {
  const root = new THREE.Group();
  root.name = 'sky-plane';
  root.rotation.order = 'YXZ';
  const body = new THREE.Group();
  root.add(body);

  const bodyGeo = buildBody(livery);
  const mesh = new THREE.Mesh(bodyGeo, bodyMaterial());
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  body.add(mesh);
  const outlineGeo = outlineGeometry(bodyGeo, 0.045);
  const outline = new THREE.Mesh(outlineGeo, outlineMaterial());
  outline.castShadow = false;
  body.add(outline);

  const prop = new THREE.Group();
  prop.position.set(0, 0.2, 2.3);
  body.add(prop);
  const bladeGeo = buildBlades(livery);
  const blades = new THREE.Mesh(bladeGeo, bodyMaterial());
  prop.add(blades);
  const blurGeo = new THREE.CircleGeometry(1.05, 24);
  const blur = new THREE.Mesh(blurGeo, blurMaterial());
  blur.position.z = 0.04;
  blur.renderOrder = 2;
  prop.add(blur);

  const scarfGeo = buildScarf(livery.scarf);
  const scarfMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const scarf = new THREE.Mesh(scarfGeo, scarfMat);
  scarf.frustumCulled = false;
  // The scarf trails from the pilot's neck (seat + ~1.05 m in the sit pose).
  scarf.position.set(0.12, PLANE_DIMS.seat.y + 1.02, PLANE_DIMS.seat.z - 0.05);
  body.add(scarf);

  const seat = new THREE.Object3D();
  seat.position.copy(PLANE_DIMS.seat);
  body.add(seat);

  let proxy: THREE.Mesh | null = null;
  if (castShadow) {
    proxy = shadowProxy(proxyGeometry(), 'sky-plane-shadow');
    body.add(proxy);
  }

  let spin = 0;
  const sp = scarfGeo.getAttribute('position') as THREE.BufferAttribute;

  return {
    root,
    body,
    seat,
    update(dt, rpm, airSpeed, time) {
      spin += dt * (2 + rpm * 60);
      prop.rotation.z = spin;
      blades.visible = rpm < 0.45;
      blur.visible = rpm > 0.25;
      (blur.material as THREE.MeshBasicMaterial).opacity = 1;
      blur.scale.setScalar(0.85 + 0.15 * rpm);
      // Scarf: streams back with the speed and waves; hangs down when parked.
      const stream = Math.min(1, airSpeed / 18);
      for (let i = 0; i <= SCARF_SEGS; i++) {
        const u = i / SCARF_SEGS;
        const len = u * 0.95;
        const wave = Math.sin(time * 14 - u * 7) * 0.09 * u * (0.3 + stream);
        const x = wave + 0.05 * u;
        const y = -len * (1 - stream) * 0.9 + Math.sin(time * 9 - u * 5) * 0.04 * u * stream;
        const z = -len * (0.25 + 0.75 * stream);
        const half = 0.07 * (1 - u * 0.3);
        sp.setXYZ(i * 2, x, y + half, z);
        sp.setXYZ(i * 2 + 1, x, y - half, z);
      }
      sp.needsUpdate = true;
    },
    setVisible(v) {
      root.visible = v;
    },
    dispose() {
      root.removeFromParent();
      bodyGeo.dispose();
      outlineGeo.dispose();
      bladeGeo.dispose();
      blurGeo.dispose();
      scarfGeo.dispose();
      scarfMat.dispose();
      proxy?.geometry.dispose();
    },
  };
}
