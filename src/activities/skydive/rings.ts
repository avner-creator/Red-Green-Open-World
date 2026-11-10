/**
 * Landing target at `anchors.landingRings`: three concentric ground rings (both-eye, brightness
 * coded, bold bright centre) and big striped hoops on the canopy approach (both-eye). Each hoop
 * holds a weak-eye-only bonus gem (vision layer only: no main-scene glow, light or particles).
 */
import * as THREE from 'three';
import { createGlowMaterial } from '../../vision';
import { VisionLayer } from '../../types';
import type { GameContext } from '../../types';
import { buildGemGeometry } from '../gems';
import { SKY } from './flight';

export const HOOPS = {
  radius: 3.4,
  tube: 0.3,
  /** Hoops sit on a circle around the ring centre at these heights above the ground. */
  circle: 16,
  heights: [27, 18, 9] as readonly number[],
  /** Angular step between hoops (radians, counter-clockwise seen from above). */
  step: 1.1,
  /** A pass within this distance of the hoop centre collects its bonus gem. */
  pickup: 2.8,
} as const;

export interface Hoop {
  readonly center: THREE.Vector3;
  readonly normal: THREE.Vector3;
  collected: boolean;
}

export interface LandingRings {
  readonly center: THREE.Vector3;
  readonly hoops: readonly Hoop[];
  update(dt: number): void;
  /** Mark a hoop's bonus as collected (pops its weak-eye gem away). */
  collect(i: number): void;
  reset(): void;
  dispose(): void;
}

