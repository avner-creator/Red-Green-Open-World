/**
 * Friendly stall-keepers: one per booth, round and smiley with a straw hat and a big wave. Two
 * instanced draws for all five (body+head, arms). They turn to face a nearby player, wave hello,
 * and hop and clap when anyone scores.
 */
import * as THREE from 'three';
import { BOOTH_FRONT_Z, BOOTH_X, GAME_IDS } from './layout';
import type { GameId } from './layout';
import { G, Kit, T, kitMaterial } from './kit';

const SKIN = 0xf0c49a;

function keeperBody(): THREE.BufferGeometry {
  const k = new Kit();
  // Legs, striped shirt body, bow tie.
  for (const s of [-1, 1]) k.add(G.cylLo, 0x1d2238, T(s * 0.1, 0, 0, 0, 0.17, 0.42, 0.17));
  k.add(G.cyl, 0xf6f2ea, T(0, 0.38, 0, 0, 0.66, 0.66, 0.56));
  for (const y of [0.5, 0.68, 0.86]) k.add(G.cyl, 0x8c1c34, T(0, y, 0, 0, 0.675, 0.07, 0.575));
  k.add(G.sphere, 0xf6f2ea, T(0, 1.02, 0, 0, 0.66, 0.3, 0.56));
  for (const s of [-1, 1]) k.add(G.cone, 0x8c1c34, T(s * 0.08, 1.08, 0.25, 0, 0.12, 0.14, 0.1, 0, s * Math.PI / 2));
  // Big head with big eyes, rosy cheeks, smile, nose.
  k.add(G.sphere, SKIN, T(0, 1.36, 0, 0, 0.64, 0.6, 0.6));
  for (const s of [-1, 1]) {
    k.add(G.sphere, 0xffffff, T(s * 0.12, 1.42, 0.24, 0, 0.17, 0.2, 0.1));
    k.add(G.sphere, 0x0a0a10, T(s * 0.12, 1.41, 0.29, 0, 0.1, 0.12, 0.05));
    k.add(G.sphereLo, 0xffffff, T(s * 0.12 + 0.025, 1.45, 0.31, 0, 0.03, 0.03, 0.02));
    k.add(G.sphereLo, 0xe88a8a, T(s * 0.2, 1.31, 0.23, 0, 0.1, 0.06, 0.04));
  }
  k.add(G.sphere, 0xe39a6a, T(0, 1.34, 0.31, 0, 0.09, 0.08, 0.08));
  k.add(new THREE.TorusGeometry(0.07, 0.016, 6, 12, Math.PI), 0x3a1410, T(0, 1.27, 0.285, 0, 1, 1, 1, 0, Math.PI));
  // Straw boater.
  k.add(G.cyl, 0xf2d27a, T(0, 1.58, 0, 0, 0.82, 0.03, 0.82));
  k.add(G.cyl, 0xf2d27a, T(0, 1.58, 0, 0, 0.5, 0.17, 0.5));
  k.add(G.cyl, 0x23308a, T(0, 1.61, 0, 0, 0.51, 0.06, 0.51));
  return k.build();
}

function keeperArm(): THREE.BufferGeometry {
  // Pivot at the shoulder, hanging down −Y.
  const k = new Kit();
  k.add(G.cylLo, 0xf6f2ea, T(0, -0.42, 0, 0, 0.13, 0.42, 0.13));
  k.add(G.sphere, SKIN, T(0, -0.46, 0, 0, 0.16, 0.16, 0.16));
  return k.build();
}

/** Keeper spot per booth in the site frame: x, z, base yaw (facing the midway = 0). */
export function keeperSpot(game: GameId): [number, number] {
  const bx = BOOTH_X[game];
  if (game === 'strengthBell') return [bx + 2.0, BOOTH_FRONT_Z - 0.6];
  if (game === 'glowDodge') return [bx + 2.15, BOOTH_FRONT_Z + 0.55];
  return [bx + 1.75, BOOTH_FRONT_Z - 1.05];
}

