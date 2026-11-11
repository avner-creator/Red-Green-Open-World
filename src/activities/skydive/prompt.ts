/**
 * Wordless action prompt (DOM, both-eye): a big icon (jump / parachute), the Space bar (or the
 * gamepad A button) and a countdown ring for the automatic action. Bright on dark, outlined, so it
 * reads in R-only and G-only.
 */

export type PromptKind = 'jump' | 'chute' | 'board';
/** Which button to draw: a boolean is the old `gamepad` flag (true = gamepad, false = keyboard). */
export type PromptDevice = 'keyboard' | 'gamepad' | 'touch' | boolean;

export interface ActionPrompt {
  /**
   * Show the prompt. `label` (e.g. a countdown number) replaces the button picture. The keyboard
   * key is Space for jump / chute and E for board; gamepad A; touch a tapping finger.
   */
  show(kind: PromptKind, device: PromptDevice, progress: number | null, label?: string): void;
  hide(): void;
  dispose(): void;
}

const ICONS: Record<PromptKind, string> = {
  // A little diver leaping out and down.
  jump:
    '<circle cx="15.5" cy="4.5" r="2.6"/><path d="M13 8.5l-5 3.5 1.3 1.8 3.4-2.2.6 4.2-4.6 4.6 1.7 1.7 5.4-5.2 2.6 3.2 1.9-1.4-3-4.2-.4-3.8 3.6 1.4.8-2.1z"/><path class="w" d="M4 3v7M1.8 7.8L4 10.2l2.2-2.4"/>',
  // A balloon with an up arrow beside it.
  board:
    '<path d="M9 2.5c-3.6 0-6 2.7-6 6 0 3.2 3.3 6.4 5 8h2c1.7-1.6 5-4.8 5-8 0-3.3-2.4-6-6-6z"/><path class="l" d="M8 16.5l.3 2.4M10 16.5l-.3 2.4"/><rect x="7" y="18.6" width="4" height="3" rx=".6"/><path d="M19 3l3.6 4.4h-2.3V14h-2.6V7.4h-2.3z"/>',
  chute:
    '<path d="M2 11a10 9 0 0 1 20 0 3 3 0 0 0-5-1.500 3 3 0 0 0-5 0 3 3 0 0 0-5 0A3 3 0 0 0 2 11z"/><path class="l" d="M5 11l6.500 8M19 11l-6.500 8M12 10v9"/><circle cx="12" cy="20.500" r="2.300"/>',
};

const CSS = `
.rg-sky-prompt{position:absolute;left:50%;bottom:6%;transform:translateX(-50%);display:flex;align-items:center;gap:2.2vmin;
  pointer-events:none;opacity:0;transition:opacity .2s;filter:drop-shadow(0 .6vmin 0 #000)}
.rg-sky-prompt.on{opacity:1;animation:rg-sky-bob .7s ease-in-out infinite alternate}
.rg-sky-prompt.big.on{animation:rg-sky-pulse .5s ease-in-out infinite alternate}
.rg-sky-prompt.big .ico{width:15vmin;height:15vmin}
.rg-sky-prompt .key.num{min-width:9vmin;font-size:6.4vmin;border-radius:50%;background:linear-gradient(180deg,#fff,#ffe97a)}
.rg-sky-prompt .key svg{width:5.4vmin;height:5.4vmin;fill:#15110a}
.rg-sky-prompt .ico{width:11vmin;height:11vmin;border-radius:50%;background:#10142a;border:.7vmin solid #fff;display:grid;place-items:center;position:relative}
.rg-sky-prompt .ico svg{width:72%;height:72%;fill:#ffd93b;stroke:#000;stroke-width:1.4;stroke-linejoin:round;paint-order:stroke fill;overflow:visible}
.rg-sky-prompt .ico svg .l{fill:none;stroke:#000;stroke-width:1.2}
.rg-sky-prompt .ico svg .w{fill:none;stroke:#fff;stroke-width:1.8;stroke-linecap:round}
.rg-sky-prompt .ring{position:absolute;inset:-1.6vmin;width:calc(100% + 3.2vmin);height:calc(100% + 3.2vmin);transform:rotate(-90deg)}
.rg-sky-prompt .ring circle{fill:none;stroke:#fff;stroke-width:5;stroke-linecap:round}
.rg-sky-prompt .key{height:7.5vmin;min-width:22vmin;border-radius:1.8vmin;background:linear-gradient(180deg,#ffe97a,#ffd93b 55%,#f2b400);
  border:.6vmin solid #000;box-shadow:0 0 0 .45vmin #fff,0 1.1vmin 0 .45vmin #000;display:grid;place-items:center;
  font:900 4.6vmin/1 ui-rounded,"Nunito","Trebuchet MS",system-ui,sans-serif;color:#15110a}
.rg-sky-prompt .key.pad{min-width:7.5vmin;border-radius:50%}
.rg-sky-prompt .key .bar{width:13vmin;height:1.6vmin;border:.5vmin solid #15110a;border-top:none;border-radius:0 0 .6vmin .6vmin;margin-top:1.4vmin}
@keyframes rg-sky-bob{to{transform:translateX(-50%) translateY(-1vmin) scale(1.04)}}
@keyframes rg-sky-pulse{from{transform:translateX(-50%) scale(1)}to{transform:translateX(-50%) translateY(-1.2vmin) scale(1.16)}}
`;

