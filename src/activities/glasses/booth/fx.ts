/**
 * Transient booth feedback, pooled: one quad-pool mesh with the booth atlas material (countdown
 * digits, ✓ / ✗ pops, a star burst, prize gems flying to the hero) plus one confetti burst. Both
 * are added to the scene only while a round runs at that site (the kit adds and removes them), so
 * they cost nothing at rest. Deterministic: driven by `dt` and a local seeded generator.
 * Every quad faces the camera (CPU billboards; world space).
 */
import * as THREE from 'three';
import { cellUv, countCell, KIT_CELL } from './cells';
import type { UvRect } from './cells';
import { Confetti } from './confetti';

export type FxKind = 'digit' | 'pop' | 'gem' | 'burst';

interface Item {
  kind: FxKind;
  uv: UvRect;
  from: THREE.Vector3;
  to: THREE.Vector3 | null;
  size: number;
  age: number;
  delay: number;
  life: number;
  rise: number;
  onArrive?: () => void;
  arrived: boolean;
}

/** Pop-in scale curve: 0 → 1.25 → 1 over the first 0.18 s, shrink away over the last `out` s. */
export function popScale(age: number, life: number, out = 0.2): number {
  if (age <= 0) return 0;
  const a = Math.min(1, age / 0.18);
  const grow = a < 0.7 ? (a / 0.7) * 1.25 : 1.25 - ((a - 0.7) / 0.3) * 0.25;
  const tail = Math.min(1, Math.max(0, (life - age) / out));
  return grow * tail;
}

export class BoothFx {
  readonly mesh: THREE.Mesh;
  private readonly material: THREE.Material;
  readonly confetti = new Confetti(110);
  private readonly items: (Item | null)[];
  private readonly pos: THREE.BufferAttribute;
  private readonly uv: THREE.BufferAttribute;
  private readonly nor: THREE.BufferAttribute;
  private readonly unit: Float32Array;
  private seed = 0x2f6b9d1;
  private readonly right = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly p = new THREE.Vector3();

  constructor(material: THREE.Material, readonly max = 24) {
    const quad = new THREE.PlaneGeometry(1, 1).toNonIndexed();
    const vq = quad.getAttribute('position').count;
    this.unit = Float32Array.from(quad.getAttribute('uv').array as Float32Array);
    const geo = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(max * vq * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.nor = new THREE.BufferAttribute(new Float32Array(max * vq * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.uv = new THREE.BufferAttribute(new Float32Array(max * vq * 2), 2).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pos);
    geo.setAttribute('normal', this.nor);
    geo.setAttribute('uv', this.uv);
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(max * vq * 3).fill(1.35), 3));
    quad.dispose();
    // Pops sit inside arches, signs and props: drawn last and on top so they are never cut.
    this.material = material.clone();
    // Same shader as the booth (clone() does not carry these).
    this.material.onBeforeCompile = material.onBeforeCompile;
    this.material.customProgramCacheKey = material.customProgramCacheKey;
    this.material.depthTest = false;
    // It still writes depth: a weak-eye object behind a pop is hidden by it (the layer pass
    // depth-tests against the main scene), so a pop is never see-through for the weak eye.
    this.material.depthWrite = true;
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = 50;
    this.mesh.name = 'glasses:booth:fx';
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.items = new Array<Item | null>(max).fill(null);
  }

