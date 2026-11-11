/**
 * Both-eye chest helpers (main scene):
 *
 *  - `HintDots`: the dotted "look over there" trail and circle for every chest in ONE instanced
 *    draw. A bright wave runs along each trail and round its circle. Dots are white with a dark
 *    rim, so they read in the red-only and green-only channel.
 *  - `buildCarriedKey`: the key the hero carries, bobbing over the head. Once found the key is no
 *    secret any more, so this one is drawn for both eyes (gold, lit). It has no symbol on it: the
 *    symbol that opens the chest stays a strong-eye clue.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { merge, paint } from './bake';
import type { KeyArea } from './logic';

const DOT_R = 0.27;

function dotGeometry(): THREE.BufferGeometry {
  const rim = paint(new THREE.CylinderGeometry(DOT_R, DOT_R * 1.05, 0.05, 14).translate(0, 0.025, 0), new THREE.Color(0x0a0d1a));
  const core = paint(new THREE.CylinderGeometry(DOT_R * 0.68, DOT_R * 0.68, 0.06, 14).translate(0, 0.035, 0), new THREE.Color(1, 1, 1));
  return merge([rim, core]);
}

interface DotRun {
  first: number;
  count: number;
  /** Phase along the run (0 at the chest end) for the travelling wave. */
  phase: number[];
  pos: THREE.Vector3[];
  shown: boolean;
}

export class HintDots {
  readonly mesh: THREE.InstancedMesh;
  private readonly geo = dotGeometry();
  private readonly mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  private readonly runs: DotRun[] = [];
  private used = 0;
  private readonly m = new THREE.Matrix4();
  private readonly c = new THREE.Color();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(readonly capacity: number) {
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, capacity);
    this.mesh.name = 'chest-hint-dots';
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.userData.cameraIgnore = true;
  }

  /** Lay out the dots for one chest (returns its run index). `ground` gives the surface height or null to skip a dot. */
  add(area: KeyArea, ground: (x: number, z: number) => number | null): number {
    const pts: { x: number; z: number; ph: number }[] = [];
    area.trail.forEach((p, i) => pts.push({ ...p, ph: i * 0.12 }));
    const ringPh = area.trail.length * 0.12;
    area.ring.forEach((p, i) => pts.push({ ...p, ph: ringPh + Math.min(i, area.ring.length - i) * 0.06 }));
    const run: DotRun = { first: this.used, count: 0, phase: [], pos: [], shown: false };
    for (const p of pts) {
      if (this.used >= this.capacity) break;
      const y = ground(p.x, p.z);
      if (y === null) continue;
      run.pos.push(new THREE.Vector3(p.x, y + 0.03, p.z));
      run.phase.push(p.ph);
      this.mesh.setMatrixAt(this.used, this.zero);
      this.mesh.setColorAt(this.used, this.c.setScalar(1));
      this.used++;
      run.count++;
    }
    this.mesh.count = this.used;
    this.runs.push(run);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    return this.runs.length - 1;
  }

  /** Show or hide run `i`; while shown, `t` drives the travelling wave. */
  set(i: number, shown: boolean, t: number): void {
    const run = this.runs[i];
    if (!run) return;
    if (!shown && !run.shown) return;
    run.shown = shown;
    for (let k = 0; k < run.count; k++) {
      const idx = run.first + k;
      if (!shown) {
        this.mesh.setMatrixAt(idx, this.zero);
        continue;
      }
      const w = Math.max(0, Math.sin((t * 1.6 - run.phase[k]) * Math.PI * 2 * 0.5));
      const s = 1 + 0.45 * w * w;
      this.m.makeScale(s, 1, s).setPosition(run.pos[k]);
      this.mesh.setMatrixAt(idx, this.m);
      this.mesh.setColorAt(idx, this.c.setScalar(0.72 + 0.28 * w));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Dots laid for run `i` (test hook). */
  runInfo(i: number): { count: number; shown: boolean } {
    const r = this.runs[i];
    return { count: r?.count ?? 0, shown: r?.shown ?? false };
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    this.mesh.dispose();
  }
}

export interface CarriedKey {
  group: THREE.Group;
  dispose(): void;
}

/** A chunky gold key (bow, shaft, teeth), about 1 m long at scale 1, lit, for both eyes. */
export function buildCarriedKey(): CarriedKey {
  const gold = new THREE.Color(0xffc928);
  const parts = [
    paint(new THREE.TorusGeometry(0.2, 0.07, 10, 28).translate(-0.44, 0, 0), gold),
    paint(new THREE.CylinderGeometry(0.06, 0.06, 0.78, 10).rotateZ(Math.PI / 2).translate(0.1, 0, 0), gold),
    paint(new RoundedBoxGeometry(0.09, 0.22, 0.08, 2, 0.02).translate(0.3, -0.13, 0), gold),
    paint(new RoundedBoxGeometry(0.09, 0.16, 0.08, 2, 0.02).translate(0.44, -0.1, 0), gold),
    // A dark ring inside the bow so the key shape reads against the sky.
    paint(new THREE.TorusGeometry(0.2, 0.03, 6, 24).translate(-0.44, 0, 0.06), new THREE.Color(0x3a2a05)),
  ];
  const geo = merge(parts);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.3, emissive: 0x6b4a00, emissiveIntensity: 0.6 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.userData.cameraIgnore = true;
  const group = new THREE.Group();
  group.name = 'chest-carried-key';
  group.add(mesh);
  group.visible = false;
  return {
    group,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
