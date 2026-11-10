/**
 * Red-green (dichoptic) vision system. Owns the frame:
 *   RenderPass(main scene) → world post passes → DichopticPass (layers + compositor) → canvas.
 *
 * Weak-eye API for other systems: `ctx.vision.add(object, VisionLayer.WeakOnly | StrongOnly)`.
 * Layer objects live in the vision layer scenes (never in `ctx.scene`): they cast no shadows,
 * never occlude or show in reflections, and are depth-tested against the main scene.
 */
import * as THREE from 'three';
import { EffectComposer, RenderPass } from 'postprocessing';
import type { Pass } from 'postprocessing';
import { VisionLayer } from '../types';
import type { GameContext, VisionApi } from '../types';
import { DichopticPass } from './DichopticPass';
import { openCalibrationOverlay } from './calibration';
import type { CalibrationHandle } from './calibration';
import { glowTime } from './materials';
import { deriveChannels } from './math';
import { installTestHooks } from './testHooks';

export { deriveChannels } from './math';
export { createGlowMaterial, createLayerMaterial } from './materials';
export type { GlowOptions } from './materials';

type BootCtx = Pick<GameContext, 'renderer' | 'scene' | 'camera' | 'settings' | 'events' | 'uiRoot' | 'testMode'>;

function hasVisibleChild(group: THREE.Object3D): boolean {
  if (!group.visible) return false;
  for (const c of group.children) if (c.visible) return true;
  return false;
}

export function createVision(ctx: BootCtx): VisionApi {
  const composer = new EffectComposer(ctx.renderer, { frameBufferType: THREE.HalfFloatType });
  const renderPass = new RenderPass(ctx.scene, ctx.camera);
  const dichoptic = new DichopticPass(ctx.camera);

  // One group per layer, so setLayerVisible never touches the objects' own `visible` flags.
  const weakGroup = new THREE.Group();
  weakGroup.name = 'Vision.WeakOnly';
  const strongGroup = new THREE.Group();
  strongGroup.name = 'Vision.StrongOnly';
  dichoptic.weakScene.add(weakGroup);
  dichoptic.strongScene.add(strongGroup);
  const registered = new Map<THREE.Object3D, VisionLayer>();

  let worldPasses: Pass[] = [];
  const rebuild = (): void => {
    composer.removeAllPasses();
    composer.addPass(renderPass);
    for (const p of worldPasses) composer.addPass(p);
    composer.addPass(dichoptic);
    for (const p of composer.passes) p.renderToScreen = p === dichoptic;
  };
  rebuild();

  const applyEye = (): void => {
    const eye = ctx.settings.get().eye;
    dichoptic.setEye(eye, deriveChannels(eye));
  };
  applyEye();
  const offSettings = ctx.events.on('settings:changed', applyEye);

  let calibration: CalibrationHandle | null = null;

  const api: VisionApi = {
    add(object, layer) {
      if (registered.has(object)) api.remove(object);
      registered.set(object, layer);
      if (layer === VisionLayer.Both) {
        ctx.scene.add(object);
        return;
      }
      object.traverse((o) => {
        o.castShadow = false;
        o.receiveShadow = false;
      });
      (layer === VisionLayer.WeakOnly ? weakGroup : strongGroup).add(object);
    },
    remove(object) {
      if (!registered.delete(object)) return;
      object.removeFromParent();
    },
    channels: () => deriveChannels(ctx.settings.get().eye),
    setPostPasses(passes) {
      worldPasses = passes.filter((p) => p !== dichoptic && p !== renderPass);
      rebuild();
    },
    setSize(width, height, pixelRatio) {
      ctx.renderer.setPixelRatio(pixelRatio);
      composer.setSize(width, height, false);
    },
    render(dt) {
      glowTime.value += dt;
      if (calibration) {
        dichoptic.renderPattern(ctx.renderer);
        return;
      }
      dichoptic.layersActive.weak = hasVisibleChild(weakGroup);
      dichoptic.layersActive.strong = hasVisibleChild(strongGroup);
      composer.render(dt);
    },
    setLayerVisible(layer, visible) {
      if (layer === VisionLayer.WeakOnly) weakGroup.visible = visible;
      else if (layer === VisionLayer.StrongOnly) strongGroup.visible = visible;
      else for (const [o, l] of registered) if (l === VisionLayer.Both) o.visible = visible;
    },
    openCalibration(onClose) {
      if (calibration) calibration.close();
      (ctx as Partial<GameContext>).input?.releasePointer();
      calibration = openCalibrationOverlay(ctx, () => {
        calibration = null;
        onClose();
      });
    },
    dispose() {
      calibration?.close();
      offSettings();
      composer.dispose();
      if (ctx.testMode) delete window.__rgVision;
    },
  };

  if (ctx.testMode) installTestHooks(ctx, api, () => calibration !== null);
  return api;
}
