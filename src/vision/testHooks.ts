/**
 * Test-only helpers (`window.__rgVision`, only when `ctx.testMode`). Playwright cannot import three
 * in the page, so tests place simple boxes relative to the current camera through this.
 */
import * as THREE from 'three';
import { VisionLayer } from '../types';
import type { GameContext, VisionApi } from '../types';
import { createLayerMaterial } from './materials';
import { createToolkitTestApi, type ToolkitTestApi } from './toolkit/testApi';

export interface TestObjectOptions {
  layer: 'both' | 'weak' | 'strong';
  /** Metres in front of the camera. */
  distance: number;
  /** Edge length in metres. */
  size: number;
  /** Offset in camera space (metres, +x right, +y up). */
  offsetX?: number;
  offsetY?: number;
  /** Grey level 0..1 (layer objects: pop amount). Default 1 (both: 0.5). */
  grey?: number;
}

export interface VisionTestApi {
  addTestObject(opts: TestObjectOptions): number;
  setTestVisible(id: number, visible: boolean): void;
  removeTestObjects(): void;
  /** True while the calibration overlay is open. */
  calibrationOpen(): boolean;
  /** Vision toolkit blocks (rings, glyphs, half symbols, dot pictures). */
  toolkit: ToolkitTestApi;
}

declare global {
  interface Window {
    __rgVision?: VisionTestApi;
  }
}

export function installTestHooks(ctx: Pick<GameContext, 'camera'>, vision: VisionApi, calibrationOpen: () => boolean): void {
  const objects = new Map<number, THREE.Object3D>();
  let next = 1;
  window.__rgVision = {
    addTestObject(o) {
      const cam = ctx.camera;
      cam.updateMatrixWorld();
      const pos = new THREE.Vector3(o.offsetX ?? 0, o.offsetY ?? 0, -o.distance).applyMatrix4(cam.matrixWorld);
      const geo = new THREE.BoxGeometry(o.size, o.size, o.layer === 'both' ? 0.2 : o.size);
      const mat =
        o.layer === 'both'
          ? new THREE.MeshStandardMaterial({ color: new THREE.Color().setScalar(o.grey ?? 0.5), roughness: 1 })
          : createLayerMaterial(o.grey ?? 1);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(pos);
      mesh.quaternion.copy(cam.quaternion);
      const layer = o.layer === 'both' ? VisionLayer.Both : o.layer === 'weak' ? VisionLayer.WeakOnly : VisionLayer.StrongOnly;
      vision.add(mesh, layer);
      const id = next++;
      objects.set(id, mesh);
      return id;
    },
    setTestVisible(id, visible) {
      const o = objects.get(id);
      if (o) o.visible = visible;
    },
    removeTestObjects() {
      for (const o of objects.values()) vision.remove(o);
      objects.clear();
    },
    calibrationOpen,
    toolkit: createToolkitTestApi(ctx, vision),
  };
}