export function createActionPrompt(root: HTMLElement): ActionPrompt {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.className = 'rg-sky-prompt';
  el.setAttribute('data-testid', 'skydive-prompt');
  el.innerHTML =
    '<div class="ico"><svg class="glyph" viewBox="0 0 24 24" aria-hidden="true"></svg>' +
    '<svg class="ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" pathLength="100" stroke-dasharray="100" stroke-dashoffset="0"/></svg></div>' +
    '<div class="key"><div class="bar"></div></div>';
  root.appendChild(el);
  const glyph = el.querySelector('.glyph') as SVGElement;
  const ring = el.querySelector('.ring') as SVGElement;
  const ringCircle = el.querySelector('.ring circle') as SVGCircleElement;
  const key = el.querySelector('.key') as HTMLElement;
  let shownKind: PromptKind | null = null;
  let shownKey = '';
  const TAP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11V4.5a1.5 1.5 0 0 1 3 0V10l5.2 1.1c1 .2 1.6 1.1 1.5 2.1l-.8 6.3c-.1.9-.9 1.5-1.8 1.5H11c-.6 0-1.1-.3-1.4-.8L6 15c-.6-.8 0-2 1-2 .4 0 .8.2 1.1.5z"/></svg>';

  return {
    show(kind, device, progress, label) {
      if (kind !== shownKind) {
        glyph.innerHTML = ICONS[kind];
        shownKind = kind;
        el.classList.toggle('big', kind === 'chute');
        el.setAttribute('data-kind', kind);
      }
      const dev = device === true ? 'gamepad' : device === false ? 'keyboard' : device;
      const want = label !== undefined ? `n:${label}` : `${dev}:${kind === 'board' ? 'E' : 'space'}`;
      if (want !== shownKey) {
        shownKey = want;
        key.classList.toggle('pad', label === undefined && dev === 'gamepad');
        key.classList.toggle('num', label !== undefined);
        if (label !== undefined) key.textContent = label;
        else if (dev === 'gamepad') key.textContent = 'A';
        else if (dev === 'touch') key.innerHTML = TAP;
        else if (kind === 'board') key.textContent = 'E';
        else key.innerHTML = '<div class="bar"></div>';
      }
      ring.style.display = progress === null ? 'none' : '';
      if (progress !== null) ringCircle.setAttribute('stroke-dashoffset', String(Math.round(Math.max(0, Math.min(1, progress)) * 100)));
      el.classList.add('on');
    },
    hide() {
      el.classList.remove('on');
    },
    dispose() {
      el.remove();
      style.remove();
    },
  };
}