function ringTexture(): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const outer = SKY.rings[2] + 0.7;
  if (g) {
    const px = (m: number): number => (m / outer) * (size / 2);
    const disc = (r: number, color: string): void => {
      g.beginPath();
      g.arc(size / 2, size / 2, px(r), 0, Math.PI * 2);
      g.fillStyle = color;
      g.fill();
    };
    const [a, b, c] = SKY.rings;
    disc(outer, '#16203d');
    disc(c, '#f3ead6'); // outer ring: light
    disc(c - 0.35, '#efe4cc');
    disc(b + 0.35, '#16203d');
    disc(b, '#1b2a55'); // middle ring: dark
    disc(a + 0.4, '#f6f0e2');
    disc(a, '#ffd23f'); // bullseye: bold, bright
    disc(a * 0.42, '#16203d');
    disc(a * 0.28, '#ffd23f');
    // Fine radial ticks in the outer ring (texture detail, not a cue).
    g.strokeStyle = 'rgba(22,32,61,0.35)';
    g.lineWidth = 6;
    for (let i = 0; i < 48; i++) {
      const ang = (i / 48) * Math.PI * 2;
      g.beginPath();
      g.moveTo(size / 2 + Math.cos(ang) * px(b + 0.9), size / 2 + Math.sin(ang) * px(b + 0.9));
      g.lineTo(size / 2 + Math.cos(ang) * px(b + 1.6), size / 2 + Math.sin(ang) * px(b + 1.6));
      g.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Disc that follows the terrain (centre + rings of vertices). */
function groundDisc(ctx: GameContext, cx: number, cz: number, radius: number): THREE.BufferGeometry {
  const rings = 14;
  const segs = 64;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const add = (x: number, z: number): void => {
    pos.push(x, ctx.world.heightAt(cx + x, cz + z) + 0.05, z);
    uv.push(0.5 + x / (2 * radius), 0.5 - z / (2 * radius));
  };
  add(0, 0);
  for (let r = 1; r <= rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      add(Math.cos(a) * (radius * r) / rings, Math.sin(a) * (radius * r) / rings);
    }
  }
  for (let s = 0; s < segs; s++) idx.push(0, 1 + ((s + 1) % segs), 1 + s);
  for (let r = 1; r < rings; r++) {
    for (let s = 0; s < segs; s++) {
      const a = 1 + (r - 1) * segs + s;
      const b = 1 + (r - 1) * segs + ((s + 1) % segs);
      idx.push(a, b, a + segs, b, b + segs, a + segs);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Torus with bright/dark candy stripes around the ring (vertex colours). */
function hoopGeometry(): THREE.BufferGeometry {
  const geo = new THREE.TorusGeometry(HOOPS.radius, HOOPS.tube, 14, 96);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  const light = new THREE.Color(0xfff3cf);
  const dark = new THREE.Color(0x1b2a55);
  const sun = new THREE.Color(0xffc93c);
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getY(i), pos.getX(i));
    const band = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 16);
    const c = band % 2 === 0 ? (band % 4 === 0 ? sun : light) : dark;
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

export function createLandingRings(ctx: GameContext, approach: THREE.Vector2): LandingRings {
  const anchor = ctx.world.anchors.landingRings;
  const cx = anchor.position.x;
  const cz = anchor.position.z;
  const groundY = ctx.world.heightAt(cx, cz);
  const center = new THREE.Vector3(cx, groundY, cz);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const group = new THREE.Group();
  group.name = 'landingRings';
  ctx.scene.add(group);

  // Ground target.
  const tex = keep(ringTexture());
  const groundMat = keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const ground = new THREE.Mesh(keep(groundDisc(ctx, cx, cz, SKY.rings[2] + 0.7)), groundMat);
  ground.position.set(cx, 0, cz);
  ground.receiveShadow = true;
  group.add(ground);

  // Hoops on a spiral around the centre, starting along the approach direction.
  const dir = approach.clone().normalize();
  const start = Math.atan2(dir.y, dir.x);
  const pts: THREE.Vector3[] = HOOPS.heights.map((h, k) => {
    const a = start + k * HOOPS.step;
    const x = cx + Math.cos(a) * HOOPS.circle;
    const z = cz + Math.sin(a) * HOOPS.circle;
    return new THREE.Vector3(x, ctx.world.heightAt(x, z) + h, z);
  });
  const from = new THREE.Vector3(cx, groundY + 40, cz);
  const to = new THREE.Vector3(cx, groundY, cz);
  const hoops: Hoop[] = pts.map((p, k) => {
    const prev = k === 0 ? from : pts[k - 1];
    const next = k === pts.length - 1 ? to : pts[k + 1];
    const normal = new THREE.Vector3().subVectors(next, prev).setY(0).normalize();
    return { center: p, normal, collected: false };
  });

  const hoopGeo = keep(hoopGeometry());
  const hoopMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.05 }));
  const capGeo = keep(new THREE.SphereGeometry(HOOPS.tube * 1.25, 14, 10));
  const capMat = keep(new THREE.MeshStandardMaterial({ color: 0x1b2a55, roughness: 0.5 }));
  const hoopMeshes: THREE.Group[] = hoops.map((hp) => {
    const g = new THREE.Group();
    g.position.copy(hp.center);
    g.lookAt(hp.center.clone().add(hp.normal));
    const m = new THREE.Mesh(hoopGeo, hoopMat);
    m.castShadow = true;
    g.add(m);
    for (const s of [-1, 1]) {
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(s * HOOPS.radius, 0, 0);
      g.add(cap);
    }
    group.add(g);
    return g;
  });

  // Weak-eye-only bonus gems in the hoop centres (vision layer, never in ctx.scene).
  const gemGeo = keep(buildGemGeometry());
  const gemMat = keep(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const glowGeo = keep(new THREE.SphereGeometry(1.25, 20, 14));
  const glowMat = keep(createGlowMaterial({ level: 1, coreOpacity: 0.12, rimPower: 2.2, pulse: 0.3 }));
  const weak = new THREE.Group();
  weak.name = 'skydiveHoopGems';
  const markers = hoops.map((hp) => {
    const m = new THREE.Group();
    m.position.copy(hp.center);
    const gem = new THREE.Mesh(gemGeo, gemMat);
    gem.scale.setScalar(1.7);
    const glow = new THREE.Mesh(glowGeo, glowMat);
    m.add(gem, glow);
    weak.add(m);
    return { group: m, gem, pop: -1 };
  });
  ctx.vision.add(weak, VisionLayer.WeakOnly);

  let time = 0;

  return {
    center,
    hoops,
    update(dt) {
      time += dt;
      hoopMeshes.forEach((g, i) => {
        g.position.y = hoops[i].center.y + Math.sin(time * 1.1 + i) * 0.12;
        (g.children[0] as THREE.Mesh).rotation.z = time * 0.25 + i;
      });
      markers.forEach((mk, i) => {
        mk.gem.rotation.y = time * 1.6 + i;
        mk.group.position.y = hoops[i].center.y + Math.sin(time * 2 + i) * 0.18;
        if (mk.pop >= 0) {
          mk.pop += dt;
          const k = Math.min(1, mk.pop / 0.45);
          mk.group.scale.setScalar(Math.max(0.001, (1 + k * 1.5) * (1 - k)));
          if (k >= 1) mk.group.visible = false;
        }
      });
    },
    collect(i) {
      const mk = markers[i];
      hoops[i].collected = true;
      if (mk.pop < 0) mk.pop = 0;
    },
    reset() {
      hoops.forEach((h, i) => {
        h.collected = false;
        markers[i].pop = -1;
        markers[i].group.visible = true;
        markers[i].group.scale.setScalar(1);
      });
    },
    dispose() {
      ctx.vision.remove(weak);
      group.removeFromParent();
      for (const d of disposables) d.dispose();
    },
  };
}
