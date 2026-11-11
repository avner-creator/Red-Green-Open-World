/**
 * Shader pre-warm: nothing compiled the world's materials ahead of time, so every material's
 * first appearance on screen (a new attraction, the buggy, an effect) compiled its program in the
 * middle of play: a visible hitch on real GPUs (tens to hundreds of ms per program on ANGLE/D3D).
 * While the title screen is up, one hidden warm-up frame builds every program the scene needs
 * (one longer title frame instead of hitches in play). No download. Skipped under automation (SwiftShader compiles on the main thread and would slow e2e)
 * unless the URL has `&prewarm=1`.
 */
import type * as THREE from 'three';
import type { GameContext } from '../types';

export function prewarmShaders(ctx: GameContext): void {
  const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const automated = typeof navigator !== 'undefined' && navigator.webdriver === true;
  if (automated && params.get('prewarm') !== '1') return;
  const run = (): void => {
    if (ctx.session.state.phase !== 'title') return;
    const t = performance.now();
    // One full composited frame with everything shown and no frustum culling compiles the exact
    // program variants the game uses (render-target colour space, shadow depth, vision layers);
    // `compileAsync` alone only built ~70% of them. A second normal frame follows in the same task,
    // so the warm-up frame is never presented.
    const hidden: THREE.Object3D[] = [];
    const culled: THREE.Object3D[] = [];
    ctx.scene.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
      if (o.frustumCulled) {
        culled.push(o);
        o.frustumCulled = false;
      }
    });
    try {
      ctx.vision.render(0);
    } catch {
      /* warm-up only */
    } finally {
      for (const o of hidden) o.visible = false;
      for (const o of culled) o.frustumCulled = true;
    }
    ctx.vision.render(0);
    if (ctx.testMode) (window as unknown as { __rgPrewarmMs?: number }).__rgPrewarmMs = Math.round(performance.now() - t);
  };
  // After the first title frames: the world and streamed stand-ins are in the scene by then.
  setTimeout(run, 1500);
}
