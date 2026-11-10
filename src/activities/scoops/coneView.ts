/**
 * The cone you build, shown on the counter holder: a chain of levels (cone → scoops → crown of
 * sauce and toppings) that bends with the wobble, loses its top when it topples (the scoops fly off
 * and splat comically) and disappears bite by bite when eaten. Both-eye.
 */
import * as THREE from 'three';
import type { ConeId, FlavourId, SauceId, ToppingId } from './logic';
import { FLAVOURS } from './logic';
import { Kit, T, glossMaterial, paintMaterial } from './kit';
import { CONE, addCone, addSauce, addScoop, addSplat, addTopping } from './ingredients';

const coneGeoCache = new Map<string, THREE.BufferGeometry>();
const scoopGeoCache = new Map<string, THREE.BufferGeometry>();
const splatGeoCache = new Map<string, THREE.BufferGeometry>();

function coneGeo(id: ConeId, scale: number): THREE.BufferGeometry {
  const key = `${id}@${scale}`;
  let g = coneGeoCache.get(key);
  if (!g) {
    const k = new Kit();
    addCone(k, id, new THREE.Matrix4(), scale);
    g = k.build();
    coneGeoCache.set(key, g);
  }
  return g;
}

export function scoopGeo(f: FlavourId, scale = 1): THREE.BufferGeometry {
  const key = `${f}@${scale}`;
  let g = scoopGeoCache.get(key);
  if (!g) {
    const k = new Kit();
    addScoop(k, f, new THREE.Matrix4(), FLAVOURS.indexOf(f) + 1, scale);
    g = k.build();
    scoopGeoCache.set(key, g);
  }
  return g;
}

function splatGeo(f: FlavourId): THREE.BufferGeometry {
  let g = splatGeoCache.get(f);
  if (!g) {
    const k = new Kit();
    addSplat(k, f, new THREE.Matrix4());
    g = k.build();
    splatGeoCache.set(f, g);
  }
  return g;
}

export interface ConeState {
  cone: ConeId | null;
  scoops: readonly FlavourId[];
  sauce: SauceId | null;
  toppings: readonly ToppingId[];
}

interface Faller {
  mesh: THREE.Mesh;
  flavour: FlavourId;
  vel: THREE.Vector3;
  spin: THREE.Vector3;
  t: number;
  landed: boolean;
  floorY: number;
}

/** Where a falling scoop comes to rest, in the parent's frame. */
export type RestHeight = (x: number, z: number) => number;

export class ConeView {
  /** Positioned at the cone tip; parent it where the cone should stand. */
  readonly root = new THREE.Group();
  private readonly paint = paintMaterial();
  private readonly gloss = glossMaterial();
  private coneMesh: THREE.Mesh | null = null;
  private levels: THREE.Group[] = [];
  private crown: THREE.Mesh | null = null;
  private crownKey = '';
  private state: ConeState = { cone: null, scoops: [], sauce: null, toppings: [] };
  private readonly fallers: Faller[] = [];
  /** Group the topple debris lives in (the parlour), and the rest height in that frame. */
  constructor(
    private readonly debrisParent: THREE.Object3D,
    private readonly restAt: RestHeight,
    private readonly scale = 1,
  ) {
    this.root.name = 'Scoops.cone';
  }

  /** Bring the visuals in line with the build (cheap when nothing changed). */
  set(s: ConeState): void {
    const prev = this.state;
    if (s.cone !== prev.cone) {
      if (this.coneMesh) this.root.remove(this.coneMesh);
      this.coneMesh = s.cone ? new THREE.Mesh(coneGeo(s.cone, this.scale), this.paint) : null;
      if (this.coneMesh) {
        this.coneMesh.castShadow = true;
        this.root.add(this.coneMesh);
      }
    }
    // Scoop chain: keep the common prefix, rebuild the rest.
    let keep = 0;
    while (keep < s.scoops.length && keep < prev.scoops.length && s.scoops[keep] === prev.scoops[keep]) keep++;
    while (this.levels.length > keep) this.levels.pop()?.removeFromParent();
    for (let i = keep; i < s.scoops.length; i++) {
      const g = new THREE.Group();
      const parent = i === 0 ? this.root : this.levels[i - 1];
      g.position.y = i === 0 ? CONE.height * this.scale * 0.93 : CONE.step * this.scale;
      const m = new THREE.Mesh(scoopGeo(s.scoops[i], this.scale), this.gloss);
      m.castShadow = true;
      g.add(m);
      parent.add(g);
      this.levels.push(g);
    }
    const key = `${s.sauce}|${s.toppings.join(',')}|${s.scoops.length}`;
    if (key !== this.crownKey) {
      this.crownKey = key;
      this.crown?.removeFromParent();
      this.crown?.geometry.dispose();
      this.crown = null;
      const top = this.levels[this.levels.length - 1];
      if (top && (s.sauce || s.toppings.length)) {
        const k = new Kit();
        if (s.sauce) addSauce(k, s.sauce, new THREE.Matrix4(), this.scale);
        s.toppings.forEach((t, i) => addTopping(k, t, T(0, s.sauce ? 0.02 * this.scale : 0, 0, i * 2.1), i + 1, this.scale));
        this.crown = new THREE.Mesh(k.build(), this.gloss);
        top.add(this.crown);
      }
    }
    this.state = { cone: s.cone, scoops: [...s.scoops], sauce: s.sauce, toppings: [...s.toppings] };
  }

