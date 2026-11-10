/**
 * Trails: both-eye particles behind the player while moving (on foot, or behind the buggy/horse).
 * One instanced mesh with at most 60 pooled particles, unlit (no shadows, no bloom dependence).
 * Trails only ever follow the player: they never mark where a gem is.
 */
import * as THREE from 'three';
import type { GameContext } from '../../types';
import { trailKind } from './catalog';
import type { TrailKind } from './catalog';
import { MAX_TRAIL_PARTICLES, TRAIL_PALETTES, TRAIL_SPECS, TrailEmitter } from './trailLogic';

interface Puff {
  alive: boolean;
  age: number;
  life: number;
  x: number;
  y: number;
  z: number;
  vy: number;
  spin: number;
  size: number;
  seed: number;
}

export interface Trails {
  update(dt: number): void;
  active(): TrailKind | null;
  particleCount(): number;
  dispose(): void;
}

function geometryFor(kind: TrailKind): THREE.BufferGeometry {
  switch (kind) {
    case 'sparkle':
      // Four-point glint: a flat octahedron.
      return new THREE.OctahedronGeometry(0.5, 0).scale(0.55, 1.4, 0.55);
    case 'bubbles':
      return new THREE.IcosahedronGeometry(0.5, 1);
    default:
      return new THREE.BoxGeometry(0.7, 0.28, 0.7);
  }
}

export function createTrails(ctx: GameContext): Trails {
  const geos: Record<TrailKind, THREE.BufferGeometry> = {
    sparkle: geometryFor('sparkle'),
    bubbles: geometryFor('bubbles'),
    rainbow: geometryFor('rainbow'),
  };
  const mat = new THREE.MeshBasicMaterial({ fog: false });
  const mesh = new THREE.InstancedMesh(geos.sparkle, mat, MAX_TRAIL_PARTICLES);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const puffs: Puff[] = [];
  const white = new THREE.Color(0xffffff);
  for (let i = 0; i < MAX_TRAIL_PARTICLES; i++) {
    puffs.push({ alive: false, age: 0, life: 1, x: 0, y: 0, z: 0, vy: 0, spin: 0, size: 0.2, seed: 0 });
    mesh.setMatrixAt(i, zero);
    mesh.setColorAt(i, white);
  }
  mesh.visible = false;
  ctx.scene.add(mesh);

  const emitter = new TrailEmitter();
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const last = new THREE.Vector3();
  let haveLast = false;
  let next = 0;
  let count = 0;
  let emitted = 0;
  let current: TrailKind | null = null;
  let time = 0;

  const setKind = (kind: TrailKind | null): void => {
    if (kind === current) return;
    current = kind;
    if (kind) mesh.geometry = geos[kind];
    // Clear what is in flight so two kinds never mix.
    for (let i = 0; i < puffs.length; i++) {
      puffs[i].alive = false;
      mesh.setMatrixAt(i, zero);
    }
    mesh.instanceMatrix.needsUpdate = true;
    emitter.reset();
    haveLast = false;
    count = 0;
  };

  function emit(kind: TrailKind, x: number, y: number, z: number): void {
    const spec = TRAIL_SPECS[kind];
    const i = next;
    next = (next + 1) % MAX_TRAIL_PARTICLES;
    const p = puffs[i];
    const palette = TRAIL_PALETTES[kind];
    const jitter = kind === 'rainbow' ? 0 : 0.18;
    p.alive = true;
    p.age = 0;
    p.life = spec.life * (0.85 + 0.3 * Math.random());
    p.x = x + (Math.random() - 0.5) * jitter * 2;
    p.y = y + 0.12 + (kind === 'rainbow' ? 0.05 : Math.random() * 0.5);
    p.z = z + (Math.random() - 0.5) * jitter * 2;
    p.vy = spec.rise * (0.6 + Math.random() * 0.8);
    p.spin = (Math.random() - 0.5) * 6;
    p.size = spec.size * (0.8 + Math.random() * 0.5);
    p.seed = Math.random() * 6.28;
    // Rainbow colours follow the order they are laid down, so bands stay in sequence.
    color.setHex(palette[emitted % palette.length]);
    mesh.setColorAt(i, color);
    emitted++;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  function update(dt: number): void {
    time += dt;
    const playing = ctx.session.state.phase === 'playing';
    const kind = trailKind(ctx.profile.equipped('trail'));
    setKind(kind);
    mesh.visible = kind !== null;
    if (!kind) return;
    const spec = TRAIL_SPECS[kind];

    // Emit behind whatever carries the player.
    const veh = ctx.player.vehicle;
    const mode = ctx.player.mode;
    const source = veh ? veh.position : ctx.player.position;
    const moving = veh ? veh.speed > 1.5 : Math.hypot(ctx.player.velocity.x, ctx.player.velocity.z) > 1.2;
    const onTheMove = playing && ctx.player.object.visible !== false && (mode === 'walk' || mode === 'driving' || mode === 'riding') && (veh ? true : ctx.player.grounded);
    if (onTheMove && moving) {
      if (!haveLast) last.copy(source);
      const dist = Math.hypot(source.x - last.x, source.z - last.z);
      const n = emitter.advance(dist, spec.spacing);
      for (let k = 0; k < n; k++) {
        if (veh) {
          // A little behind the vehicle.
          const yaw = Math.atan2(source.x - last.x, source.z - last.z);
          emit(kind, source.x - Math.sin(yaw) * 1.8, source.y, source.z - Math.cos(yaw) * 1.8);
        } else {
          emit(kind, source.x, source.y, source.z);
        }
      }
      last.copy(source);
      haveLast = true;
    } else {
      haveLast = false;
    }

    let any = false;
    let alive = 0;
    for (let i = 0; i < puffs.length; i++) {
      const p = puffs[i];
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        mesh.setMatrixAt(i, zero);
        any = true;
        continue;
      }
      alive++;
      any = true;
      const k = p.age / p.life;
      p.y += p.vy * dt;
      const pop = Math.min(1, k * 8);
      const fade = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
      const wob = kind === 'bubbles' ? 1 + 0.12 * Math.sin(time * 6 + p.seed) : 1;
      dummy.position.set(p.x + (kind === 'bubbles' ? Math.sin(time * 2.5 + p.seed) * 0.06 : 0), p.y, p.z);
      dummy.rotation.set(0, kind === 'rainbow' ? 0 : p.spin * p.age + p.seed, kind === 'sparkle' ? 0.3 * Math.sin(p.spin * p.age) : 0);
      dummy.scale.setScalar(Math.max(0.0001, p.size * pop * fade * wob));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    count = alive;
    if (any) mesh.instanceMatrix.needsUpdate = true;
  }

  return {
    update,
    active: () => current,
    particleCount: () => count,
    dispose() {
      ctx.scene.remove(mesh);
      mesh.dispose();
      for (const g of Object.values(geos)) g.dispose();
      mat.dispose();
    },
  };
}
