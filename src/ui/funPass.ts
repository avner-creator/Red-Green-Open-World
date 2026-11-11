/**
 * Fun Pass: the stamp card. One stamp slot per attraction on the compass (the six weaker-eye
 * mini-games included) plus a chest; stamps pop in as they are earned and prize milestones pay
 * gems through the profile. Shown as a HUD chip ("next stamp"), a card overlay (Tab / tap / D-pad
 * right; does not pause) and on the end screen. The three session goals (missions) sit on top.
 * Both-eye UI: stamped vs empty reads by brightness and shape (filled disc + check vs dotted ring).
 */
import type { AnchorName, GameContext } from '../types';
import { COMPASS_TARGETS, markerIcon } from './compass';
import { h, retrigger } from './dom';
import { CHEST_STAMP, milestones, modeStamp, nextMilestone, prizeFor, stuntStamp, ticketStamp } from './funPassLogic';
import type { StampId } from './funPassLogic';
import { icon } from './icons';
import { injectFunPassCss } from './funPassCss';
import { gameplayKeyAllowed } from './gameKeys';

/** Pass pictogram: a ticket card with a round stamp on it. */
const PASS_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M2 5.5h20v4a2.5 2.5 0 0 0 0 5v4H2v-4a2.5 2.5 0 0 0 0-5z"/>' +
  '<circle class="k" cx="15" cy="12" r="4.3"/><path d="M15 9.2l.9 1.8 2 .3-1.4 1.4.3 2-1.8-.9-1.8.9.3-2-1.4-1.4 2-.3z" style="stroke:none"/>' +
  '<path class="l" d="M5 9h5M5 12h4M5 15h5"/></svg>';

export function passIcon(cls = ''): HTMLElement {
  const el = h('span', `ic ${cls}`.trim());
  el.innerHTML = PASS_SVG;
  return el;
}

interface Slot {
  id: StampId;
  icon: Parameters<typeof markerIcon>[0] | 'chest';
}

export const PASS_SLOTS: readonly Slot[] = [
  ...COMPASS_TARGETS.filter((t) => t.anchor !== 'gearShack').map((t) => ({ id: t.anchor as string, icon: t.icon })),
  { id: CHEST_STAMP, icon: 'chest' },
];

export interface FunPass {
  /** HUD chip: pass icon, stamp count and the next goal. */
  chip: HTMLElement;
  /** Full-screen card overlay (inside the HUD layer). */
  overlay: HTMLElement;
  readonly open: boolean;
  readonly count: number;
  readonly total: number;
  toggle(): void;
  close(): void;
  /** A fresh card element showing the current stamps (end screen). */
  card(): HTMLElement;
  update(dt: number): void;
}

export interface FunPassHooks {
  /** The three goal (mission) cards, moved into the card. */
  goals: HTMLElement;
}

