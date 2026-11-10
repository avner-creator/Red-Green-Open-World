/**
 * STUB (orchestrator scaffold). The dichoptic-engineer replaces this whole folder.
 * Keep the exported names and signatures: `createVision`, `deriveChannels`.
 */
import * as THREE from 'three';
import { EffectComposer, EffectPass, RenderPass } from 'postprocessing';
import type { Pass } from 'postprocessing';
import { VisionLayer } from '../types';
import type { ChannelAssignment, EyeSettings, GameContext, VisionApi } from '../types';

/** Red lens passes R, green lens passes G. The weak eye's lens colour is the weak channel. */
export function deriveChannels(eye: EyeSettings): ChannelAssignment {
  const leftChannel = eye.leftLens === 'red' ? 'r' : 'g';
  const rightChannel = leftChannel === 'r' ? 'g' : 'r';
  const weak = eye.weakEye === 'left' ? leftChannel : rightChannel;
  return { weak, strong: weak === 'r' ? 'g' : 'r' };
}

type BootCtx = Pick<GameContext, 'renderer' | 'scene' | 'camera' | 'settings' | 'events' | 'uiRoot' | 'testMode'>;

export function createVision(ctx: BootCtx): VisionApi {
  // Stub: layer objects are simply drawn in the main scene (NOT dichoptic yet).
  const layers = new Map<THREE.Object3D, VisionLayer>();
  const composer = new EffectComposer(ctx.renderer, { frameBufferType: THREE.HalfFloatType });
  const renderPass = new RenderPass(ctx.scene, ctx.camera);
  // Stand-in for the dichoptic compositor: always the LAST pass (copies to the canvas in sRGB).
  const finalPass = new EffectPass(ctx.camera);
  let worldPasses: Pass[] = [];
  const rebuild = (): void => {
    composer.removeAllPasses();
    composer.addPass(renderPass);
    for (const p of worldPasses) composer.addPass(p);
    composer.addPass(finalPass);
  };
  rebuild();
  return {
    add(object, layer) {
      layers.set(object, layer);
      ctx.scene.add(object);
    },
    remove(object) {
      layers.delete(object);
      object.removeFromParent();
    },
    channels: () => deriveChannels(ctx.settings.get().eye),
    setPostPasses(passes) {
      worldPasses = passes;
      rebuild();
    },
    setSize(width, height, pixelRatio) {
      ctx.renderer.setPixelRatio(pixelRatio);
      composer.setSize(width, height, false);
    },
    render(dt) {
      composer.render(dt);
    },
    setLayerVisible(layer, visible) {
      for (const [o, l] of layers) if (l === layer) o.visible = visible;
    },
    openCalibration(onClose) {
      onClose();
    },
    dispose() {
      composer.dispose();
    },
  };
}
