/**
 * Wordless failure screens: one big icon and one big retry button. They live in the entry chunk,
 * so they still work when a later chunk fails to download. Colours are white and warm yellow on
 * navy: high contrast in the red channel alone and in the green channel alone (red-green glasses).
 */

export type FailureKind = 'webgl' | 'context' | 'load';

const S = 'fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"';

/** A screen: used by both the WebGL and the lost-context icons. */
const SCREEN = `<rect x="14" y="18" width="92" height="62" rx="8" ${S}/><path d="M48 98h24M60 80v18" ${S}/>`;

const ICONS: Record<FailureKind, string> = {
  // A screen with a cube that is crossed out: this device cannot draw 3D.
  webgl: `${SCREEN}<path d="M60 32l16 9v18l-16 9-16-9V41z M44 41l16 9 16-9 M60 50v18" ${S} opacity=".55"/>
    <path d="M86 26l-52 48" stroke="#ffd84a" stroke-width="8" stroke-linecap="round"/>`,
  // A screen with a spinning arrow: the picture is coming back.
  context: `${SCREEN}<g class="rgf-spin"><path d="M74 49a14 14 0 1 1-5-11" ${S} stroke="#ffd84a"/>
    <path d="M70 30v9h-9" ${S} stroke="#ffd84a"/></g>`,
  // A cloud with a crossed arrow: something did not download.
  load: `<path d="M36 82h52a18 18 0 0 0 2-36 26 26 0 0 0-50-6 20 20 0 0 0-4 42z" ${S}/>
    <path d="M62 52v22m-9-9 9 9 9-9" ${S} stroke="#ffd84a"/>
    <path d="M96 92l-14-14m0 14 14-14" stroke="#ffd84a" stroke-width="7" stroke-linecap="round"/>`,
};

const RETRY = `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 15a19 19 0 1 1-16.5 9.5" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/><path d="M20 15.5 22.5 29 8 21z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>`;

const LABEL: Record<FailureKind, string> = {
  webgl: '3D graphics are not available on this device',
  context: 'The picture is coming back',
  load: 'Something did not download',
};

const CSS = `
#rg-fail{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:rgba(8,12,26,.92);
  color:#fff;font-family:system-ui,sans-serif;animation:rgf-in .3s ease-out both}
#rg-fail .rgf-card{display:flex;flex-direction:column;align-items:center;gap:clamp(14px,4vmin,48px)}
#rg-fail .rgf-icon{width:clamp(96px,30vmin,420px);height:auto;filter:drop-shadow(0 6px 18px rgba(0,0,0,.5))}
#rg-fail button{all:unset;cursor:pointer;display:grid;place-items:center;width:clamp(64px,16vmin,200px);
  aspect-ratio:1;border-radius:50%;background:#ffd84a;color:#141a30;box-shadow:0 0 0 6px rgba(255,255,255,.9),0 10px 30px rgba(0,0,0,.5);
  transition:transform .15s}
#rg-fail button:hover,#rg-fail button:focus-visible{transform:scale(1.08)}
#rg-fail button:active{transform:scale(.94)}
#rg-fail button svg{width:58%;height:58%}
#rg-fail .rgf-spin{transform-origin:60px 49px;animation:rgf-spin 1.1s linear infinite}
@keyframes rgf-spin{to{transform:rotate(360deg)}}
@keyframes rgf-in{from{opacity:0}}
@media (prefers-reduced-motion:reduce){#rg-fail .rgf-spin{animation:none}#rg-fail{animation:none}}
`;

export interface FailureScreen {
  readonly kind: FailureKind;
  close(): void;
}

let current: (FailureScreen & { el: HTMLElement }) | null = null;

/**
 * Show a failure screen (replaces any open one). `retry` defaults to reloading the page; a lost
 * context passes `null` until it is clear the context will not come back by itself.
 */
export function showFailure(kind: FailureKind, retry: (() => void) | null = () => location.reload()): FailureScreen {
  current?.close();
  if (!document.getElementById('rg-fail-css')) {
    const style = document.createElement('style');
    style.id = 'rg-fail-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  const el = document.createElement('div');
  el.id = 'rg-fail';
  el.dataset.testid = `fail-${kind}`;
  el.setAttribute('role', 'alertdialog');
  el.setAttribute('aria-label', LABEL[kind]);
  el.innerHTML = `<div class="rgf-card"><svg class="rgf-icon" viewBox="0 0 120 120" aria-hidden="true">${ICONS[kind]}</svg></div>`;
  const card = el.firstElementChild as HTMLElement;
  const addRetry = (fn: () => void): void => {
    if (card.querySelector('button')) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.testid = 'fail-retry';
    btn.setAttribute('aria-label', 'Try again');
    btn.innerHTML = RETRY;
    btn.addEventListener('click', fn);
    card.appendChild(btn);
    btn.focus();
  };
  if (retry) addRetry(retry);
  document.body.appendChild(el);
  const screen = {
    kind,
    el,
    close() {
      el.remove();
      if (current === screen) current = null;
    },
    /** Add the retry button later (lost context that did not come back). */
    allowRetry(fn: () => void = () => location.reload()) {
      addRetry(fn);
    },
  };
  current = screen;
  return screen;
}

/** The lost-context screen gets its retry button only after this long without a restore. */
export const CONTEXT_RETRY_AFTER_MS = 4000;

/** Show the lost-context screen; a retry (reload) button appears if the context stays lost. */
export function showContextLost(): FailureScreen {
  const screen = showFailure('context', null) as FailureScreen & { allowRetry(): void };
  const t = setTimeout(() => screen.allowRetry(), CONTEXT_RETRY_AFTER_MS);
  return {
    kind: 'context',
    close() {
      clearTimeout(t);
      screen.close();
    },
  };
}
