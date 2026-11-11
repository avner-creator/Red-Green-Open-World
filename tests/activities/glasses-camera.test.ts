import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { cameraSafe } from '../../src/activities/glasses/camera';
import { createWeave } from '../../src/activities/glasses/weave';
import type { WeavePartDef } from '../../src/activities/glasses/weave/parts';
import type { WeavePart } from '../../src/activities/glasses/weave/types';
import { CAMERA_OCCLUDER, createCameraOccluders, sceneryKind } from '../../src/core/camera-occluders';
import { SHADOW_PROXY_LAYER } from '../../src/core/shadow-proxy';
import { VisionLayer } from '../../src/types';
import type { GameContext } from '../../src/types';

/** A big static box that WOULD be baked as a camera occluder (opted in, never moves). */
function bigOccluder(name: string, x: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), new THREE.MeshBasicMaterial());
  m.name = name;
  m.position.set(x, 2, 0);
  m.updateMatrix();
  m.matrixAutoUpdate = false;
  m.userData[CAMERA_OCCLUDER] = true;
  return m;
}

/** A static shadow proxy (the other way a mesh becomes a camera occluder). */
function bigProxy(name: string, x: number): THREE.Mesh {
  const m = bigOccluder(name, x);
  delete m.userData[CAMERA_OCCLUDER];
  m.layers.set(SHADOW_PROXY_LAYER);
  return m;
}

/** The real vision API's parenting: Both → the scene, the eye layers → `Vision.*` groups. */
function fakeCtx(scene: THREE.Scene) {
  const weak = new THREE.Group();
  weak.name = 'Vision.WeakOnly';
  const strong = new THREE.Group();
  strong.name = 'Vision.StrongOnly';
  const registered: [THREE.Object3D, VisionLayer][] = [];
  const ctx = {
    testMode: false,
    session: { state: { phase: 'playing' } },
    events: { on: () => () => {} },
    vision: {
      add(o: THREE.Object3D, l: VisionLayer) {
        registered.push([o, l]);
        (l === VisionLayer.Both ? scene : l === VisionLayer.WeakOnly ? weak : strong).add(o);
      },
      remove: (o: THREE.Object3D) => void o.removeFromParent(),
    },
  };
  return { ctx: ctx as unknown as GameContext, registered };
}

describe('glasses objects and the camera', () => {
  it('no object a weave part registers (any layer) is ever a camera occluder, even if it opts in', () => {
    const scene = new THREE.Scene();
    const { ctx, registered } = fakeCtx(scene);
    const def: WeavePartDef = {
      id: 'probe',
      kind: 'popOut',
      create(env): WeavePart {
        env.add(bigOccluder('weak', 0), VisionLayer.WeakOnly);
        env.add(bigProxy('strong', 10), VisionLayer.StrongOnly);
        env.add(bigOccluder('both', 20), VisionLayer.Both);
        env.add(bigProxy('both-proxy', 30), VisionLayer.Both);
        const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(4, 4, 4), new THREE.MeshBasicMaterial(), 2);
        inst.userData[CAMERA_OCCLUDER] = true;
        env.add(inst, VisionLayer.WeakOnly);
        return { id: env.id, kind: env.kind, reset() {}, update() {}, dispose() {}, debug: () => ({}), drawObjects: () => env.tracked() };
      },
    };
    createWeave(ctx, { countDraws: () => 1, parts: [def] });
    expect(registered.length).toBe(5);
    for (const [o] of registered) o.traverse((c) => expect(sceneryKind(c), c.name).toBe('ignore'));
    // The camera's own scanner bakes nothing and gathers no crown from any of them.
    const occ = createCameraOccluders(scene);
    const at = new THREE.Vector3(10, 1, 0);
    for (let i = 0; i < 4; i++) occ.refresh(at);
    expect(occ.stats()).toEqual({ triangles: 0, bakes: 0, capsules: 0 });
  });

  it('control: the same opted-in box outside the glasses envs does block the camera', () => {
    const scene = new THREE.Scene();
    scene.add(bigOccluder('plain', 20));
    const occ = createCameraOccluders(scene);
    for (let i = 0; i < 4; i++) occ.refresh(new THREE.Vector3(20, 1, 0));
    expect(occ.stats().triangles).toBeGreaterThan(0);
    // …and cameraSafe takes it out.
    const s2 = new THREE.Scene();
    s2.add(cameraSafe(bigOccluder('plain', 20)));
    const o2 = createCameraOccluders(s2);
    for (let i = 0; i < 4; i++) o2.refresh(new THREE.Vector3(20, 1, 0));
    expect(o2.stats().triangles).toBe(0);
  });

  it('every glasses object reaches a layer only through an env (whose add marks it camera-safe)', () => {
    const root = join(__dirname, '../../src/activities/glasses');
    const files: string[] = [];
    const walk = (d: string): void => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts')) files.push(p);
      }
    };
    walk(root);
    const direct: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      const n = (src.match(/\bvision\.add\(/g) ?? []).length;
      if (n) direct.push(`${relative(root, f)}:${n}`);
      if (/\bvision\.add\(/.test(src)) expect(src, relative(root, f)).toMatch(/cameraSafe\(/);
    }
    // The two framework envs (mechanics, weave parts); the mechanics' env re-attaches on far-idle.
    expect(direct.sort()).toEqual(['index.ts:2', 'weave/index.ts:1']);
  });
});