  /** Top of the stack (where the next scoop or the secret topping sits), in world space. */
  topWorld(out: THREE.Vector3): THREE.Vector3 {
    const top = this.levels[this.levels.length - 1];
    this.root.updateWorldMatrix(true, true);
    if (top) return out.set(0, CONE.scoop * this.scale * 1.75, 0).applyMatrix4(top.matrixWorld);
    return out.set(0, CONE.height * this.scale, 0).applyMatrix4(this.root.matrixWorld);
  }

  /** Lean the stack (radians; x = sideways, z = toward the customer). */
  setLean(x: number, z: number): void {
    const n = Math.max(1, this.levels.length);
    for (const g of this.levels) g.rotation.set(z / n, 0, -x / n);
  }

  /** 0 = whole cone, 1 = all gone (bites eat from the top down). */
  setEaten(f: number): void {
    const total = this.levels.length + 1;
    const left = Math.ceil(total * (1 - Math.min(1, Math.max(0, f))));
    if (this.coneMesh) this.coneMesh.visible = left >= 1;
    this.levels.forEach((g, i) => (g.visible = i + 2 <= left));
  }

  /**
   * The top `n` scoops fly off (topple) in the lean direction `dir` (parent frame) and splat where
   * they land. The build must drop them too (`ConeBuilder.dropTop`).
   */
  topple(n: number, dirX: number, dirZ: number): void {
    const count = Math.min(n, this.levels.length);
    const inv = new THREE.Matrix4();
    this.debrisParent.updateWorldMatrix(true, false);
    inv.copy(this.debrisParent.matrixWorld).invert();
    const len = Math.hypot(dirX, dirZ) || 1;
    for (let i = 0; i < count; i++) {
      const idx = this.levels.length - 1 - i;
      const g = this.levels[idx];
      g.updateWorldMatrix(true, false);
      const m = new THREE.Matrix4().multiplyMatrices(inv, g.matrixWorld);
      const flavour = this.state.scoops[idx];
      const mesh = new THREE.Mesh(scoopGeo(flavour, this.scale), this.gloss);
      m.decompose(mesh.position, mesh.quaternion, mesh.scale);
      this.debrisParent.add(mesh);
      const sp = 1.2 + i * 0.5;
      this.fallers.push({
        mesh,
        flavour,
        vel: new THREE.Vector3((dirX / len) * sp, 1.6 + i * 0.6, (dirZ / len) * sp),
        spin: new THREE.Vector3(3 + i, 0, -4 - i),
        t: 0,
        landed: false,
        floorY: 0,
      });
    }
    const keep = this.state.scoops.slice(0, this.state.scoops.length - count);
    this.set({ ...this.state, scoops: keep, sauce: null, toppings: [] });
  }

  update(dt: number): void {
    for (let i = this.fallers.length - 1; i >= 0; i--) {
      const f = this.fallers[i];
      f.t += dt;
      if (!f.landed) {
        f.vel.y -= 14 * dt;
        f.mesh.position.addScaledVector(f.vel, dt);
        f.mesh.rotation.x += f.spin.x * dt;
        f.mesh.rotation.z += f.spin.z * dt;
        const rest = this.restAt(f.mesh.position.x, f.mesh.position.z);
        if (f.mesh.position.y <= rest && f.vel.y < 0) {
          f.landed = true;
          f.t = 0;
          f.floorY = rest;
          f.mesh.geometry = splatGeo(f.flavour);
          f.mesh.position.y = rest + 0.005;
          f.mesh.rotation.set(0, f.mesh.rotation.y, 0);
          f.mesh.scale.set(1, 3, 1);
        }
      } else {
        // Squash into a splat, wobble, then melt away.
        const k = Math.min(1, f.t / 0.25);
        f.mesh.scale.y = 3 - 2 * k + Math.sin(f.t * 20) * 0.15 * (1 - k);
        if (f.t > 3.5) f.mesh.scale.setScalar(Math.max(0.001, 1 - (f.t - 3.5) / 0.8));
        if (f.t > 4.3) {
          f.mesh.removeFromParent();
          this.fallers.splice(i, 1);
        }
      }
    }
  }

  /** Number of splats/fallers alive (tests, budget). */
  get debris(): number {
    return this.fallers.length;
  }

  clear(): void {
    this.set({ cone: null, scoops: [], sauce: null, toppings: [] });
    this.setLean(0, 0);
    this.setEaten(0);
  }

  dispose(): void {
    this.clear();
    for (const f of this.fallers) f.mesh.removeFromParent();
    this.fallers.length = 0;
    this.crown?.geometry.dispose();
    this.paint.dispose();
    this.gloss.dispose();
  }
}

/** Free the shared geometry caches (on activity dispose). */
export function disposeConeCaches(): void {
  for (const c of [coneGeoCache, scoopGeoCache, splatGeoCache]) {
    for (const g of c.values()) g.dispose();
    c.clear();
  }
}
