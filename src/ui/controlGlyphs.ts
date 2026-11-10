/** Key-cap / gamepad glyph groups for each control, shared by the controls card and hint strips. */
import { h } from './dom';
import { cap, padButton } from './glyphs';
import { icon } from './icons';
import { CONTROL_MAP } from './controlMap';
import type { ControlId, Device } from './controlMap';
import { pictogram } from './wayIcons';
import type { PictoName } from './wayIcons';

export type { ControlId, Device } from './controlMap';

export function controlIcon(id: ControlId): PictoName {
  return CONTROL_MAP[id].icon;
}

/** The glyphs for one control on the given device. */
export function controlKeys(id: ControlId, device: Device, press = false): HTMLElement {
  const d = CONTROL_MAP[id];
  const wrap = h('span', 'keys');
  const groups = device === 'gamepad' ? d.pad : d.keys;
  groups.forEach((g, gi) => {
    if (gi > 0) wrap.append(h('span', 'sep', {}, '/'));
    g.forEach((label, i) => {
      if (label === 'MOUSE') {
        wrap.append(icon('mouse'));
        return;
      }
      const wide = label === '␣' || label === '⇧' || label === 'Esc' ? ' wide' : '';
      const p = press ? ` press d${i % 4}` : '';
      wrap.append(device === 'gamepad' ? padButton(label, p.trim()) : cap(label, `${wide}${p}`.trim()));
    });
  });
  return wrap;
}

/** A row: glyphs on the left, pictogram on the right. */
export function controlRow(id: ControlId, device: Device, press = false): HTMLElement {
  return h('div', 'wf-row', { 'data-control': id }, controlKeys(id, device, press), pictogram(controlIcon(id)));
}
