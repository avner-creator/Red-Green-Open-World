import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createPhysicsSync, GROUP_AVATAR, groups, rowMajorToRapier } from '../../src/core/physics';
import { pickFocus } from '../../src/core/interactions';
import type { Interactable } from '../../src/types';

beforeAll(async () => {
  await RAPIER.init();
});

describe('physics helpers', () => {
  it('row-major → Rapier column-major conversion', () => {
    // nx=2, nz=1: rows z=0: [0,1,2], z=1: [3,4,5]
    const h = rowMajorToRapier(2, 1, new Float32Array([0, 1, 2, 3, 4, 5]));
    expect(Array.from(h)).toEqual([0, 3, 1, 4, 2, 5]);
  });

  it('heightfield: height grows with +x and +z as given row-major', () => {
    const p = createPhysicsSync();
    const nx = 4;
    const nz = 4;
    const heights = new Float32Array((nx + 1) * (nz + 1));
    // h = x index * 1 + z index * 10 (distinguishes axes).
    for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++) heights[z * (nx + 1) + x] = x + 10 * z;
    p.addHeightfield(nx, nz, heights, { x: 40, z: 40 });
    p.world.step();
    const down = new THREE.Vector3(0, -1, 0);
    const at = (x: number, z: number): number => p.raycast(new THREE.Vector3(x, 200, z), down, 400)!.point.y;
    // Sample corners: (−20,−20) → index (0,0) = 0; (+20,−20) → x=4 → 4; (−20,+20) → z=4 → 40.
    expect(at(-19.9, -19.9)).toBeCloseTo(0, 0);
    expect(at(19.9, -19.9)).toBeCloseTo(4, 0);
    expect(at(-19.9, 19.9)).toBeCloseTo(40, 0);
  });

  it('raycast ignores avatar colliders and normalises direction', () => {
    const p = createPhysicsSync();
    p.addStaticBox(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(10, 0.5, 10));
    p.world.createCollider(
      p.rapier.ColliderDesc.capsule(0.5, 0.35).setTranslation(0, 0.85, 0).setCollisionGroups(groups(GROUP_AVATAR, 0xffff)),
    );
    p.world.step();
    const hit = p.raycast(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, -3, 0), 20);
    expect(hit).not.toBeNull();
    expect(hit!.point.y).toBeCloseTo(0, 3);
    expect(hit!.distance).toBeCloseTo(5, 3);
    expect(p.raycast(new THREE.Vector3(0, 5, 0), new THREE.Vector3(0, 0, 0), 20)).toBeNull();
  });

  it('step runs fixed 60 Hz substeps', () => {
    const p = createPhysicsSync();
    const body = p.world.createRigidBody(p.rapier.RigidBodyDesc.dynamic().setTranslation(0, 100, 0));
    p.world.createCollider(p.rapier.ColliderDesc.ball(0.5), body);
    p.step(1 / 120);
    expect(body.translation().y).toBe(100);
    p.step(1 / 120);
    expect(body.translation().y).toBeLessThan(100);
  });
});

describe('interaction focus', () => {
  const mk = (id: string, x: number, radius: number, enabled = true): Interactable => ({
    id, radius, icon: 'hand', position: () => new THREE.Vector3(x, 0, 0), enabled: () => enabled, onUse: () => undefined,
  });
  it('picks the nearest enabled target in range', () => {
    const from = new THREE.Vector3(0, 0, 0);
    const a = mk('a', 2, 3);
    const b = mk('b', 1, 3, false);
    const c = mk('c', 2.5, 3);
    const far = mk('far', 10, 3);
    expect(pickFocus([a, b, c, far], from)?.id).toBe('a');
    expect(pickFocus([far], from)).toBeNull();
  });
});
