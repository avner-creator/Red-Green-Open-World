/**
 * Calibration screen: a DOM control panel over the bottom of the screen. The test pattern above it
 * is drawn by the real DichopticPass (same maths as the game) in calibration mode.
 *
 * Pattern: five grey columns (black → white). Top row: rings for the WEAK eye only. Bottom row:
 * squares for the STRONG eye only. With the glasses on, each eye alone should see only its shapes;
 * lower strength / crosstalk until the other eye sees nothing.
 *
 * Everything is white/grey on near-black so it reads in the R-only and G-only channels.
 */
import { CALIBRATION_PANEL } from './constants';
import type { EyeSettings, GameContext } from '../types';

type CalibCtx = Pick<GameContext, 'uiRoot' | 'settings' | 'events'>;

const ICONS = {
  eye: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M4 24c5-9 12-14 20-14s15 5 20 14c-5 9-12 14-20 14S9 33 4 24z" fill="none" stroke="currentColor" stroke-width="3.5"/><circle cx="24" cy="24" r="7" fill="currentColor"/></svg>',
  ring: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="16" fill="none" stroke="currentColor" stroke-width="6"/><circle cx="24" cy="24" r="5" fill="currentColor"/></svg>',
  square: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="10" y="10" width="28" height="28" rx="6" fill="currentColor"/></svg>',
  ghost: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="19" cy="24" r="12" fill="currentColor"/><circle cx="30" cy="24" r="12" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="4 3"/></svg>',
  contrast: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="16" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="M24 8a16 16 0 0 1 0 32z" fill="currentColor"/></svg>',
  check: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 25l9 9 19-20" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

function glassesSvg(leftLens: EyeSettings['leftLens']): string {
  const red = '#e8392f';
  const green = '#22b04a';
  const l = leftLens === 'red' ? { fill: red, letter: 'R' } : { fill: green, letter: 'G' };
  const r = leftLens === 'red' ? { fill: green, letter: 'G' } : { fill: red, letter: 'R' };
  const lens = (cx: number, o: { fill: string; letter: string }): string =>
    `<rect x="${cx - 17}" y="10" width="34" height="26" rx="9" fill="${o.fill}" stroke="#fff" stroke-width="3"/>` +
    `<text x="${cx}" y="30" text-anchor="middle" font-size="18" font-weight="800" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${o.letter}</text>`;
  return `<svg viewBox="0 0 96 46" aria-hidden="true">${lens(24, l)}${lens(72, r)}<path d="M41 18h14" stroke="#fff" stroke-width="3"/></svg>`;
}

function weakEyeSvg(weakEye: EyeSettings['weakEye']): string {
  const eye = (cx: number, weak: boolean): string =>
    `<g transform="translate(${cx - 20} 4)">` +
    (weak ? '<rect x="-3" y="-2" width="46" height="40" rx="10" fill="#fff"/>' : '') +
    `<path d="M2 18c5-8 11-12 18-12s13 4 18 12c-5 8-11 12-18 12S7 26 2 18z" fill="none" stroke="${weak ? '#000' : '#fff'}" stroke-width="3"/>` +
    `<circle cx="20" cy="18" r="6" fill="${weak ? '#000' : '#fff'}"/></g>`;
  return `<svg viewBox="0 0 96 46" aria-hidden="true">${eye(24, weakEye === 'left')}${eye(72, weakEye === 'right')}</svg>`;
}

const STYLE = `
.rgv-cal{position:absolute;inset:0;pointer-events:auto;font-family:system-ui,sans-serif;color:#fff;z-index:50}
.rgv-cal *{box-sizing:border-box}
.rgv-tag{position:absolute;left:12px;display:flex;align-items:center;gap:6px;background:#000;border:2px solid #fff;border-radius:999px;padding:2px 10px 2px 6px;font-size:12px;font-weight:700}
.rgv-tag svg{width:20px;height:20px}
.rgv-panel{position:absolute;left:0;right:0;bottom:0;height:${(CALIBRATION_PANEL * 100).toFixed(1)}%;background:#0d0d0d;border-top:3px solid #fff;display:flex;gap:16px;padding:12px 16px;overflow:auto}
.rgv-col{display:flex;flex-direction:column;gap:10px;justify-content:center}
.rgv-sliders{flex:1;min-width:0}
.rgv-row{display:flex;align-items:center;gap:12px}
.rgv-row svg{width:36px;height:36px;flex:none}
.rgv-row label{font-size:13px;font-weight:700;width:96px;flex:none;line-height:1.1}
.rgv-row output{font-size:16px;font-weight:800;width:52px;text-align:right;flex:none;font-variant-numeric:tabular-nums}
.rgv-cal input[type=range]{flex:1;min-width:80px;height:34px;appearance:none;-webkit-appearance:none;background:transparent;cursor:pointer}
.rgv-cal input[type=range]::-webkit-slider-runnable-track{height:10px;border-radius:5px;background:#6a6a6a;border:2px solid #fff}
.rgv-cal input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:30px;height:30px;margin-top:-12px;border-radius:50%;background:#fff;border:4px solid #000;box-shadow:0 0 0 2px #fff}
.rgv-cal input[type=range]::-moz-range-track{height:10px;border-radius:5px;background:#6a6a6a;border:2px solid #fff}
.rgv-cal input[type=range]::-moz-range-thumb{width:26px;height:26px;border-radius:50%;background:#fff;border:4px solid #000}
.rgv-btn{display:flex;align-items:center;gap:8px;background:#000;color:#fff;border:3px solid #fff;border-radius:14px;padding:6px 10px;font-size:13px;font-weight:800;cursor:pointer;min-height:48px}
.rgv-btn svg{width:76px;height:36px}
.rgv-btn:hover{background:#333}
.rgv-cal :focus-visible{outline:4px dashed #fff;outline-offset:3px}
.rgv-done{background:#fff;color:#000;justify-content:center}
.rgv-done svg{width:40px;height:40px}
.rgv-hint{font-size:12px;opacity:.9;max-width:190px;line-height:1.25}
@media (max-width:700px){.rgv-hint{display:none}}
@media (max-height:560px){
.rgv-panel{padding:6px 12px;gap:10px}.rgv-col{gap:4px}
.rgv-row svg{width:24px;height:24px}.rgv-row label{font-size:11px;width:84px}.rgv-row output{font-size:13px}
.rgv-cal input[type=range]{height:28px}
.rgv-cal input[type=range]::-webkit-slider-thumb{width:24px;height:24px;margin-top:-9px}
.rgv-btn{min-height:36px;padding:2px 8px;font-size:12px}.rgv-btn svg{width:60px;height:28px}.rgv-done svg{width:32px;height:32px}}
`;

interface SliderDef {
  key: 'weakStrength' | 'crosstalkLimit' | 'strongContrast';
  icon: string;
  label: string;
  min: number;
  max: number;
}

const SLIDERS: SliderDef[] = [
  { key: 'weakStrength', icon: ICONS.ring, label: 'Gem glow', min: 0, max: 100 },
  { key: 'crosstalkLimit', icon: ICONS.ghost, label: 'Ghosting guard', min: 5, max: 100 },
  { key: 'strongContrast', icon: ICONS.contrast, label: 'Other-eye dimmer', min: 40, max: 100 },
];

export interface CalibrationHandle {
  close(): void;
}

/** Build and show the calibration overlay. `onClosed` runs once when it closes. */
export function openCalibrationOverlay(ctx: CalibCtx, onClosed: () => void): CalibrationHandle {
  const root = document.createElement('div');
  root.className = 'rgv-cal';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Glasses calibration');
  const style = document.createElement('style');
  style.textContent = STYLE;
  root.appendChild(style);

  // Row tags next to the pattern rows (top row: weak-eye rings, bottom row: strong-eye squares).
  const patternH = 1 - CALIBRATION_PANEL;
  const tag = (topFrac: number, icon: string, text: string): void => {
    const t = document.createElement('div');
    t.className = 'rgv-tag';
    t.style.top = `calc(${(topFrac * 100).toFixed(1)}% + 3px)`;
    t.innerHTML = `${ICONS.eye}${icon}<span>${text}</span>`;
    root.appendChild(t);
  };
  tag(0, ICONS.ring, 'Gem eye');
  tag(patternH * 0.5, ICONS.square, 'Strong eye');

  const panel = document.createElement('div');
  panel.className = 'rgv-panel';
  root.appendChild(panel);

  // Left column: lens + weak-eye toggles.
  const toggles = document.createElement('div');
  toggles.className = 'rgv-col';
  const lensBtn = document.createElement('button');
  lensBtn.type = 'button';
  lensBtn.className = 'rgv-btn';
  const eyeBtn = document.createElement('button');
  eyeBtn.type = 'button';
  eyeBtn.className = 'rgv-btn';
  toggles.append(lensBtn, eyeBtn);
  panel.appendChild(toggles);

  // Middle: sliders.
  const sliders = document.createElement('div');
  sliders.className = 'rgv-col rgv-sliders';
  const inputs = new Map<SliderDef['key'], { input: HTMLInputElement; out: HTMLOutputElement }>();
  for (const s of SLIDERS) {
    const row = document.createElement('div');
    row.className = 'rgv-row';
    const id = `rgv-${s.key}`;
    row.innerHTML = `${s.icon}<label for="${id}">${s.label}</label>`;
    const input = document.createElement('input');
    input.type = 'range';
    input.id = id;
    input.min = String(s.min);
    input.max = String(s.max);
    input.step = '1';
    const out = document.createElement('output');
    out.htmlFor.add(id);
    input.addEventListener('input', () => {
      ctx.settings.set({ eye: { [s.key]: Number(input.value) / 100 } });
    });
    row.append(input, out);
    sliders.appendChild(row);
    inputs.set(s.key, { input, out });
  }
  panel.appendChild(sliders);

  // Right: hint + done.
  const right = document.createElement('div');
  right.className = 'rgv-col';
  const hint = document.createElement('div');
  hint.className = 'rgv-hint';
  hint.textContent = 'Glasses on. Cover one eye at a time: each eye should see only its own shapes.';
  const done = document.createElement('button');
  done.type = 'button';
  done.className = 'rgv-btn rgv-done';
  done.setAttribute('aria-label', 'Done');
  done.innerHTML = ICONS.check;
  right.append(hint, done);
  panel.appendChild(right);

  const sync = (): void => {
    const eye = ctx.settings.get().eye;
    lensBtn.innerHTML = `${glassesSvg(eye.leftLens)}<span>Left lens</span>`;
    lensBtn.setAttribute('aria-label', `Left lens: ${eye.leftLens}. Press to swap.`);
    eyeBtn.innerHTML = `${weakEyeSvg(eye.weakEye)}<span>Gem eye</span>`;
    eyeBtn.setAttribute('aria-label', `Gem eye: ${eye.weakEye}. Press to swap.`);
    for (const s of SLIDERS) {
      const el = inputs.get(s.key);
      if (!el) continue;
      const v = Math.round(eye[s.key] * 100);
      if (document.activeElement !== el.input) el.input.value = String(v);
      el.out.textContent = `${v}%`;
    }
  };
  lensBtn.addEventListener('click', () => {
    ctx.settings.set({ eye: { leftLens: ctx.settings.get().eye.leftLens === 'red' ? 'green' : 'red' } });
  });
  eyeBtn.addEventListener('click', () => {
    ctx.settings.set({ eye: { weakEye: ctx.settings.get().eye.weakEye === 'left' ? 'right' : 'left' } });
  });
  const offSettings = ctx.events.on('settings:changed', sync);
  sync();

  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    offSettings();
    document.removeEventListener('keydown', onDocKey);
    root.remove();
    onClosed();
  };
  const onDocKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  // Keys typed inside the panel must not drive the game.
  const swallow = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && e.type === 'keydown') {
      e.preventDefault();
      close();
    }
    e.stopPropagation();
  };
  root.addEventListener('keydown', swallow);
  root.addEventListener('keyup', swallow);
  document.addEventListener('keydown', onDocKey);
  done.addEventListener('click', close);

  ctx.uiRoot.appendChild(root);
  lensBtn.focus();
  return { close };
}
