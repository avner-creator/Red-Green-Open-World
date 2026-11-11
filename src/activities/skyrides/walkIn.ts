/**
 * Walk-in start pad (foam course, stunt plane, dragon roost): a big ring on the ground by the ride.
 * Walk onto it and stand there: the ring fills up with three rising ticks and the ride starts (its
 * own 3-2-1 follows). No reading and no button needed; E (or the device's use button) still starts
 * at once. Walking off empties the ring; after a ride you must step off once before it arms again,
 * so finishing never drops you straight into the next round.
 *
 * Both-eye object: a white-rimmed dark ring with a bright yellow fill, readable in R and G alone.
 * Two draws, only while the hero is within `showWithin` metres.
 */
import * as THREE from 'three';
import type { GameContext } from '../../types';

export interface WalkInOptions {
  /** Ground point of the pad's centre (world). */
  at: THREE.Vector3;
  radius?: number;
  /** Seconds of standing to start. */
  hold?: number;
  /** Can the ride start now (idle, on foot, playing)? */
  enabled(): boolean;
  onStart(): void;
  showWithin?: number;
}

/** Pure fill rule (tests): standing inside fills, outside drains fast; returns the new fill and whether it fired. */
export function stepFill(fill: number, inside: boolean, armed: boolean, dt: number, hold: number): { fill: number; fire: boolean } {
  if (!inside || !armed) return { fill: Math.max(0, fill - dt * 3), fire: false };
  const f = fill + dt / hold;
  return f >= 1 ? { fill: 0, fire: true } : { fill: f, fire: false };
}

export class WalkInPad {
  readonly group = new THREE.Group();
  private fill = 0;
  /** Must step off the pad once before it can fire (after a ride, or when spawning on it). */
  private armed = false;
  private ticks = 0;
  private readonly fillMat: THREE.MeshBasicMaterial;
  private readonly uniforms = { fill: { value: 0 } };
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mats: THREE.Material[] = [];
  private readonly r: number;
  private readonly hold: number;
  private readonly showWithin: number;
  private t = 0;

  constructor(
    private readonly ctx: GameContext,
    private readonly opts: WalkInOptions,
  ) {
    this.r = opts.radius ?? 1.25;
    this.hold = opts.hold ?? 1.1;
    this.showWithin = opts.showWithin ?? 28;
    this.group.name = 'walk-in-pad';
    this.group.position.copy(opts.at).setY(opts.at.y + 0.04);
    const base = new THREE.RingGeometry(this.r * 0.55, this.r, 40, 1);
    base.rotateX(-Math.PI / 2);
    const rim = new THREE.RingGeometry(this.r, this.r + 0.14, 40, 1);
    rim.rotateX(-Math.PI / 2);
    // Base: dark disc ring with a white rim (one geometry, vertex colours).
    const merged = mergeColored([
      [base, 0x10142a],
      [rim, 0xffffff],
    ]);
    const baseMat = new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const baseMesh = new THREE.Mesh(merged, baseMat);
    baseMesh.renderOrder = 1;
    // Fill: a bright ring that sweeps round as you stand on it.
    const fillGeo = new THREE.RingGeometry(this.r * 0.6, this.r * 0.95, 40, 1);
    fillGeo.rotateX(-Math.PI / 2);
    fillGeo.translate(0, 0.01, 0);
    this.fillMat = new THREE.MeshBasicMaterial({ color: 0xffd93b, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.fillMat.onBeforeCompile = (shader) => {
      shader.uniforms.fill = this.uniforms.fill;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vPad;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPad = position.xz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vPad;\nuniform float fill;')
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nfloat padA = (atan(vPad.x, -vPad.y) + PI) / (2.0 * PI);\nif (padA > fill) discard;');
    };
    this.fillMat.customProgramCacheKey = () => 'rg-walkin-fill';
    const fillMesh = new THREE.Mesh(fillGeo, this.fillMat);
    fillMesh.renderOrder = 2;
    for (const m of [baseMesh, fillMesh]) {
      m.userData.cameraIgnore = true;
      m.castShadow = false;
      m.receiveShadow = false;
    }
    this.group.add(baseMesh, fillMesh);
    this.geos.push(merged, fillGeo, base, rim);
    this.mats.push(baseMat, this.fillMat);
    ctx.scene.add(this.group);
  }

  /** How full the ring is (0..1), for tests. */
  get progress(): number {
    return this.fill;
  }

  /** Disarm until the hero steps off (call when a ride ends with the hero put on/near the pad). */
  disarm(): void {
    this.armed = false;
    this.fill = 0;
  }

  update(dt: number): void {
    const p = this.ctx.player.position;
    const c = this.opts.at;
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    const near = d < this.showWithin;
    this.t += dt;
    const enabled = this.opts.enabled();
    this.group.visible = near && enabled;
    if (!enabled) {
      this.fill = 0;
      this.uniforms.fill.value = 0;
      return;
    }
    const inside = d < this.r && Math.abs(p.y - c.y) < 1.6 && this.ctx.player.mode === 'walk';
    if (!inside && d > this.r + 0.3) this.armed = true;
    const r = stepFill(this.fill, inside, this.armed, dt, this.hold);
    const before = Math.floor(this.fill * 3);
    this.fill = r.fill;
    const after = Math.floor(this.fill * 3);
    if (inside && this.armed && after > before && after > this.ticks) {
      this.ticks = after;
      this.ctx.audio.play('tick', { pitch: 1 + after * 0.15, volume: 0.7 });
    }
    if (this.fill === 0) this.ticks = 0;
    this.uniforms.fill.value = this.fill;
    // Idle breathing so it reads as "step here".
    const s = 1 + 0.04 * Math.sin(this.t * 3.2);
    this.group.scale.set(s, 1, s);
    if (r.fire) {
      this.armed = false;
      this.ticks = 0;
      this.opts.onStart();
    }
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}

function mergeColored(parts: [THREE.BufferGeometry, number][]): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  for (const [g, hex] of parts) {
    const ng = g.index ? g.toNonIndexed() : g;
    const p = ng.getAttribute('position');
    c.setHex(hex).convertSRGBToLinear();
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      col.push(c.r, c.g, c.b);
    }
    if (ng !== g) ng.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}
