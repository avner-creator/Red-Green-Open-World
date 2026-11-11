/**
 * Radio button + "now playing" chip. Self-contained: mounted into #ui-root by the audio module
 * (see `createAudio`), so no other UI file needs to change.
 *
 * Controls: M = next station (Shift+M = previous), gamepad D-pad left = next, tap the radio button.
 * All shapes read by brightness alone (white pictograms with a black outline on a dark panel),
 * so they are clear through a red or a green lens.
 */
import { getRadio, STATIONS, type StationId } from '../audio/radio';
import { gameplayKeyAllowed } from './gameKeys';

const NS = 'http://www.w3.org/2000/svg';
const CHIP_MS = 2000;
/** Test mode: the software renderer is slow, give assertions time to see the chip. */
const CHIP_MS_TEST = 8000;

/** Pictograms (24x24, same classes as the rest of the UI icons: k black, l line, o outline, w white stroke). */
const ICONS: Record<StationId | 'radio', string> = {
  radio:
    '<path class="o" d="M7 8L18 2"/><path class="w" d="M7 8L18 2"/><rect x="2" y="8" width="20" height="13" rx="3"/><circle class="k" cx="8" cy="14.500" r="3.300"/><path class="l" d="M14 12h5M14 15h5M14 18h5"/>',
  auto: '<path d="M12 2l2.600 6.400L21 11l-6.400 2.600L12 20l-2.600-6.400L3 11l6.400-2.600z"/>',
  trail: '<path d="M2 20L9 7l4 7 3-4 6 10z"/>',
  zoom: '<path d="M13.500 1.500L4 13.500h6l-1.500 9L20 9.500h-6.500z"/>',
  sky: '<path d="M7 19a4.500 4.500 0 0 1-.5-9A6 6 0 0 1 18 9.500 4.500 4.500 0 0 1 17.500 19z"/>',
  rush: '<circle cx="12" cy="13.500" r="8"/><path d="M9 2h6v2.500H9z"/><path class="k" d="M11 8h2v6h-2z"/>',
  carnival:
    '<ellipse cx="12" cy="9" rx="6.500" ry="7.500"/><path d="M10 16h4l-2 3z"/><path class="l" d="M12 19c-2 2 2 3 0 4.500"/>',
  beach: '<circle cx="12" cy="8.500" r="5"/><path d="M2 15q2.500-3 5 0t5 0 5 0 5 0v6H2z"/>',
  disco:
    '<circle cx="12" cy="13.500" r="8"/><path class="l" d="M4 13.500h16M12 5.500v16M6.500 8.500c3 2 8 2 11 0M6.500 18.500c3-2 8-2 11 0"/><path d="M10.500 1h3v3h-3z"/>',
  spooky:
    '<path d="M5 22V11a7 7 0 0 1 14 0v11l-3-2.500-2 2.500-2-2.500-2 2.500-2-2.500z"/><circle class="k" cx="9.500" cy="11" r="1.700"/><circle class="k" cx="14.500" cy="11" r="1.700"/>',
  arcade:
    '<rect x="2" y="7" width="20" height="11" rx="5"/><path class="k" d="M7 10.500h2v1.500h1.500v2H9v1.500H7V14H5.500v-2H7z"/><circle class="k" cx="16" cy="11.500" r="1.300"/><circle class="k" cx="18.500" cy="14.200" r="1.300"/>',
  off: '<path d="M2 9h4l6-5v16l-6-5H2z"/><path class="o" d="M16 8.500l6 7M22 8.500l-6 7"/><path class="w" d="M16 8.500l6 7M22 8.500l-6 7"/>',
};

function iconEl(name: StationId | 'radio'): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = 'ic';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name];
  el.append(svg);
  return el;
}

