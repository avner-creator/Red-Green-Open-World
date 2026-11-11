/**
 * Character select: a lineup over the live 3D world. The focused character is the real player
 * model at the spawn (camera orbits in front of it), does its emote when picked, and each card
 * shows name, one-line backstory, an animated skill pictogram with its key, and price/lock state.
 * Ownership and buying go through `characterAccess.ts` only.
 */
import { CHARACTERS } from '../core/characters/catalog';
import type { CharacterDef } from '../core/characters/catalog';
import type { GameContext } from '../types';
import { getCharacterAccess } from './characterAccess';
import { canStart, cardState, indexOfCharacter, loadPick, preselectId, priceProgress, savePick, stepIndex } from './characterLogic';
import { injectCharacterCss } from './characterSelectCss';
import { controlKeys } from './controlGlyphs';
import { clear, h } from './dom';
import { icon } from './icons';
import type { Screen } from './screens';
import { installExtraPowers } from '../core/skills-extra';
import { choosePower, chosenPower, getPower, powersFor, powerState } from '../core/skills-powers';
import { powerPicto, powerTile } from './characterSelectPowers';
import { skillPicto } from './skillPicto';
import { holdShowcase } from '../core/characters/warm';

/** Hero select camera: close and low so the hero stands about half the screen tall. */
const SELECT_CAMERA = { distance: 4.4, height: 1.25, fov: 44 };

/** The wardrobe ("dress up") entry, plugged in by the wardrobe system; null = not available yet. */
let wardrobeHook: ((heroId: string) => void) | null = null;
export function setWardrobeHook(fn: ((heroId: string) => void) | null): void {
  wardrobeHook = fn;
}

export interface CharacterSelect extends Screen {
  /** Called when another screen replaces this one (or the phase changes): restores the saved pick. */
  leave(): void;
  /** Per frame while shown: refresh key glyphs when the input device changes. */
  update(): void;
}

export interface SelectHooks {
  back(): void;
  /** The chosen character is owned and saved: start (title) or resume (pause). */
  go(): void;
}

/** Put the remembered character into the world (at boot). Unknown ids are ignored. */
export function applyStoredCharacter(ctx: GameContext): void {
  const id = loadPick();
  if (id && id !== ctx.player.characterId) void ctx.player.setCharacter(id);
}

const CONFETTI = ['#ffd93b', '#ffffff', '#ffb02e', '#7fe3ff', '#ff8fc7', '#c8ff7f'];
const CELE_SECONDS = 2.6;

function colors(c: CharacterDef): string {
  return `--c0:${c.cardColors[0]};--c1:${c.cardColors[1]}`;
}

