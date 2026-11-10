/**
 * Procedural hot-air balloon (both-eye, main scene): gored envelope with alternating light/dark
 * panels and a zig-zag sun band (reads by brightness in R-only and G-only), wicker basket with a
 * padded rim, stainless burner frame with a flickering flame that lights the inside of the
 * envelope, cables, sandbags.
 * Origin = centre of the basket floor (the rider's feet). +Z is the basket "front".
 *
 * Render cost: 4 draws. Envelope fabric + cap + skirt + load ring are one mesh, the wicker one,
 * all other small parts (rim, posts, sandbags, burner, tanks, cables) one with per-vertex finishes
 * (`core/vertex-finish`), the four flame cones one instanced mesh. The burner glow is emissive on
 * the envelope's inside (no point light, which would cost every lit shader in the scene). Shadows
 * come from two low-poly proxies (`core/shadow-proxy`).
 */
import * as THREE from 'three';
import { asShadowProxy } from '../../core/shadow-proxy';
import { finish, finishMaterial, mergeFinished, placed, plainGeometry, rodBetween, useFinishAttributes, type Finish } from '../../core/vertex-finish';

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

/** Finishes of the small parts (sRGB colours as the original materials). */
const STEEL: Finish = { color: 0xd8dade, rough: 0.28, metal: 0.9 };
const LEATHER: Finish = { color: 0x3a2618, rough: 0.55, metal: 0 };
const SUEDE: Finish = { color: 0x2c2420, rough: 0.8, metal: 0 };
const SAND: Finish = { color: 0xcdb48a, rough: 0.95, metal: 0 };
const TANK: Finish = { color: 0xc9ccd2, rough: 0.35, metal: 0.75 };
const CABLE: Finish = { color: 0x3a3a3e, rough: 0.7, metal: 0 };

/** Inner glow of the envelope while the burner roars (warm, fades with height above the throat). */
const BURN_GLOW = new THREE.Color(0xffa64a);