  rng(): number {
    this.seed = (this.seed + 0x6d2b79f5) >>> 0;
    let t = this.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  private spawn(it: Omit<Item, 'age' | 'arrived'>): void {
    let i = this.items.findIndex((x) => x === null);
    if (i < 0) i = 0;
    this.items[i] = { ...it, age: 0, arrived: false };
  }

  /** Countdown digit (3, 2, 1, 0 = GO) at a world point. Replaces the previous digit. */
  digit(n: number, at: THREE.Vector3, life: number): void {
    for (let i = 0; i < this.max; i++) if (this.items[i]?.kind === 'digit') this.items[i] = null;
    this.spawn({ kind: 'digit', uv: cellUv(countCell(n)), from: at.clone(), to: null, size: n === 0 ? 2.0 : 1.7, delay: 0, life, rise: 0 });
  }

  /** ✓ (hit) or ✗ (miss) popping up at a world point. */
  pop(hit: boolean, at: THREE.Vector3): void {
    this.spawn({ kind: 'pop', uv: cellUv(hit ? KIT_CELL.check : KIT_CELL.cross), from: at.clone(), to: null, size: hit ? 1.25 : 1.0, delay: 0, life: 1.2, rise: 0.7 });
  }

  /** A star-burst flash. */
  burst(at: THREE.Vector3, size = 2.2): void {
    this.spawn({ kind: 'burst', uv: cellUv(KIT_CELL.burst), from: at.clone(), to: null, size, delay: 0, life: 0.7, rise: 0 });
  }

  /** `n` gems fly from `from` to the live point `to` (staggered); `onArrive` once per gem. */
  gems(n: number, from: THREE.Vector3, to: THREE.Vector3, time: number, onArrive: () => void): void {
    const k = Math.max(1, Math.min(10, n));
    for (let i = 0; i < k; i++) {
      const delay = (i / k) * time * 0.45;
      this.spawn({ kind: 'gem', uv: cellUv(KIT_CELL.gem), from: from.clone().add(new THREE.Vector3((this.rng() - 0.5) * 0.8, (this.rng() - 0.5) * 0.4, 0)), to, size: 0.55, delay, life: time * 0.55, rise: 1.4 + this.rng() * 0.8, onArrive });
    }
  }

  /** Confetti burst at a world point. */
  confettiAt(at: THREE.Vector3, n = 60, up = 5.5): void {
    this.confetti.burst(at.x, at.y, at.z, () => this.rng(), n, up);
  }

  /** Anything still on show (pool or confetti)? */
  get busy(): boolean {
    return this.items.some((x) => x !== null) || this.confetti.live > 0 || this.confetti.mesh.visible;
  }

  update(dt: number, camera: THREE.Camera): void {
    this.confetti.update(dt);
    camera.updateMatrixWorld();
    const e = camera.matrixWorld.elements;
    this.right.set(e[0], e[1], e[2]).normalize();
    this.up.set(e[4], e[5], e[6]).normalize();
    this.fwd.set(e[8], e[9], e[10]).normalize();
    const P = this.pos.array as Float32Array;
    const N = this.nor.array as Float32Array;
    const U = this.uv.array as Float32Array;
    const vq = 6;
    for (let i = 0; i < this.max; i++) {
      const it = this.items[i];
      let s = 0;
      if (it) {
        it.age += dt;
        const a = it.age - it.delay;
        if (a >= it.life) {
          if (it.kind === 'gem' && !it.arrived) it.onArrive?.();
          this.items[i] = null;
        } else if (a > 0) {
          if (it.kind === 'gem' && it.to) {
            const t = a / it.life;
            const ease = t * t * (3 - 2 * t);
            this.p.copy(it.from).lerp(it.to, ease);
            this.p.y += Math.sin(t * Math.PI) * it.rise;
            s = it.size * (t < 0.15 ? t / 0.15 : t > 0.85 ? Math.max(0.2, (1 - t) / 0.15) : 1);
          } else {
            this.p.copy(it.from);
            this.p.y += it.rise * Math.min(1, a / Math.max(0.01, it.life));
            s = it.size * popScale(a, it.life, it.kind === 'digit' ? 0.12 : 0.25);
          }
        }
      }
      for (let v = 0; v < vq; v++) {
        const k = (i * vq + v) * 3;
        const du = (this.unit[v * 2] - 0.5) * s;
        const dv = (this.unit[v * 2 + 1] - 0.5) * s;
        P[k] = this.p.x + this.right.x * du + this.up.x * dv;
        P[k + 1] = this.p.y + this.right.y * du + this.up.y * dv;
        P[k + 2] = this.p.z + this.right.z * du + this.up.z * dv;
        N[k] = this.fwd.x;
        N[k + 1] = this.fwd.y;
        N[k + 2] = this.fwd.z;
        const uv = it ? it.uv : ([0, 0, 0, 0] as const);
        U[(i * vq + v) * 2] = uv[0] + this.unit[v * 2] * uv[2];
        U[(i * vq + v) * 2 + 1] = uv[1] + this.unit[v * 2 + 1] * uv[3];
      }
    }
    this.pos.needsUpdate = true;
    this.nor.needsUpdate = true;
    this.uv.needsUpdate = true;
  }

  clear(): void {
    this.items.fill(null);
    (this.pos.array as Float32Array).fill(0);
    this.pos.needsUpdate = true;
    this.confetti.clear();
  }

  /** Debug: live items by kind. */
  live(): Record<string, number> {
    const out: Record<string, number> = { confetti: this.confetti.live };
    for (const it of this.items) if (it) out[it.kind] = (out[it.kind] ?? 0) + 1;
    return out;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.confetti.dispose();
  }
}