const CSS = `
.rgr{--u:clamp(6.4px,1.05vmin,24px);position:absolute;right:calc(var(--u)*2.4);top:calc(var(--u)*13.6);display:none;align-items:center;gap:calc(var(--u)*1.2);
  margin-right:env(safe-area-inset-right,0px);margin-top:env(safe-area-inset-top,0px);pointer-events:none;z-index:5;
  font:800 calc(var(--u)*3.6)/1.1 ui-rounded,"Nunito","Trebuchet MS","Segoe UI",system-ui,sans-serif;color:#fff}
#ui-root[data-phase="playing"] .rgr{display:flex}
.rgr .ic{display:inline-block;width:1em;height:1em;flex:none;color:#fff}
.rgr .ic svg{width:100%;height:100%;overflow:visible;fill:currentColor;stroke:#000;stroke-width:1.9;stroke-linejoin:round;stroke-linecap:round;paint-order:stroke fill}
.rgr .ic .k{fill:#000;stroke:none}.rgr .ic .l{fill:none;stroke:#000;stroke-width:1.3}
.rgr .ic .o{fill:none;stroke:#000;stroke-width:5.4}.rgr .ic .w{fill:none;stroke:currentColor;stroke-width:2.6;paint-order:normal}
.rgr-btn{pointer-events:auto;cursor:pointer;display:flex;align-items:center;justify-content:center;font:inherit;font-size:calc(var(--u)*4.6);
  width:max(44px,calc(var(--u)*7));height:max(44px,calc(var(--u)*7));padding:0;color:#fff;-webkit-tap-highlight-color:transparent;
  background:linear-gradient(180deg,#1d2346e6,#0b0f22e6);border:calc(var(--u)*.6) solid #fff;border-radius:calc(var(--u)*2.4);
  box-shadow:0 0 0 calc(var(--u)*.45) #000,0 calc(var(--u)*.8) calc(var(--u)*2) rgba(0,0,0,.5);transition:transform .12s}
.rgr-btn:hover{transform:scale(1.06)}.rgr-btn:active{transform:scale(.94)}
.rgr-btn:focus-visible{outline:calc(var(--u)*.5) solid #ffd93b;outline-offset:calc(var(--u)*.4)}
.rgr-btn.off{opacity:.8}
.rgr-chip{order:-1;display:flex;align-items:center;gap:calc(var(--u)*1.2);padding:calc(var(--u)*.8) calc(var(--u)*2.4) calc(var(--u)*.8) calc(var(--u)*1.4);
  background:linear-gradient(180deg,#2b3360f2,#10142af2);border:calc(var(--u)*.6) solid #fff;border-radius:calc(var(--u)*4);
  box-shadow:0 0 0 calc(var(--u)*.45) #000;opacity:0;transform:translateX(calc(var(--u)*2)) scale(.85);transition:opacity .15s,transform .2s cubic-bezier(.2,1.6,.4,1)}
.rgr-chip.on{opacity:1;transform:none}
.rgr-chip .ic{font-size:1.5em}
.rgr-chip .t{-webkit-text-stroke:calc(var(--u)*.7) #000;paint-order:stroke fill;text-shadow:0 calc(var(--u)*.3) 0 #000;white-space:nowrap}
@media (prefers-reduced-motion:reduce){.rgr-chip,.rgr-btn{transition:none}}
`;

export interface RadioUi {
  destroy(): void;
}

/** Add the radio button, chip and controls to #ui-root (idempotent). */
export function mountRadio(testMode: boolean): RadioUi | null {
  const root = document.getElementById('ui-root');
  if (!root || root.querySelector('.rgr')) return null;
  const radio = getRadio();

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const wrap = document.createElement('div');
  wrap.className = 'rgr';
  const chip = document.createElement('div');
  chip.className = 'rgr-chip';
  chip.dataset.testid = 'radio-chip';
  chip.setAttribute('role', 'status');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'rgr-btn';
  btn.dataset.testid = 'radio-btn';
  btn.setAttribute('aria-label', 'Radio');
  btn.append(iconEl('radio'));
  wrap.append(chip, btn);
  root.append(wrap);

  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const show = (id: StationId): void => {
    const st = STATIONS.find((s) => s.id === id);
    if (!st) return;
    chip.replaceChildren(iconEl(id), Object.assign(document.createElement('span'), { className: 't', textContent: st.name }));
    chip.dataset.station = id;
    chip.classList.add('on');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => chip.classList.remove('on'), testMode ? CHIP_MS_TEST : CHIP_MS);
  };
  const sync = (): void => {
    btn.dataset.station = radio.current;
    btn.classList.toggle('off', radio.current === 'off');
  };
  sync();
  const unsub = radio.subscribe((id) => {
    sync();
    show(id);
  });

  const now = (): number => performance.now() / 1000;
  const phase = (): string => root.dataset.phase ?? '';
  const onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'KeyM' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!gameplayKeyAllowed(e, phase())) return;
    if (e.shiftKey) radio.prev(now());
    else radio.next(now());
  };
  window.addEventListener('keydown', onKey);
  btn.addEventListener('click', () => {
    radio.next(now());
    btn.blur(); // keep the M key working after a tap
  });

  // Gamepad: D-pad left (button 14) = next station.
  let raf = 0;
  let padDown = false;
  const poll = (): void => {
    raf = requestAnimationFrame(poll);
    if (phase() !== 'playing') return;
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    let down = false;
    for (const p of pads) if (p?.buttons[14]?.pressed) down = true;
    if (down && !padDown) radio.next(now());
    padDown = down;
  };
  raf = requestAnimationFrame(poll);

  if (testMode) {
    (window as unknown as { __rgRadio?: unknown }).__rgRadio = {
      current: () => radio.current,
      set: (id: StationId) => radio.set(id, now()),
      next: () => radio.next(now()),
    };
  }

  return {
    destroy() {
      window.removeEventListener('keydown', onKey);
      cancelAnimationFrame(raf);
      clearTimeout(hideTimer);
      unsub();
      wrap.remove();
      style.remove();
    },
  };
}
