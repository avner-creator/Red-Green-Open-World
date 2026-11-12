/**
 * Reset hint for free rides (QA7 M1): after an unstick hop a round "reset" button pulses at the
 * right edge for a few seconds, with the key cap (R / Y; none on touch, where a tap on it resets).
 * Wordless; white arrow on navy with a yellow cap and black outlines, so it reads in the R-only and
 * G-only channels alike.
 */

const CSS = `
.rg-ride-reset{all:unset;position:absolute;right:max(12px,3vmin);top:50%;transform:translateY(-50%) scale(.6);opacity:0;
  width:max(48px,10vmin);height:max(48px,10vmin);border-radius:50%;background:#2b3557;border:.55vmin solid #000;
  box-shadow:0 0 0 .5vmin #fff,0 .7vmin 0 .5vmin #000;display:grid;place-items:center;cursor:pointer;
  transition:opacity .25s,transform .25s;pointer-events:none;touch-action:none}
.rg-ride-reset.on{opacity:1;transform:translateY(-50%) scale(1);pointer-events:auto;animation:rg-ride-reset 1s ease-in-out infinite}
.rg-ride-reset svg{width:62%;height:62%;color:#fff}
.rg-ride-reset .key{position:absolute;right:-1.2vmin;top:-1.2vmin;min-width:3.6vmin;height:3.6vmin;padding:0 .4vmin;border-radius:1vmin;
  background:#ffd93b;color:#15110a;border:.4vmin solid #000;display:grid;place-items:center;font:700 2.6vmin system-ui,sans-serif}
.rg-ride-reset .key:empty{display:none}
@keyframes rg-ride-reset{0%,100%{transform:translateY(-50%) scale(1)}50%{transform:translateY(-50%) scale(1.12)}}
`;

export interface ResetHint {
  /** Show for `seconds` (restarts the timer). */
  show(seconds: number): void;
  hide(): void;
  /** Per frame: count down, key cap for the current device. */
  update(dt: number, device: 'keyboard' | 'gamepad' | 'touch'): void;
  readonly visible: boolean;
  dispose(): void;
}

export function createResetHint(root: HTMLElement | null, onTap: () => void): ResetHint {
  let left = 0;
  let el: HTMLButtonElement | null = null;
  let key: HTMLSpanElement | null = null;
  let style: HTMLStyleElement | null = null;
  if (root && typeof document !== 'undefined') {
    style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    el = document.createElement('button');
    el.className = 'rg-ride-reset';
    el.dataset.testid = 'ride-reset';
    el.setAttribute('aria-label', 'reset');
    el.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 3v5h5"/></svg><span class="key">R</span>';
    key = el.querySelector('.key');
    el.addEventListener('pointerdown', (e) => {
      if (left <= 0) return;
      e.preventDefault();
      e.stopPropagation();
      onTap();
    });
    root.appendChild(el);
  }
  const set = (on: boolean): void => {
    el?.classList.toggle('on', on);
  };
  return {
    show(seconds) {
      left = Math.max(left, seconds);
      set(true);
    },
    hide() {
      left = 0;
      set(false);
    },
    update(dt, device) {
      if (left <= 0) return;
      left -= dt;
      if (key) {
        const k = device === 'gamepad' ? 'Y' : device === 'touch' ? '' : 'R';
        if (key.textContent !== k) key.textContent = k;
      }
      if (left <= 0) set(false);
    },
    get visible() {
      return left > 0;
    },
    dispose() {
      el?.remove();
      style?.remove();
    },
  };
}