interface KeeperState {
  game: GameId;
  x: number;
  z: number;
  yaw: number;
  wave: number;
  hop: number;
  clap: number;
  phase: number;
}

export class Keepers {
  readonly group = new THREE.Group();
  private readonly bodies: THREE.InstancedMesh;
  private readonly arms: THREE.InstancedMesh;
  private readonly states: KeeperState[];
  private readonly mat = kitMaterial({ roughness: 0.55 });
  private time = 0;
  private readonly o = new THREE.Object3D();
  private readonly a = new THREE.Object3D();

  constructor() {
    this.group.name = 'carnival-keepers';
    const n = GAME_IDS.length;
    this.bodies = new THREE.InstancedMesh(keeperBody(), this.mat, n);
    this.arms = new THREE.InstancedMesh(keeperArm(), this.mat, n * 2);
    for (const m of [this.bodies, this.arms]) {
      m.castShadow = false;
      m.receiveShadow = true;
      m.frustumCulled = false;
      this.group.add(m);
    }
    this.states = GAME_IDS.map((game, i) => {
      const [x, z] = keeperSpot(game);
      return { game, x, z, yaw: 0, wave: 0, hop: 0, clap: 0, phase: i * 1.7 };
    });
    this.update(0, null, null);
  }

  /** Someone scored at this booth: a happy hop. */
  cheer(game: GameId, big = false): void {
    const s = this.states.find((k) => k.game === game);
    if (!s) return;
    s.hop = 1;
    if (big) s.clap = 2.5;
  }

  /** `player` = site-frame x/z of the player (null when far). `busy` = booth in a round. */
  update(dt: number, player: { x: number; z: number } | null, busy: GameId | null): void {
    this.time += dt;
    const t = this.time;
    this.states.forEach((s, i) => {
      let want = 0;
      let near = false;
      if (player) {
        const dx = player.x - s.x;
        const dz = player.z - s.z;
        const d = Math.hypot(dx, dz);
        if (d < 9) want = THREE.MathUtils.clamp(Math.atan2(dx, dz), -1.1, 1.1);
        near = d < 4.5 && busy !== s.game;
      }
      s.yaw += (want - s.yaw) * Math.min(1, dt * 4);
      s.wave = THREE.MathUtils.clamp(s.wave + (near ? dt * 3 : -dt * 3), 0, 1);
      s.hop = Math.max(0, s.hop - dt * 2.2);
      s.clap = Math.max(0, s.clap - dt);
      const hopY = Math.sin(s.hop * Math.PI) * 0.22;
      const breathe = 1 + Math.sin(t * 2.1 + s.phase) * 0.02;
      this.o.position.set(s.x, hopY, s.z);
      this.o.rotation.set(0, s.yaw, Math.sin(t * 1.3 + s.phase) * 0.04);
      this.o.scale.set(1, breathe, 1);
      this.o.updateMatrix();
      this.bodies.setMatrixAt(i, this.o.matrix);
      for (const side of [-1, 1]) {
        let roll = side * 0.18;
        if (s.clap > 0) roll = side * (2.4 + Math.sin(t * 16) * 0.35);
        else if (side > 0 && s.wave > 0) roll = 0.18 + s.wave * (2.5 + Math.sin(t * 9) * 0.45);
        this.a.position.set(side * 0.36, 1.0, 0);
        this.a.rotation.set(0, 0, roll);
        this.a.updateMatrix();
        const m = this.o.matrix.clone().multiply(this.a.matrix);
        this.arms.setMatrixAt(i * 2 + (side > 0 ? 1 : 0), m);
      }
    });
    this.bodies.instanceMatrix.needsUpdate = true;
    this.arms.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.bodies.geometry.dispose();
    this.arms.geometry.dispose();
    this.mat.dispose();
  }
}
