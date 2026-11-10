/**
 * Procedural hot-air balloon (both-eye, main scene): gored envelope with alternating light/dark
 * panels and a zig-zag sun band (reads by brightness in R-only and G-only), wicker basket with a
 * padded rim, stainless burner frame with a flickering flame and warm light, cables, sandbags.
 * Origin = centre of the basket floor (the rider's feet). +Z is the basket "front".
 */
import * as THREE from 'three';

export const BALLOON_DIMS = {
  basketHalf: 0.78,
  basketHeight: 1.08,
  burnerY: 2.75,
  throatY: 4.9,
  throatRadius: 1.75,
} as const;

/** Envelope profile (radius, height above the throat), throat → crown. */
const PROFILE: [number, number][] = [
  [1.75, 0], [2.6, 1.4], [3.9, 3.4], [5.4, 5.8], [6.8, 8.4], [7.7, 10.8], [8.15, 13.0],
  [8.2, 14.6], [7.9, 16.2], [7.0, 17.9], [5.5, 19.3], [3.5, 20.3], [1.4, 20.75], [0, 20.85],
];

const GORES = 16;
const SUB = 7;
const ROWS = 64;

const CREAM = new THREE.Color(0xf7efdc);
const NAVY = new THREE.Color(0x1b2a55);
const SUN = new THREE.Color(0xffc93c);
const CHAR = new THREE.Color(0x2a2b33);

export interface BalloonModel {
  readonly root: THREE.Group;
  /** Envelope + cables (sways around the throat). */
  readonly envelope: THREE.Group;
  readonly basket: THREE.Group;
  /** 0 = pilot light only, 1 = full roar. */
  setBurner(level: number, time: number): void;
  dispose(): void;
}

function profileCurve(): THREE.Vector2[] {
  const curve = new THREE.SplineCurve(PROFILE.map(([r, y]) => new THREE.Vector2(r, y)));
  return curve.getSpacedPoints(ROWS);
}