export function createBalloonModel(): BalloonModel {
  const D = BALLOON_DIMS;
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };
  const root = new THREE.Group();
  root.name = 'balloon';

  // ── Envelope: gores + parachute vent cap + charcoal skirt + stainless load ring, one mesh ──
  const envelope = new THREE.Group();
  envelope.position.y = D.throatY;
  root.add(envelope);
  const burn = { value: 0 };
  const envMat = keep(
    useFinishAttributes(
      new THREE.MeshPhysicalMaterial({ roughness: 0.62, sheen: 0.7, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xffffff), side: THREE.DoubleSide }),
      'rg-balloon-envelope',
      undefined,
      (shader) => {
        shader.uniforms.burnLevel = burn;
        shader.uniforms.burnColor = { value: BURN_GLOW };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying float vEnvY;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEnvY = position.y;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float burnLevel;\nuniform vec3 burnColor;\nvarying float vEnvY;')
          .replace(
            '#include <lights_fragment_begin>',
            // The inside (back faces) glows near the throat, like the old warm point light did.
            'if (!gl_FrontFacing) totalEmissiveRadiance += diffuseColor.rgb * burnColor * burnLevel * 1.4 / (1.0 + pow(max(vEnvY + 0.6, 0.0) / 3.0, 1.6));\n#include <lights_fragment_begin>',
          );
      },
    ),
  );
  const envSrc = envelopeGeometry().toNonIndexed();
  const gores = envSrc.getAttribute('color');
  const goresGeo = finish(envSrc, { color: 0xffffff, rough: 0.62, metal: 0 });
  goresGeo.setAttribute('color', gores);
  const capGeo = placed(new THREE.SphereGeometry(1.9, 24, 8, 0, Math.PI * 2, 0, 0.5), 0, PROFILE[PROFILE.length - 1][1] - 1.68, 0);
  const skirtGeo = placed(new THREE.CylinderGeometry(D.throatRadius, D.throatRadius * 0.92, 0.9, 32, 1, true), 0, -0.4, 0);
  const ringGeo = placed(new THREE.TorusGeometry(D.throatRadius * 0.93, 0.045, 8, 48).rotateX(Math.PI / 2), 0, -0.85, 0);
  const envGeo = keep(
    mergeFinished([
      goresGeo,
      finish(capGeo, { color: NAVY.getHex(), rough: 0.6, metal: 0 }),
      finish(skirtGeo, { color: CHAR.getHex(), rough: 0.85, metal: 0 }),
      finish(ringGeo, STEEL),
    ]),
  );
  const env = new THREE.Mesh(envGeo, envMat);
  env.name = 'balloon-envelope';
  env.receiveShadow = true;
  envelope.add(env);
  // Shadow proxy: a coarse lathe of the same profile, skirt included, a little inside the fabric so
  // the lit side never shadows itself.
  const proxyProfile = [new THREE.Vector2(D.throatRadius * 0.92, -0.85), ...PROFILE.filter((_, i) => i % 2 === 0 || i === PROFILE.length - 1).map(([r, y]) => new THREE.Vector2(r * 0.96, y))];
  envelope.add(asShadowProxy(new THREE.Mesh(keep(new THREE.LatheGeometry(proxyProfile, 14)))));

  // ── Basket: wicker walls + floor (one textured mesh) ──
  const basket = new THREE.Group();
  root.add(basket);
  const tex = keep(wickerTexture());
  tex.repeat.set(3, 2);
  const wicker = keep(new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: 2.5, roughness: 0.9, color: 0xffffff }));
  const h = D.basketHeight;
  const half = D.basketHalf;
  const wickerParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    wickerParts.push(plainGeometry(placed(new THREE.BoxGeometry(half * 2, h, 0.07), Math.sin(a) * (half - 0.035), h / 2 - 0.1, Math.cos(a) * (half - 0.035), 0, a), true));
  }
  wickerParts.push(plainGeometry(placed(new THREE.BoxGeometry(half * 2, 0.1, half * 2), 0, -0.05, 0), true));
  const wickerMesh = new THREE.Mesh(keep(mergeFinished(wickerParts)), wicker);
  wickerMesh.name = 'balloon-basket';
  wickerMesh.receiveShadow = true;
  basket.add(wickerMesh);
  // Shadow proxy: the basket as a box just inside the walls.
  basket.add(asShadowProxy(new THREE.Mesh(keep(new THREE.BoxGeometry(half * 2 - 0.08, h - 0.05, half * 2 - 0.08).translate(0, h / 2 - 0.1, 0)))));

  // ── Small parts, one mesh: padded rim, corner posts, sandbags, burner, tanks, cables ──
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2;
    const rim = new THREE.CapsuleGeometry(0.075, half * 2, 4, 10).rotateZ(Math.PI / 2);
    parts.push(finish(placed(rim, Math.sin(a) * half, h - 0.08, Math.cos(a) * half, 0, a), LEATHER));
  }
  const corners: THREE.Vector3[] = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) corners.push(new THREE.Vector3(sx * (half - 0.04), 0, sz * (half - 0.04)));
  const frame = corners.map((c) => new THREE.Vector3(c.x * 0.62, D.burnerY, c.z * 0.62));
  corners.forEach((c, i) => parts.push(finish(rodBetween(c.clone().setY(h - 0.05), frame[i], 0.04), SUEDE)));
  // Sandbags hanging on the outside.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const side = Math.floor(((a + Math.PI / 4) % (Math.PI * 2)) / (Math.PI / 2));
    const n = new THREE.Vector3(Math.sin((side * Math.PI) / 2), 0, Math.cos((side * Math.PI) / 2));
    const t = new THREE.Vector3(n.z, 0, -n.x).multiplyScalar(((i % 3) - 1) * 0.42);
    const p = n.clone().multiplyScalar(half + 0.12).add(t).setY(0.55);
    parts.push(finish(new THREE.SphereGeometry(1, 12, 8).scale(0.17, 0.2, 0.13).translate(p.x, p.y, p.z), SAND));
    parts.push(finish(placed(new THREE.CylinderGeometry(0.045, 0.06, 0.08, 8), p.x, 0.78, p.z), LEATHER));
  }
  // Burner: frame rods, twin cans with coils.
  const by = D.burnerY;
  for (let i = 0; i < 4; i++) parts.push(finish(rodBetween(frame[i], frame[[1, 3, 0, 2][i]], 0.035), STEEL));
  for (const sx of [-0.2, 0.2]) {
    parts.push(finish(placed(new THREE.CylinderGeometry(0.16, 0.13, 0.36, 18), sx, by + 0.05, 0), STEEL));
    parts.push(finish(placed(new THREE.TorusGeometry(0.17, 0.035, 8, 20).rotateX(Math.PI / 2), sx, by + 0.16, 0), STEEL));
  }
  // Fuel tanks in two corners.
  for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5]]) parts.push(finish(placed(new THREE.CapsuleGeometry(0.16, 0.45, 4, 14), x, 0.38, z), TANK));
  // Cables: burner frame → load ring (the posts carry basket → frame).
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const top = new THREE.Vector3(Math.cos(a) * D.throatRadius * 0.93, D.throatY - 0.85, Math.sin(a) * D.throatRadius * 0.93);
    const f = frame[[0, 1, 3, 2][Math.floor(i / 2)]];
    parts.push(finish(rodBetween(new THREE.Vector3(f.x, D.burnerY, f.z), top, 0.014), CABLE));
  }
  const partsMesh = new THREE.Mesh(keep(mergeFinished(parts)), keep(finishMaterial('rg-balloon-parts')));
  partsMesh.name = 'balloon-parts';
  partsMesh.receiveShadow = true;
  basket.add(partsMesh);

  // Flame: additive cones (outer warm, inner white-hot), one instanced mesh. Opacity is baked into
  // the instance colours (with additive blending, colour × opacity is the same light).
  const flameMat = keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  const flameGeo = keep(new THREE.ConeGeometry(1, 1, 16, 1, true).translate(0, 0.5, 0));
  const flames = new THREE.InstancedMesh(flameGeo, flameMat, 4);
  flames.name = 'balloon-flames';
  const outerColor = new THREE.Color(0xffa23a).multiplyScalar(0.85);
  const innerColor = new THREE.Color(0xfff1b8).multiplyScalar(0.95);
  for (let i = 0; i < 4; i++) flames.setColorAt(i, i < 2 ? outerColor : innerColor);
  // Culled with a fixed sphere around the burner (the cones grow and shrink).
  flames.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, D.burnerY + 1.2, 0), 1.8);
  basket.add(flames);
  const fm = new THREE.Matrix4();
  const fp = new THREE.Vector3();
  const fq = new THREE.Quaternion();
  const fs = new THREE.Vector3();

  const setBurner = (level: number, time: number): void => {
    const l = Math.max(0, Math.min(1, level));
    for (let i = 0; i < 2; i++) {
      const flick = 1 + 0.18 * Math.sin(time * 37 + i * 2.1) + 0.1 * Math.sin(time * 61 + i);
      const len = 0.18 + l * 1.9 * flick;
      const rad = 0.05 + l * 0.17;
      fp.set(i === 0 ? -0.2 : 0.2, D.burnerY + 0.25, 0);
      flames.setMatrixAt(i, fm.compose(fp, fq, fs.set(rad, len, rad)));
      flames.setMatrixAt(i + 2, fm.compose(fp, fq, fs.set(rad * 0.5, len * 0.62, rad * 0.5)));
    }
    flames.instanceMatrix.needsUpdate = true;
    burn.value = l * (0.8 + 0.2 * Math.sin(time * 41));
  };
  setBurner(0, 0);

  return {
    root,
    envelope,
    basket,
    setBurner,
    dispose() {
      root.removeFromParent();
      flames.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}
