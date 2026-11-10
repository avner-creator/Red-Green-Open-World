/**
 * STUB (orchestrator scaffold). The ui-designer replaces this whole folder.
 * Keep the exported name and signature: `createUi`.
 */
import type { GameContext, UiApi } from '../types';

export function createUi(ctx: GameContext): UiApi {
  const play = document.createElement('button');
  play.textContent = '▶';
  play.setAttribute('aria-label', 'Play');
  play.dataset.testid = 'play';
  play.style.cssText =
    'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);font-size:64px;padding:16px 40px;' +
    'border-radius:24px;border:4px solid #000;background:#ffe24a;cursor:pointer;pointer-events:auto;';
  play.onclick = () => {
    ctx.audio.unlock();
    ctx.session.start();
  };
  ctx.uiRoot.appendChild(play);
  ctx.events.on('session:phase', (e) => {
    play.style.display = e.phase === 'title' ? 'block' : 'none';
  });
  return { update() {}, menuOpen: false };
}
