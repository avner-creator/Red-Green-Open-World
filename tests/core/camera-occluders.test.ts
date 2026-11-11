/**
 * Only static world scenery blocks the camera: a big instanced mesh that belongs to an attraction
 * (moving bubbles, suits, balloons), anything flagged `userData.cameraIgnore`, and anything on a
 * vision layer never do. An opted-in structure (`userData.cameraOccluder`) does.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createCameraOccluders, sceneryKind } from '../../src/core/camera-occluders';

/** A 3 m ball of instances standing at (0, 0, z) between a camera at z = 10 and a hero at z = 0. */
function ball(z: number): THREE.InstancedMesh {
  const m = new THREE.InstancedMesh(new THREE.SphereGeometry(1.5, 8, 6), new THREE.MeshBasicMaterial(), 1);
  m.setMatrixAt(0, new THREE.Matrix4().makeTranslation(0, 1.5, z));
  return m;
}

function setup(add: (scene: THREE.Scene, world: THREE.Group) => void): number | null {
  const scene = new THREE.Scene();
  const world = new THREE.Group();
  world.name = 'world';
  scene.add(world);
  add(scene, world);
  scene.updateMatrixWorld(true);
  const occ = createCameraOccluders(scene);
  const hero = new THREE.Vector3(0, 1.5, 0);
  occ.refresh(hero);
  // From the hero back toward the camera.
  return occ.cast(hero, new THREE.Vector3(0, 0, 1), 10, 0.2);
}

describe('camera occluders', () => {
  it('a world tree crown between camera and hero blocks', () => {
    expect(setup((_s, w) => w.add(ball(5)))).not.toBeNull();
  });

  it('a big instanced mesh owned by an attraction (outside the world root) never blocks', () => {
    expect(
      setup((s) => {
        const site = new THREE.Group();
        site.name = 'bubbleball';
        site.add(ball(5));
        s.add(site);
      }),
    ).toBeNull();
  });

  it('cameraIgnore (on the mesh or an ancestor) wins, even under the world root', () => {
    expect(
      setup((_s, w) => {
        const b = ball(5);
        b.userData.cameraIgnore = true;
        w.add(b);
      }),
    ).toBeNull();
    expect(
      setup((_s, w) => {
        const g = new THREE.Group();
        g.userData.cameraIgnore = true;
        g.add(ball(5));
        w.add(g);
      }),
    ).toBeNull();
  });

  it('a vision-layer object never blocks (it would reveal it to the other eye)', () => {
    expect(
      setup((s) => {
        const g = new THREE.Group();
        g.name = 'Vision.WeakOnly';
        g.userData.cameraOccluder = true;
        g.add(ball(5));
        s.add(g);
      }),
    ).toBeNull();
  });

  it('cameraOccluder opts a big static attraction structure in', () => {
    expect(
      setup((s) => {
        const g = new THREE.Group();
        g.name = 'some-attraction';
        const b = ball(5);
        b.userData.cameraOccluder = true;
        g.add(b);
        s.add(g);
      }),
    ).not.toBeNull();
  });

  it('sceneryKind', () => {
    const scene = new THREE.Scene();
    const world = new THREE.Group();
    world.name = 'world';
    scene.add(world);
    const tree = new THREE.Mesh();
    world.add(tree);
    const buggy = new THREE.Group();
    buggy.name = 'buggy';
    const seat = new THREE.Mesh();
    buggy.add(seat);
    world.add(buggy);
    const loose = new THREE.Mesh();
    scene.add(loose);
    expect([sceneryKind(tree), sceneryKind(seat), sceneryKind(loose)]).toEqual(['world', 'ignore', 'other']);
  });
});