export function createFunPass(ctx: GameContext, hooks: FunPassHooks): FunPass {
  injectFunPassCss();
  const total = PASS_SLOTS.length;
  const onCard = new Set(PASS_SLOTS.map((s) => s.id));
  const got = new Set<StampId>();
  let paid = 0;
  let open = false;

  // ── HUD chip ──
  const countText = h('span', 't n', {}, '0');
  const nextBox = h('span', 'nx');
  const chip = h(
    'button',
    'passchip',
    { type: 'button', 'aria-label': 'Fun Pass', 'data-testid': 'missions' },
    h('span', 'pi', {}, passIcon()),
    countText,
    nextBox,
  );
  chip.addEventListener('click', () => {
    toggle();
    chip.blur();
  });
  const pops = h('div', 'passpops');

  // ── overlay card ──
  const headCount = h('span', 't cnt', { 'data-testid': 'funpass-count' }, '0');
  const grid = h('div', 'pass-grid');
  const track = h('div', 'pass-track');
  const closeBtn = h('button', 'b pass-close', { type: 'button', 'aria-label': 'Close', 'data-testid': 'funpass-close' }, icon('back'));
  closeBtn.addEventListener('click', () => set(false));
  const panel = h(
    'div',
    'pass-panel',
    {},
    h('div', 'pass-head', {}, passIcon('big'), headCount, h('span', 't of', {}, `/${total}`)),
    hooks.goals,
    track,
    grid,
    closeBtn,
  );
  const overlay = h('div', 'pass-over', { 'data-testid': 'funpass' }, panel);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) set(false);
  });

  const slotEl = (s: Slot, on: boolean, i: number): HTMLElement =>
    h(
      'div',
      `pslot ${on ? 'on' : ''}`.trim(),
      { 'data-stamp': s.id, 'data-on': String(on), style: `--r:${((i * 37) % 17) - 8}deg` },
      s.icon === 'chest' ? icon('chest') : markerIcon(s.icon),
      h('span', 'ok', {}, icon('check')),
    );

  const trackEl = (): HTMLElement => {
    const n = got.size;
    const el = h('div', 'ptrack', {}, h('i', 'fill', { style: `--p:${(n / total) * 100}%` }));
    for (const m of milestones(total)) {
      const reached = n >= m;
      const gems = prizeFor(m - 1, m, total);
      el.append(
        h(
          'span',
          `pm ${reached ? 'on' : ''} ${m === total ? 'grand' : ''}`.trim(),
          { style: `--x:${(m / total) * 100}%`, 'data-at': String(m) },
          icon(m === total ? 'jackpot' : 'chest'),
          h('span', 'g', {}, icon('gem'), h('span', 't', {}, String(gems))),
        ),
      );
    }
    return el;
  };

  const renderCard = (): void => {
    headCount.textContent = String(got.size);
    grid.replaceChildren(...PASS_SLOTS.map((s, i) => slotEl(s, got.has(s.id), i)));
    track.replaceChildren(trackEl());
  };

  const renderChip = (): void => {
    countText.textContent = String(got.size);
    // "Next stamp": the first unfinished goal (icon + progress), else the next prize.
    nextBox.replaceChildren();
    const m = ctx.economy.missions.find((x) => !x.done);
    if (m) {
      nextBox.append(icon(m.icon), h('span', 't', {}, `${Math.min(m.progress, m.target)}/${m.target}`));
    } else {
      const nm = nextMilestone(got.size, total);
      if (nm !== null) nextBox.append(icon('chest'), h('span', 't', {}, String(nm)));
      else nextBox.append(icon('jackpot'));
    }
  };

  const set = (on: boolean): void => {
    open = on;
    overlay.classList.toggle('on', on);
    chip.setAttribute('aria-pressed', String(on));
    if (on) renderCard();
  };
  const toggle = (): void => set(!open);

  const stamp = (id: StampId | null): void => {
    if (!id || !onCard.has(id) || got.has(id)) return;
    if (ctx.session.state.phase !== 'playing') return;
    const before = got.size;
    got.add(id);
    renderChip();
    if (open) renderCard();
    retrigger(chip, 'stamp');
    const slot = PASS_SLOTS.find((s) => s.id === id);
    const pop = h('div', 'passpop', { 'data-testid': 'stamp-pop' }, slot?.icon === 'chest' || !slot ? icon('chest') : markerIcon(slot.icon), h('span', 'ok', {}, icon('check')));
    pops.replaceChildren(pop);
    window.setTimeout(() => pop.remove(), 1800);
    const gems = prizeFor(before, got.size, total);
    try {
      ctx.audio.play(gems > 0 ? 'fanfare' : 'star');
    } catch {
      /* audio may be locked */
    }
    if (gems > 0) {
      paid += gems;
      ctx.profile.earn(gems, 'jackpot');
      const prize = h('div', 'passprize', { 'data-testid': 'pass-prize' }, icon('jackpot'), h('span', 'g', {}, icon('gem'), h('span', 't', {}, `+${gems}`)));
      pops.append(prize);
      window.setTimeout(() => prize.remove(), 2600);
    }
  };

  const where = (id: AnchorName): { x: number; z: number } | null => {
    const a = ctx.world.anchors[id];
    return a ? { x: a.position.x, z: a.position.z } : null;
  };

  ctx.events.on('ticket:paid', (e) => stamp(ticketStamp(e.kind)));
  ctx.events.on('stunt', (e) => {
    const p = ctx.player.position;
    stamp(stuntStamp(e.kind, { x: p.x, z: p.z }, where, (id) => onCard.has(id)));
  });
  ctx.events.on('player:mode', (e) => stamp(modeStamp(e.mode)));
  ctx.events.on('glasses:result', (e) => {
    if (e.hit) stamp(e.mechanic);
  });
  ctx.events.on('chest:opened', () => stamp(CHEST_STAMP));
  ctx.events.on('mission:progress', () => renderChip());
  ctx.events.on('mission:completed', () => renderChip());
  ctx.events.on('session:phase', (e) => {
    if (e.phase === 'playing' && e.previous !== 'paused') {
      got.clear();
      paid = 0;
      renderChip();
    }
    if (e.phase !== 'playing') set(false);
  });

  // Tab (keyboard) / D-pad right (gamepad) toggle the card while playing; Esc closes it.
  window.addEventListener(
    'keydown',
    (e) => {
      if (ctx.session.state.phase !== 'playing') return;
      if (e.code === 'Tab') {
        // Tab is keyboard navigation everywhere else (menus, calibration, form controls).
        if (!gameplayKeyAllowed(e, ctx.session.state.phase)) return;
        e.preventDefault();
        if (!e.repeat) toggle();
      } else if (e.code === 'Escape' && open) {
        e.preventDefault();
        e.stopImmediatePropagation();
        set(false);
      }
    },
    true,
  );
  let padPrev = false;
  renderChip();
  void paid;

  return {
    chip: h('div', 'passwrap', {}, chip, pops),
    overlay,
    get open() {
      return open;
    },
    get count() {
      return got.size;
    },
    total,
    toggle,
    close: () => set(false),
    card() {
      const g = h('div', 'pass-grid mini');
      g.append(...PASS_SLOTS.map((s, i) => slotEl(s, got.has(s.id), i)));
      return h(
        'div',
        'pass-endcard',
        { 'data-testid': 'end-funpass', 'data-count': String(got.size) },
        h('div', 'pass-endrow', {}, h('div', 'pass-endhead', {}, passIcon('big'), h('span', 't', {}, `${got.size}/${total}`)), trackEl()),
        g,
      );
    },
    update() {
      if (ctx.session.state.phase !== 'playing') {
        padPrev = false;
        return;
      }
      const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
      const pad = [...pads].find((x) => x && x.connected);
      const right = !!pad?.buttons[15]?.pressed;
      if (right && !padPrev) toggle();
      padPrev = right;
    },
  };
}
