/**
 * Prize shelf plushies: one instanced draw. Each win puts a plush (tinted per booth) on the shelf
 * with a bouncy pop. Kept between sessions in localStorage (wrapped in try/catch).
 */
import * as THREE from 'three';
import { GAME_IDS, SHELF } from './layout';
import type { GameId } from './layout';
import { G, Kit, T, kitMaterial } from './kit';

const STORE_KEY = 'rg.carnival.v1';

/** Bright plush tints (bright in both the R and the G channel). */
export const PLUSH_TINT: Readonly<Record<GameId, number>> = {
  balloonPop: 0xffe14a,
  ringToss: 0xffffff,
  duckPond: 0xffc890,
  strengthBell: 0xd8ff8a,
  glowDodge: 0xffb8dc,
};

function plushGeometry(): THREE.BufferGeometry {
  const k = new Kit();
  const W = 0xffffff;
  k.add(G.sphere, W, T(0, 0.17, 0, 0, 0.34, 0.32, 0.28));
  k.add(G.sphere, W, T(0, 0.42, 0, 0, 0.3, 0.28, 0.27));
  for (const s of [-1, 1]) {
    k.add(G.sphere, W, T(s * 0.12, 0.55, 0, 0, 0.11, 0.11, 0.07));
    k.add(G.sphere, W, T(s * 0.15, 0.2, 0.06, 0, 0.11, 0.16, 0.11));
    k.add(G.sphere, 0x111118, T(s * 0.065, 0.45, 0.13, 0, 0.045, 0.05, 0.03));
  }
  k.add(G.sphere, 0xf0e6dc, T(0, 0.39, 0.12, 0, 0.12, 0.09, 0.06));
  k.add(G.sphereLo, 0x111118, T(0, 0.41, 0.15, 0, 0.04, 0.03, 0.03));
  return k.build();
}

/** Shelf slot (site frame) for plush number i (0..14): three tiers of five. */
export function plushSlot(i: number): [number, number, number] {
  const tier = Math.floor(i / 5) % 3;
  const col = i % 5;
  const lx = -1.4 + col * 0.7;
  const lz = -0.35 - tier * 0.38;
  const ly = 0.52 + tier * 0.45;
  const c = Math.cos(SHELF.yaw);
  const s = Math.sin(SHELF.yaw);
  return [SHELF.x + lx * c + lz * s, ly, SHELF.z - lx * s + lz * c];
}

export function loadPlushes(): GameId[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as { plush?: unknown };
    if (!Array.isArray(data.plush)) return [];
    return data.plush.filter((g): g is GameId => GAME_IDS.includes(g as GameId)).slice(0, SHELF.slots);
  } catch {
    return [];
  }
}

function savePlushes(list: readonly GameId[]): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ plush: list }));
  } catch {
    /* storage blocked: the shelf just won't remember */
  }
}

export class PlushShelf {
  readonly mesh: THREE.InstancedMesh;
  private readonly list: GameId[];
  private readonly pop: number[] = [];
  private readonly mat = kitMaterial({ roughness: 0.9 });
  private readonly o = new THREE.Object3D();
  private dirty = true;

  constructor(persist = true) {
    this.mesh = new THREE.InstancedMesh(plushGeometry(), this.mat, SHELF.slots);
    this.mesh.name = 'carnival-plush';
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.list = persist ? loadPlushes() : [];
    this.persist = persist;
    for (let i = 0; i < SHELF.slots; i++) this.pop.push(1);
    this.refresh();
  }
  private readonly persist: boolean;

  get count(): number {
    return this.list.length;
  }

  /** Add a plush for a win; when the shelf is full the oldest one makes room. Returns its slot. */
  add(game: GameId): number {
    if (this.list.length >= SHELF.slots) {
      this.list.shift();
      this.pop.shift();
      this.pop.push(1);
    }
    this.list.push(game);
    const i = this.list.length - 1;
    this.pop[i] = 0;
    if (this.persist) savePlushes(this.list);
    this.refresh();
    return i;
  }

  private refresh(): void {
    this.mesh.count = this.list.length;
    const c = new THREE.Color();
    this.list.forEach((g, i) => this.mesh.setColorAt(i, c.set(PLUSH_TINT[g])));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.dirty = true;
  }

  update(dt: number): void {
    let any = this.dirty;
    for (let i = 0; i < this.list.length; i++) {
      if (this.pop[i] < 1) {
        this.pop[i] = Math.min(1, this.pop[i] + dt * 1.6);
        any = true;
      }
    }
    if (!any) return;
    this.dirty = false;
    for (let i = 0; i < this.list.length; i++) {
      const [x, y, z] = plushSlot(i);
      const p = this.pop[i];
      // Overshooting pop-in.
      const s = p >= 1 ? 1 : Math.sin(p * Math.PI * 0.5) * (1 + Math.sin(p * Math.PI) * 0.35);
      this.o.position.set(x, y + (1 - p) * 0.6, z);
      this.o.rotation.set(0, SHELF.yaw + (i % 2 ? 0.25 : -0.25), (i % 3) * 0.08 - 0.08);
      this.o.scale.setScalar(Math.max(0.001, s));
      this.o.updateMatrix();
      this.mesh.setMatrixAt(i, this.o.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}
