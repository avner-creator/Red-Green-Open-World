/** Grown-up settings panel (opened after the gate). */
import { SESSION } from '../config';
import type { GameContext, Quality } from '../types';
import { h } from './dom';
import { icon } from './icons';
import type { UiIconName } from './icons';
import type { Screen } from './screens';

export interface SettingsScreen extends Screen {
  refresh(): void;
}

interface SliderOpts {
  ic: UiIconName;
  label: string;
  testid: string;
  min: number;
  max: number;
  step: number;
  get(): number;
  set(v: number): void;
  fmt(v: number): string;
}

export function createSettings(ctx: GameContext, o: { onClose(): void; onCalibrate(): void }): SettingsScreen {
  const refreshers: (() => void)[] = [];
  const S = (): ReturnType<typeof ctx.settings.get> => ctx.settings.get();

  const toggle = (label: string, testid: string, content: (HTMLElement | string)[], isOn: () => boolean, onPick: () => void): HTMLButtonElement => {
    const b = h('button', 'b d sm', { type: 'button', 'aria-label': label, 'data-testid': testid, 'aria-pressed': 'false' }, ...content, h('span', 'chk', {}, icon('check')));
    b.addEventListener('click', onPick);
    refreshers.push(() => b.setAttribute('aria-pressed', String(isOn())));
    return b;
  };

  const row = (ic: UiIconName, label: string, sub: string | null, control: HTMLElement): HTMLElement =>
    h('div', 'srow', {}, h('div', 'lab', {}, icon(ic), h('div', '', {}, label, sub ? h('div', 'sub', {}, sub) : null)), control);

  const slider = (s: SliderOpts): HTMLElement => {
    const input = h('input', '', { type: 'range', min: String(s.min), max: String(s.max), step: String(s.step), 'data-testid': s.testid, 'aria-label': s.label });
    const val = h('span', 'val t');
    const sync = (): void => {
      input.value = String(s.get());
      val.textContent = s.fmt(s.get());
      input.style.setProperty('--p', `${((Number(input.value) - s.min) / (s.max - s.min)) * 100}%`);
    };
    input.addEventListener('input', () => {
      s.set(Number(input.value));
      sync();
    });
    refreshers.push(sync);
    return row(s.ic, s.label, null, h('div', 'sl', {}, input, val));
  };
  const pct = (get: () => number, set: (v: number) => void, min: number): Pick<SliderOpts, 'min' | 'max' | 'step' | 'get' | 'set' | 'fmt'> => ({
    min,
    max: 100,
    step: 5,
    get: () => Math.round(get() * 100),
    set: (v) => set(v / 100),
    fmt: (v) => `${v}%`,
  });

  // Lens on the left eye
  const lensBtn = (lens: 'red' | 'green'): HTMLButtonElement => {
    const hue = lens === 'red' ? '#ff5a5a' : '#4cdc6c';
    return toggle(
      lens,
      `lens-${lens}`,
      [h('span', 'swatch', { style: `background:${hue}` }, lens === 'red' ? 'R' : 'G'), lens === 'red' ? 'Red' : 'Green'],
      () => S().eye.leftLens === lens,
      () => ctx.settings.set({ eye: { leftLens: lens } }),
    );
  };
  const eyeBtn = (eye: 'left' | 'right'): HTMLButtonElement =>
    toggle(
      eye,
      `weak-${eye}`,
      [eye === 'left' ? '◀' : '', icon('eye'), eye === 'right' ? '▶' : '', eye === 'left' ? 'Left' : 'Right'],
      () => S().eye.weakEye === eye,
      () => ctx.settings.set({ eye: { weakEye: eye } }),
    );

  const qualityBtn = (q: Quality, ic: UiIconName, label: string): HTMLButtonElement =>
    toggle(label, `quality-${q}`, [icon(ic), label], () => S().quality === q, () => ctx.settings.set({ quality: q }));

  const calibrate = h('button', 'b', { type: 'button', 'data-testid': 'calibrate' }, icon('eye'), 'Calibrate');
  calibrate.addEventListener('click', () => o.onCalibrate());

  let armed = false;
  let armTimer = 0;
  const reset = h('button', 'b d', { type: 'button', 'data-testid': 'reset' }, icon('restart'), 'Reset');
  reset.addEventListener('click', () => {
    if (!armed) {
      armed = true;
      reset.replaceChildren(icon('check'), 'Sure?');
      armTimer = window.setTimeout(disarm, 3000);
    } else {
      ctx.settings.reset();
      disarm();
    }
  });
  function disarm(): void {
    armed = false;
    window.clearTimeout(armTimer);
    reset.replaceChildren(icon('restart'), 'Reset');
  }

  const rows: HTMLElement[] = [
    row('glasses', 'Lens on the left eye', null, h('div', 'choices', {}, lensBtn('red'), lensBtn('green'))),
    row('eye', 'Weaker eye', null, h('div', 'choices', {}, eyeBtn('left'), eyeBtn('right'))),
    slider({ ic: 'gem', label: 'Weak-eye strength', testid: 'weak-strength', ...pct(() => S().eye.weakStrength, (v) => ctx.settings.set({ eye: { weakStrength: v } }), 20) }),
    slider({ ic: 'bolt', label: 'Crosstalk limit', testid: 'crosstalk', ...pct(() => S().eye.crosstalkLimit, (v) => ctx.settings.set({ eye: { crosstalkLimit: v } }), 5) }),
    slider({ ic: 'sun', label: 'Strong-eye contrast', testid: 'strong-contrast', ...pct(() => S().eye.strongContrast, (v) => ctx.settings.set({ eye: { strongContrast: v } }), 40) }),
    row('eye', 'Calibration', null, calibrate),
    slider({
      ic: 'clock',
      label: 'Session length',
      testid: 'session-minutes',
      min: SESSION.minMinutes,
      max: SESSION.maxMinutes,
      step: 1,
      get: () => S().sessionMinutes,
      set: (v) => ctx.settings.set({ sessionMinutes: v }),
      fmt: (v) => `${v} min`,
    }),
    slider({ ic: 'speaker', label: 'Volume', testid: 'vol-master', ...pct(() => S().volumeMaster, (v) => ctx.settings.set({ volumeMaster: v }), 0) }),
    slider({ ic: 'note', label: 'Music', testid: 'vol-music', ...pct(() => S().volumeMusic, (v) => ctx.settings.set({ volumeMusic: v }), 0) }),
    slider({ ic: 'star', label: 'Sound effects', testid: 'vol-sfx', ...pct(() => S().volumeSfx, (v) => ctx.settings.set({ volumeSfx: v }), 0) }),
    row('sparkle', 'Graphics', null, h('div', 'choices', {}, qualityBtn('low', 'bars1', 'Low'), qualityBtn('medium', 'bars2', 'Medium'), qualityBtn('high', 'bars3', 'High'))),
    row('restart', 'Reset all settings', null, reset),
  ];

  const done = h('button', 'b', { type: 'button', 'aria-label': 'Done', 'data-testid': 'settings-done' }, icon('check'), 'Done');
  done.addEventListener('click', o.onClose);
  const panel = h(
    'div',
    'panel settings',
    { 'data-testid': 'settings' },
    h('div', 'bar', {}, h('div', 'head t', {}, icon('gear'), icon('grownup'), 'Grown-up settings'), done),
    h('div', 'scroll', {}, ...rows),
  );
  const el = h('div', 'screen dim', { 'data-screen': 'settings' }, panel);

  const refresh = (): void => refreshers.forEach((f) => f());
  ctx.events.on('settings:changed', refresh);
  refresh();
  return {
    el,
    refresh,
    onShow() {
      refresh();
      disarm();
      (el.querySelector('.scroll') as HTMLElement).scrollTop = 0;
      return el.querySelector<HTMLElement>('[data-testid="lens-red"]');
    },
  };
}
