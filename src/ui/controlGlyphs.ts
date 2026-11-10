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

/** Same arrow as the touch HUD's jump button (src/ui/touch). */
const JUMP_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 1.8l9 9.4h-5.4v5.6H8.4v-5.6H3z"/><rect x="5" y="18.6" width="14" height="3.6" rx="1.6"/></svg>';

/** A round touch-button glyph (no key caps on touch); empty when the control has no touch button. */
function touchGlyph(id: ControlId, press: boolean): HTMLElement {
  const wrap = h('span', 'keys');
  const t = CONTROL_MAP[id].touch;
  if (!t) return wrap;
  let ic: HTMLElement;
  if (t === 'jump') {
    ic = h('span', 'ic');
    ic.innerHTML = JUMP_SVG;
  } else {
    ic = icon(t);
  }
  wrap.append(h('span', `gp tb${press ? ' press' : ''}`, {}, ic));
  return wrap;
}

/** The glyphs for one control on the given device. */
export function controlKeys(id: ControlId, device: Device, press = false): HTMLElement {
  if (device === 'touch') return touchGlyph(id, press);
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