function envelopeGeometry(): THREE.BufferGeometry {
  const prof = profileCurve();
  const total = prof[prof.length - 1].y;
  const positions: number[] = [];
  const colors: number[] = [];
  const index: number[] = [];
  const c = new THREE.Color();
  for (let g = 0; g < GORES; g++) {
    const base = positions.length / 3;
    const light = g % 2 === 0;
    for (let row = 0; row <= ROWS; row++) {
      const p = prof[row];
      const t = p.y / total;
      for (let s = 0; s <= SUB; s++) {
        const u = s / SUB;
        const phi = ((g + u) / GORES) * Math.PI * 2;
        // Gores bulge between the load tapes (less at the throat and crown).
        const bulge = 1 + 0.045 * Math.sin(Math.PI * u) * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.6);
        const r = p.x * bulge;
        positions.push(Math.cos(phi) * r, p.y, Math.sin(phi) * r);
        // Pattern: dark throat, light/dark gores, a zig-zag sun band, dark crown.
        const zig = 0.5 + 0.035 * (1 - Math.abs(u * 2 - 1)) * (light ? 1 : -1);
        if (t < 0.08) c.copy(CHAR);
        else if (t > 0.9) c.copy(NAVY);
        else if (Math.abs(t - zig) < 0.045) c.copy(SUN);
        else if (t > 0.86 || (t > 0.1 && t < 0.13)) c.copy(SUN);
        else c.copy(light ? CREAM : NAVY);
        // Load tape: a slightly darker seam at each gore edge.
        const seam = Math.min(u, 1 - u) < 0.045 ? 0.72 : 1;
        // Soft baked occlusion towards the throat.
        const ao = 0.78 + 0.22 * Math.min(1, t * 3);
        colors.push(c.r * seam * ao, c.g * seam * ao, c.b * seam * ao);
      }
    }
    const w = SUB + 1;
    for (let row = 0; row < ROWS; row++) {
      for (let s = 0; s < SUB; s++) {
        const a = base + row * w + s;
        const b = a + 1;
        const d = a + w;
        const e = d + 1;
        index.push(a, d, b, b, d, e);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(index);
  geo.computeVertexNormals();
  return geo;
}

function wickerTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = '#4a3220';
    g.fillRect(0, 0, size, size);
    const rows = 8;
    const cols = 6;
    const rh = size / rows;
    const cw = size / cols;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < cols; k++) {
        const x = k * cw + (r % 2 ? cw / 2 : 0);
        const grad = g.createLinearGradient(0, r * rh, 0, (r + 1) * rh);
        grad.addColorStop(0, '#8a6538');
        grad.addColorStop(0.45, '#d6ad6d');
        grad.addColorStop(1, '#7a5630');
        g.fillStyle = grad;
        for (const off of [0, size]) {
          g.beginPath();
          g.roundRect(x + 1 - off, r * rh + 1, cw - 2, rh - 2, rh / 2);
          g.fill();
        }
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** A rod (cylinder) from a to b. */
function rod(geo: THREE.CylinderGeometry, mat: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, r: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  const d = new THREE.Vector3().subVectors(b, a);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.scale.set(r, d.length(), r);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return m;
}

export function createBalloonModel(): BalloonModel {
  const D = BALLOON_DIMS;
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const root = new THREE.Group();
  root.name = 'balloon';

  // ── Envelope ──
  const envelope = new THREE.Group();
  envelope.position.y = D.throatY;
  root.add(envelope);
  const envMat = keep(
    new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.62,
      sheen: 0.7,
      sheenRoughness: 0.45,
      sheenColor: new THREE.Color(0xffffff),
      side: THREE.DoubleSide,
    }),
  );
  const env = new THREE.Mesh(keep(envelopeGeometry()), envMat);
  env.castShadow = true;
  env.receiveShadow = true;
  envelope.add(env);
  // Parachute vent cap and its dark ring at the crown.
  const capMat = keep(new THREE.MeshStandardMaterial({ color: NAVY, roughness: 0.6 }));
  const cap = new THREE.Mesh(keep(new THREE.SphereGeometry(1.9, 24, 8, 0, Math.PI * 2, 0, 0.5)), capMat);
  cap.position.y = PROFILE[PROFILE.length - 1][1] - 1.68;
  envelope.add(cap);
  // Scoop/skirt below the throat (charcoal fabric) and the stainless load ring.
  const darkFabric = keep(new THREE.MeshStandardMaterial({ color: CHAR, roughness: 0.85, side: THREE.DoubleSide }));
  const skirt = new THREE.Mesh(keep(new THREE.CylinderGeometry(D.throatRadius, D.throatRadius * 0.92, 0.9, 32, 1, true)), darkFabric);
  skirt.position.y = -0.4;
  envelope.add(skirt);
  const steel = keep(new THREE.MeshStandardMaterial({ color: 0xd8dade, metalness: 0.9, roughness: 0.28 }));
  const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(D.throatRadius * 0.93, 0.045, 8, 48).rotateX(Math.PI / 2)), steel);
  ring.position.y = -0.85;
  envelope.add(ring);

  // ── Basket ──
  const basket = new THREE.Group();
  root.add(basket);
  const tex = keep(wickerTexture());
  tex.repeat.set(3, 2);
  const wicker = keep(new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 2.5, roughness: 0.9, color: 0xffffff }));
  const h = D.basketHeight;
  const half = D.basketHalf;
  const wallGeo = keep(new THREE.BoxGeometry(half * 2, h, 0.07));
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const w = new THREE.Mesh(wallGeo, wicker);
    w.position.set(Math.sin(a) * (half - 0.035), h / 2 - 0.1, Math.cos(a) * (half - 0.035));
    w.rotation.y = a;
    w.castShadow = true;
    w.receiveShadow = true;
    basket.add(w);
  }
  const floor = new THREE.Mesh(keep(new THREE.BoxGeometry(half * 2, 0.1, half * 2)), wicker);
  floor.position.y = -0.05;
  floor.receiveShadow = true;
  basket.add(floor);
  // Padded leather rim and corner posts.
  const leather = keep(new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.55 }));
  const rimGeo = keep(new THREE.CapsuleGeometry(0.075, half * 2, 4, 10).rotateZ(Math.PI / 2));
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const r = new THREE.Mesh(rimGeo, leather);
    r.position.set(Math.sin(a) * half, h - 0.08, Math.cos(a) * half);
    r.rotation.y = a;
    r.castShadow = true;
    basket.add(r);
  }
  const unitCyl = keep(new THREE.CylinderGeometry(1, 1, 1, 8));
  const suede = keep(new THREE.MeshStandardMaterial({ color: 0x2c2420, roughness: 0.8 }));
  const corners: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) corners.push(new THREE.Vector3(sx * (half - 0.04), 0, sz * (half - 0.04)));
  const frame = corners.map((c) => new THREE.Vector3(c.x * 0.62, D.burnerY, c.z * 0.62));
  corners.forEach((c, i) => {
    const post = rod(unitCyl, suede, c.clone().setY(h - 0.05), frame[i], 0.04);
    post.castShadow = true;
    basket.add(post);
  });
  // Sandbags hanging on the outside.
  const sandMat = keep(new THREE.MeshStandardMaterial({ color: 0xcdb48a, roughness: 0.95 }));
  const sandGeo = keep(new THREE.SphereGeometry(1, 12, 8));
  const tieGeo = keep(new THREE.CylinderGeometry(0.045, 0.06, 0.08, 8));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const side = Math.floor(((a + Math.PI / 4) % (Math.PI * 2)) / (Math.PI / 2));
    const n = new THREE.Vector3(Math.sin((side * Math.PI) / 2), 0, Math.cos((side * Math.PI) / 2));
    const t = new THREE.Vector3(n.z, 0, -n.x).multiplyScalar(((i % 3) - 1) * 0.42);
    const bag = new THREE.Mesh(sandGeo, sandMat);
    bag.scale.set(0.17, 0.2, 0.13);
    bag.position.copy(n).multiplyScalar(half + 0.12).add(t).setY(0.55);
    bag.castShadow = true;
    const tie = new THREE.Mesh(tieGeo, leather);
    tie.position.copy(bag.position).setY(0.78);
    basket.add(bag, tie);
  }

  // ── Burner ──
  const burner = new THREE.Group();
  burner.position.y = D.burnerY;
  basket.add(burner);
  for (let i = 0; i < 4; i++) {
    const a = frame[i];
    const b = frame[[1, 3, 0, 2][i]];
    burner.add(rod(unitCyl, steel, a.clone().setY(0), b.clone().setY(0), 0.035));
  }
  for (const sx of [-0.2, 0.2]) {
    const can = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.16, 0.13, 0.36, 18)), steel);
    can.position.set(sx, 0.05, 0);
    can.castShadow = true;
    const coil = new THREE.Mesh(keep(new THREE.TorusGeometry(0.17, 0.035, 8, 20).rotateX(Math.PI / 2)), steel);
    coil.position.set(sx, 0.16, 0);
    burner.add(can, coil);
  }
  // Fuel tanks in two corners.
  const tankMat = keep(new THREE.MeshStandardMaterial({ color: 0xc9ccd2, metalness: 0.75, roughness: 0.35 }));
  const tankGeo = keep(new THREE.CapsuleGeometry(0.16, 0.45, 4, 14));
  for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5]]) {
    const tank = new THREE.Mesh(tankGeo, tankMat);
    tank.position.set(x, 0.38, z);
    tank.castShadow = true;
    basket.add(tank);
  }

  // Flame: additive cones (outer warm, inner white-hot), plus a warm point light in the envelope.
  const flameOuterMat = keep(
    new THREE.MeshBasicMaterial({ color: 0xffa23a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  const flameInnerMat = keep(
    new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  const flameGeo = keep(new THREE.ConeGeometry(1, 1, 16, 1, true).translate(0, 0.5, 0));
  const flames: THREE.Mesh[] = [];
  for (const sx of [-0.2, 0.2]) {
    const outer = new THREE.Mesh(flameGeo, flameOuterMat);
    const inner = new THREE.Mesh(flameGeo, flameInnerMat);
    outer.position.set(sx, 0.25, 0);
    inner.position.set(sx, 0.25, 0);
    outer.userData.inner = inner;
    burner.add(outer, inner);
    flames.push(outer);
  }
  const light = new THREE.PointLight(0xffa64a, 0, 26, 1.6);
  light.position.set(0, D.burnerY + 2.5, 0);
  basket.add(light);

  // Cables: burner frame → load ring, and basket corners → frame are the posts.
  const cableMat = keep(new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.7 }));
  const cables = new THREE.Group();
  root.add(cables);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const top = new THREE.Vector3(Math.cos(a) * D.throatRadius * 0.93, D.throatY - 0.85, Math.sin(a) * D.throatRadius * 0.93);
    const f = frame[[0, 1, 3, 2][Math.floor(i / 2)]];
    cables.add(rod(unitCyl, cableMat, new THREE.Vector3(f.x, D.burnerY, f.z), top, 0.014));
  }

  const setBurner = (level: number, time: number): void => {
    const l = Math.max(0, Math.min(1, level));
    flames.forEach((f, i) => {
      const flick = 1 + 0.18 * Math.sin(time * 37 + i * 2.1) + 0.1 * Math.sin(time * 61 + i);
      const len = 0.18 + l * 1.9 * flick;
      const rad = 0.05 + l * 0.17;
      f.scale.set(rad, len, rad);
      const inner = f.userData.inner as THREE.Mesh;
      inner.scale.set(rad * 0.5, len * 0.62, rad * 0.5);
    });
    light.intensity = l * (38 + 10 * Math.sin(time * 41));
  };
  setBurner(0, 0);

  return {
    root,
    envelope,
    basket,
    setBurner,
    dispose() {
      root.removeFromParent();
      for (const d of disposables) d.dispose();
    },
  };
}
