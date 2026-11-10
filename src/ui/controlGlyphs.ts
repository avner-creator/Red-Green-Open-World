/** Key-cap / gamepad glyph groups for each control, shared by the controls card and hint strips. */
import { h } from './dom';
import { cap, padButton } from './glyphs';
import { icon } from './icons';
import type { UiIconName } from './icons';

export type Device = 'keyboard' | 'gamepad';

export type ControlId =
  | 'move' | 'look' | 'jump' | 'sprint' | 'use' | 'flop' | 'respawn'
  | 'steer' | 'drive' | 'hop' | 'horn' | 'exit' | 'chute';

interface Def {
  keys: string[][];
  pad: string[][];
  icon: UiIconName;
}

/** Each inner array is a cluster shown side by side; `+` separates alternatives. */
const DEFS: Record<ControlId, Def> = {
  move: { keys: [['W', 'A', 'S', 'D']], pad: [['L']], icon: 'stick' },
  look: { keys: [['MOUSE']], pad: [['R']], icon: 'eye' },
  jump: { keys: [['␣']], pad: [['A']], icon: 'trampoline' },
  sprint: { keys: [['⇧']], pad: [['RT']], icon: 'bolt' },
  use: { keys: [['E']], pad: [['X']], icon: 'hand' },
  flop: { keys: [['F']], pad: [['B']], icon: 'flop' },
  respawn: { keys: [['R']], pad: [['Y']], icon: 'restart' },
  steer: { keys: [['A', 'D']], pad: [['L']], icon: 'car' },
  drive: { keys: [['W', 'S']], pad: [['RT', 'LT']], icon: 'bolt' },
  hop: { keys: [['␣']], pad: [['A']], icon: 'trampoline' },
  horn: { keys: [['F']], pad: [['B']], icon: 'speaker' },
  exit: { keys: [['E']], pad: [['X']], icon: 'exit' },
  chute: { keys: [['␣']], pad: [['A']], icon: 'parachute' },
};

export function controlIcon(id: ControlId): UiIconName {
  return DEFS[id].icon;
}

/** The glyphs for one control on the given device. */
export function controlKeys(id: ControlId, device: Device, press = false): HTMLElement {
  const d = DEFS[id];
  const wrap = h('span', 'keys');
  const groups = device === 'gamepad' ? d.pad : d.keys;
  groups.forEach((g) => {
    g.forEach((label, i) => {
      if (label === 'MOUSE') {
        wrap.append(icon('mouse'));
        return;
      }
      const wide = label === '␣' || label === '⇧' ? ' wide' : '';
      const p = press ? ` press d${i % 4}` : '';
      wrap.append(device === 'gamepad' ? padButton(label, p.trim()) : cap(label, `${wide}${p}`.trim()));
    });
  });
  return wrap;
}

/** A row: glyphs on the left, pictogram on the right. */
export function controlRow(id: ControlId, device: Device, press = false): HTMLElement {
  return h('div', 'wf-row', { 'data-control': id }, controlKeys(id, device, press), icon(controlIcon(id)));
}
