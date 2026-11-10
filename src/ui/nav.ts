/** Menu navigation: spatial focus (pure) + keyboard + gamepad controller. */
export type Dir = 'up' | 'down' | 'left' | 'right';
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Index of the best neighbour of `cur` in direction `dir`, or `cur` if none. */
export function pickNext(items: readonly Box[], cur: number, dir: Dir): number {
  const c = items[cur];
  if (!c) return items.length ? 0 : -1;
  const cx = c.x + c.w / 2;
  const cy = c.y + c.h / 2;
  let best = cur;
  let bestScore = Infinity;
  items.forEach((b, i) => {
    if (i === cur) return;
    const dx = b.x + b.w / 2 - cx;
    const dy = b.y + b.h / 2 - cy;
    const primary = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
    const side = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    if (primary <= 1) return;
    if (side > primary * 2.5 + Math.max(c.w, c.h)) return;
    const score = primary + side * 2;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** Cyclic Tab order. */
export function tabNext(count: number, cur: number, back: boolean): number {
  if (count <= 0) return -1;
  if (cur < 0) return back ? count - 1 : 0;
  return (cur + (back ? count - 1 : 1)) % count;
}

const FOCUSABLE = 'button:not([disabled]),input[type="range"]:not([disabled])';

export function focusables(layer: HTMLElement): HTMLElement[] {
  return [...layer.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((e) => e.getClientRects().length > 0);
}

export interface NavHost {
  /** Topmost visible layer, or null when nothing is open. */
  layer(): HTMLElement | null;
  back(): void;
  /** Gamepad Start: resume or similar. */
  start(): void;
  root: HTMLElement;
}

export function moveFocus(layer: HTMLElement, dir: Dir): void {
  const items = focusables(layer);
  if (!items.length) return;
  const idx = items.indexOf(document.activeElement as HTMLElement);
  if (idx < 0) {
    items[0]?.focus();
    return;
  }
  const boxes = items.map((e) => {
    const r = e.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  items[pickNext(boxes, idx, dir)]?.focus();
}

function adjustSlider(el: HTMLInputElement, dir: 1 | -1): void {
  const step = Number(el.step) || 1;
  const max = Number(el.max);
  const min = Number(el.min);
  el.value = String(Math.min(max, Math.max(min, Number(el.value) + dir * step)));
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const isSlider = (e: Element | null): e is HTMLInputElement => e instanceof HTMLInputElement && e.type === 'range';

const KEY_DIRS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

export interface Nav {
  notePhaseChange(): void;
  /** Poll the gamepad for menu navigation. `aHeld` is for hold-to-open. */
  poll(dt: number): { aHeld: boolean };
}

export function createNav(host: NavHost): Nav {
  const setKb = (on: boolean): void => {
    host.root.classList.toggle('nav-kb', on);
  };
  window.addEventListener('pointerdown', () => setKb(false), true);
  // Esc acts on key-up, but only if its key-down also happened while a menu layer was open: the
  // Esc that pauses the game (or closes the calibration overlay, or breaks pointer lock) must not
  // also close the menu that its own key-down opened.
  let escDownInMenu = false;

  window.addEventListener(
    'keydown',
    (ev) => {
      const layer = host.layer();
      if (ev.code === 'Escape' && !ev.repeat) escDownInMenu = !!layer;
      if (!layer) return;
      const dir = KEY_DIRS[ev.code];
      const active = document.activeElement;
      if (ev.code === 'Tab') {
        ev.preventDefault();
        const items = focusables(layer);
        items[tabNext(items.length, items.indexOf(active as HTMLElement), ev.shiftKey)]?.focus();
        setKb(true);
      } else if (dir) {
        ev.preventDefault();
        setKb(true);
        if (isSlider(active) && (dir === 'left' || dir === 'right')) adjustSlider(active, dir === 'right' ? 1 : -1);
        else moveFocus(layer, dir);
      } else if (ev.code === 'Escape') {
        ev.preventDefault();
      } else if (ev.code === 'Enter' || ev.code === 'Space') {
        setKb(true);
      }
    },
    true,
  );
  window.addEventListener(
    'keyup',
    (ev) => {
      // Esc acts on key-up so the same press can't also reach the game's own pause input.
      if (ev.code !== 'Escape') return;
      const act = escDownInMenu;
      escDownInMenu = false;
      if (act && host.layer()) host.back();
    },
    true,
  );

  const prev: boolean[] = [];
  let axisCool = 0;
  let sinceChange = 1;
  const BTN = { a: 0, b: 1, start: 9, up: 12, down: 13, left: 14, right: 15 };
  return {
    notePhaseChange(): void {
      sinceChange = 0;
    },
    poll(dt: number): { aHeld: boolean } {
      sinceChange += dt;
      axisCool -= dt;
      const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
      const pad = [...pads].find((p) => p && p.connected);
      if (!pad) return { aHeld: false };
      const down = (i: number): boolean => !!pad.buttons[i]?.pressed;
      const edge = (i: number): boolean => down(i) && !prev[i];
      const layer = host.layer();
      if (layer) {
        const ax = pad.axes[0] ?? 0;
        const ay = pad.axes[1] ?? 0;
        let dir: Dir | null = null;
        if (edge(BTN.up)) dir = 'up';
        else if (edge(BTN.down)) dir = 'down';
        else if (edge(BTN.left)) dir = 'left';
        else if (edge(BTN.right)) dir = 'right';
        else if (axisCool <= 0 && Math.max(Math.abs(ax), Math.abs(ay)) > 0.6) {
          dir = Math.abs(ax) > Math.abs(ay) ? (ax > 0 ? 'right' : 'left') : ay > 0 ? 'down' : 'up';
          axisCool = 0.25;
        }
        const active = document.activeElement as HTMLElement | null;
        if (dir) {
          setKb(true);
          if (isSlider(active) && (dir === 'left' || dir === 'right')) adjustSlider(active, dir === 'right' ? 1 : -1);
          else moveFocus(layer, dir);
        }
        if (edge(BTN.a) && sinceChange > 0.2 && active && !active.hasAttribute('data-hold') && layer.contains(active)) active.click();
        if (edge(BTN.b) && sinceChange > 0.2) host.back();
        if (edge(BTN.start) && sinceChange > 0.3) host.start();
      }
      for (const i of Object.values(BTN)) prev[i] = down(i);
      return { aHeld: down(BTN.a) };
    },
  };
}