export function createCharacterSelect(ctx: GameContext, hooks: SelectHooks): CharacterSelect {
  injectCharacterCss();
  // Extra super powers (rocket boots, giant…) run beside the player's classic skills.
  try {
    installExtraPowers(ctx);
  } catch (err) {
    console.warn('extra powers unavailable', err);
  }
  let sel = 0;
  let active = false;
  let device: 'keyboard' | 'gamepad' | 'touch' = 'keyboard';
  /** Key glyphs for a control; none on touch (this screen is tapped directly). */
  const keysFor = (id: 'emote' | 'skill'): HTMLElement | null => (device === 'touch' ? null : controlKeys(id, device));
  let celeTimer: ReturnType<typeof setTimeout> | null = null;

  // ── static structure ──
  const back = h('button', 'b d', { type: 'button', 'aria-label': 'Back', 'data-testid': 'csel-back' }, icon('back'));
  back.addEventListener('click', () => hooks.back());
  const walletText = h('span', 't', {}, '0');
  const wallet = h('div', 'cs-pill', { 'data-testid': 'csel-wallet' }, icon('gem'), walletText);
  const top = h('div', 'cs-top', {}, back, wallet);

  const left = h('div', 'cs-card cs-left', { 'data-testid': 'csel-card' });
  const right = h('div', 'cs-card cs-right', { 'data-testid': 'csel-action' });
  const arrow = (dir: -1 | 1): HTMLElement => {
    const el = h('div', `cs-arrow ${dir > 0 ? 'r' : 'l'}`, { 'aria-hidden': 'true', 'data-testid': dir > 0 ? 'csel-next' : 'csel-prev' }, icon('back'));
    el.addEventListener('click', () => select(stepIndex(sel, dir, CHARACTERS.length), true));
    return el;
  };
  const stage = h('div', 'cs-stage', { 'data-testid': 'csel-stage' });
  // Swipe on the hero to browse.
  let swipeX: number | null = null;
  stage.addEventListener('pointerdown', (e) => {
    if (e.target === stage) swipeX = e.clientX;
  });
  stage.addEventListener('pointerup', (e) => {
    if (swipeX === null) return;
    const dx = e.clientX - swipeX;
    swipeX = null;
    if (Math.abs(dx) > 40) select(stepIndex(sel, dx < 0 ? 1 : -1, CHARACTERS.length), true);
  });
  const mid = h('div', 'cs-mid', {}, left, stage, right);

  const chips = CHARACTERS.map((c, i) => {
    const chip = h(
      'button',
      'cs-chip',
      { type: 'button', 'aria-label': c.name, 'data-testid': `csel-${c.id}`, 'data-id': c.id, style: colors(c) },
      skillPicto(c.skill, true),
      h('span', 'nm', {}, c.name.toUpperCase()),
    );
    // A pointer click on a not-yet-selected chip only selects it; Enter / gamepad A on the focused chip chooses.
    let viaPointer = false;
    let wasSel = false;
    chip.addEventListener('pointerdown', () => {
      viaPointer = true;
      wasSel = sel === i;
      select(i, true);
    });
    chip.addEventListener('focus', () => select(i, true));
    chip.addEventListener('click', () => {
      const pointer = viaPointer;
      viaPointer = false;
      if (pointer && !wasSel) return;
      choose();
    });
    return chip;
  });
  const dock = h('div', 'cs-dock', { 'data-testid': 'csel-dock' }, arrow(-1), ...chips, arrow(1));

  const cele = h('div', 'cs-cele', { 'data-testid': 'csel-unlock' });
  const el = h('div', 'screen csel', { 'data-screen': 'characters' }, top, mid, dock, cele);

  // ── actions ──
  const cur = (): CharacterDef => CHARACTERS[sel] as CharacterDef;
  const sfx = (n: 'click' | 'key' | 'fanfare' | 'star'): void => {
    try {
      ctx.audio.play(n);
    } catch {
      /* audio may be locked or missing in tests */
    }
  };

  /** Load the focused model into the world (last request wins), then do its emote. */
  let busy = false;
  let wanted = '';
  const showInWorld = (id: string, emote: boolean): void => {
    wanted = id;
    if (busy) return;
    busy = true;
    void (async () => {
      try {
        while (wanted !== ctx.player.characterId) {
          const target = wanted;
          await ctx.player.setCharacter(target);
          if (ctx.player.characterId !== target) break; // unknown id or load failure: stop retrying
        }
      } catch {
        /* a failed model load leaves the previous character in place */
      } finally {
        busy = false;
      }
      if (emote && active && wanted === ctx.player.characterId) ctx.player.emote();
    })();
  };

  function select(i: number, emote: boolean): void {
    const next = stepIndex(i, 0, CHARACTERS.length);
    if (next === sel) return;
    sel = next;
    refresh(true);
    showInWorld(cur().id, emote);
    sfx('click');
  }

  function choose(): void {
    const c = cur();
    const a = getCharacterAccess();
    const st = cardState(a, c.id);
    if (st === 'owned') go();
    else if (st === 'buy') buy();
  }

  function go(): void {
    const c = cur();
    if (!canStart(getCharacterAccess(), c.id)) return;
    savePick(c.id);
    // The world already shows it; make sure (a fast Go must not start as the previous hero).
    if (ctx.player.characterId !== c.id) void ctx.player.setCharacter(c.id);
    hooks.go();
  }

  function buy(): void {
    const c = cur();
    const a = getCharacterAccess();
    if (!a.canAfford(c.id) || !a.buy(c.id)) return;
    refresh(false);
    celebrate(c);
    showInWorld(c.id, true);
    (el.querySelector('[data-testid="csel-go"]') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  function celebrate(c: CharacterDef): void {
    clear(cele);
    cele.append(h('div', 'confetti', {}, ...Array.from({ length: 40 }, (_, n) => h('i', '', { style: `--x:${(n * 37) % 100}%;--c:${CONFETTI[n % CONFETTI.length]};--t:${2 + (n % 5) * 0.4}s;--dl:${-((n * 0.37) % 3)}s` }))));
    cele.append(
      h('div', 'big', {}, icon('sparkle'), icon('star'), icon('sparkle')),
      h('div', 'nm', { style: colors(c) }, c.name.toUpperCase()),
    );
    cele.classList.remove('on');
    void cele.offsetWidth;
    cele.classList.add('on');
    if (celeTimer) clearTimeout(celeTimer);
    celeTimer = setTimeout(() => cele.classList.remove('on'), CELE_SECONDS * 1000);
    sfx('fanfare');
  }

  // ── rendering ──
  function refresh(animate: boolean): void {
    const c = cur();
    const a = getCharacterAccess();
    const st = cardState(a, c.id);
    walletText.textContent = String(a.wallet());
    chips.forEach((chip, i) => {
      const def = CHARACTERS[i] as CharacterDef;
      const owned = a.owns(def.id);
      chip.classList.toggle('sel', i === sel);
      chip.classList.toggle('locked', !owned);
      chip.setAttribute('aria-pressed', String(i === sel));
      chip.dataset.owned = String(owned);
      const had = chip.querySelector('.lk');
      if (!owned && !had) chip.append(h('span', 'lk', {}, icon('lock')));
      if (owned && had) had.remove();
    });

    // left card: name, backstory, emote
    left.setAttribute('style', colors(c));
    left.dataset.id = c.id;
    const emoteBtn = h('button', 'b d cs-emote', { type: 'button', 'aria-label': 'Emote', 'data-testid': 'csel-emote' }, icon('sparkle'), keysFor('emote'));
    emoteBtn.addEventListener('click', () => ctx.player.emote());
    // Dress-up entry: the wardrobe system plugs in with `setWardrobeHook`.
    const wardBtn = h(
      'button',
      'b d cs-ward',
      { type: 'button', 'aria-label': 'Dress up', 'data-testid': 'csel-wardrobe', 'data-ready': String(!!wardrobeHook) },
      icon('backpack'),
    );
    wardBtn.addEventListener('click', () => {
      if (wardrobeHook) wardrobeHook(c.id);
      else {
        wardBtn.classList.remove('pop');
        void wardBtn.offsetWidth;
        wardBtn.classList.add('pop');
      }
    });
    clear(left);
    left.append(
      h('div', 'cs-name', { 'data-testid': 'csel-name' }, c.name.toUpperCase()),
      h('div', 'cs-bar'),
      h('div', 'cs-story', { 'data-testid': 'csel-story' }, c.backstory),
      h('div', 'cs-row', {}, emoteBtn, wardBtn),
    );

    // right card: skill + key + action
    right.setAttribute('style', colors(c));
    right.dataset.state = st;
    clear(right);
    const act = h('div', 'cs-act');
    if (st === 'owned') {
      const goBtn = h('button', 'b cs-go', { type: 'button', 'aria-label': 'Go', 'data-testid': 'csel-go' }, h('span', 'glow'), icon('play'), 'GO');
      goBtn.addEventListener('click', () => go());
      act.append(goBtn);
    } else if (st === 'buy') {
      const get = h('button', 'b cs-go buy', { type: 'button', 'aria-label': 'Get', 'data-testid': 'csel-buy' }, icon('gem'), String(c.price));
      get.addEventListener('click', () => buy());
      act.append(get);
    } else {
      act.append(
        h(
          'div',
          'cs-need',
          { 'data-testid': 'csel-locked' },
          h('div', 'pr t', {}, icon('lock'), icon('gem', 'y'), String(c.price)),
          h('div', 'cs-meter', {}, h('i', '', { style: `--p:${Math.round(priceProgress(a.wallet(), c.price) * 100)}%` })),
          h('div', 'cs-hunt', {}, icon('eye'), icon('gem')),
        ),
      );
    }
    // Super power: the chosen one big, then every power as a tile (one press to pick).
    const chosen = chosenPower(c);
    const lifetime = ctx.profile?.data.lifetimeGems ?? 0;
    const tiles = powersFor(c).map((p) =>
      powerTile(p, powerState(c, p, lifetime), p === chosen, lifetime, p === c.signature, () => {
        if (chosenPower(c) === p) return;
        choosePower(c.id, p);
        sfx('star');
        refresh(false);
        (right.querySelector(`[data-testid="csel-power-${p}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
      }),
    );
    right.append(
      h(
        'div',
        'cs-skill',
        {},
        h('div', 'cs-tile', { 'data-testid': 'csel-skill', 'data-skill': c.skill, 'data-power': chosen }, powerPicto(chosen)),
        h('div', 'cs-skname', {}, getPower(chosen).name.toUpperCase()),
        keysFor('skill'),
      ),
      h('div', 'cs-powers', { 'data-testid': 'csel-powers' }, ...tiles),
      act,
    );
    if (animate) {
      for (const card of [left, right]) {
        card.classList.remove('pop');
        void card.offsetWidth;
        card.classList.add('pop');
      }
    }
  }

  function open(): void {
    const a = getCharacterAccess();
    device = ctx.input.state.device;
    const want = preselectId(a, loadPick());
    sel = indexOfCharacter(want);
    active = true;
    if (ctx.session.state.phase === 'title') {
      // Close and low: the hero fills the middle of the screen.
      ctx.cameraRig.setOverride(SELECT_CAMERA);
    }
    refresh(true);
    showInWorld(cur().id, true);
  }

  function leave(): void {
    if (!active) return;
    active = false;
    if (celeTimer) clearTimeout(celeTimer);
    cele.classList.remove('on');
    ctx.cameraRig.setOverride(null);
    // Back out of a preview: the saved (or default) hero is the one who plays.
    const keep = preselectId(getCharacterAccess(), loadPick());
    if (keep !== ctx.player.characterId) showInWorld(keep, false);
  }

  return {
    el,
    leave,
    update() {
      // Warm showcase light on the hero while the select is open.
      if (active) holdShowcase();
      if (active && ctx.input.state.device !== device) {
        device = ctx.input.state.device;
        refresh(false);
      }
    },
    onShow() {
      open();
      return chips[sel] ?? back;
    },
  };
}
