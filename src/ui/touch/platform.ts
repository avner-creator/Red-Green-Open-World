/**
 * Phone/tablet plumbing for touch play: rotate-to-landscape overlay (icon only), visual-viewport
 * resizes, fullscreen + landscape lock on Play where the browser allows it, and audio unlock on
 * the first touch.
 */
import type { TouchControls } from '../../core/input-touch';
import type { GameContext } from '../../types';
import { h } from '../dom';

/** A phone turning from portrait to landscape, with a curved arrow. No text. */
const ROTATE_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
  <path d="M74 22a36 36 0 0 1 8 34" fill="none" stroke="#000" stroke-width="11" stroke-linecap="round"/>
  <path d="M74 22a36 36 0 0 1 8 34" fill="none" stroke="#ffd93b" stroke-width="5.5" stroke-linecap="round"/>
  <path d="M90 50l-8 12-9-11z" fill="#ffd93b" stroke="#000" stroke-width="3" stroke-linejoin="round"/>
  <g class="phone"><rect x="32" y="18" width="36" height="64" rx="7" fill="#1d2346" stroke="#fff" stroke-width="5"/>
  <rect x="38" y="26" width="24" height="44" rx="2.5" fill="#ffd93b" stroke="#000" stroke-width="2"/>
  <circle cx="50" cy="76" r="2.6" fill="#fff"/></g>
</svg>`;

export interface Platform {
  /** Touch device held in portrait: controls hidden, overlay up. */
  readonly portrait: boolean;
  update(): void;
}

type FsElement = HTMLElement & { webkitRequestFullscreen?: () => void };
type FsDocument = Document & { webkitFullscreenElement?: Element | null };
type LockableOrientation = ScreenOrientation & { lock?: (o: string) => Promise<void> };

export function createPlatform(ctx: GameContext, c: TouchControls): Platform {
  const overlay = h('div', 'rotate', { 'data-testid': 'touch-rotate', 'aria-hidden': 'true' });
  overlay.innerHTML = ROTATE_SVG;
  ctx.uiRoot.append(overlay);
  let portrait = false;

  // Visual viewport (address bar, on-screen keyboard, pinch): re-run main's resize next frame.
  const vv = window.visualViewport;
  let resizeQueued = false;
  const onVv = (): void => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      window.dispatchEvent(new Event('resize'));
    });
  };
  vv?.addEventListener('resize', onVv);
  window.addEventListener('orientationchange', onVv);

  // Audio unlock: mobile browsers only start WebAudio inside a touch gesture.
  let unlocked = false;
  const onTouchEnd = (e: PointerEvent): void => {
    if (unlocked || e.pointerType !== 'touch') return;
    unlocked = true;
    ctx.audio.unlock();
  };
  window.addEventListener('pointerup', onTouchEnd, true);

  // Fullscreen + landscape lock when a touch player presses Play / Play again / Resume.
  const goFullscreen = (): void => {
    const d = document as FsDocument;
    if (d.fullscreenElement || d.webkitFullscreenElement) return;
    const el = document.documentElement as FsElement;
    const lock = (): void => {
      const o = screen.orientation as LockableOrientation | undefined;
      o?.lock?.('landscape').catch(() => undefined);
    };
    try {
      if (el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).then(lock, () => undefined);
      else el.webkitRequestFullscreen?.();
    } catch {
      /* not allowed here (iPhone Safari): play in the browser window */
    }
  };
  ctx.uiRoot.addEventListener(
    'click',
    (e) => {
      if (!c.active || ctx.testMode) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest('[data-testid="play"],[data-testid="play-again"],[data-testid="resume"],[data-testid="restart"]')) goFullscreen();
    },
    true,
  );

  return {
    get portrait() {
      return portrait;
    },
    update() {
      const p = c.active && window.innerHeight > window.innerWidth * 1.05;
      if (p === portrait) return;
      portrait = p;
      overlay.classList.toggle('on', p);
      if (p) {
        c.cancelAll();
        if (ctx.session.state.phase === 'playing') ctx.session.pause();
      }
    },
  };
}
