/**
 * The "what to press" glyph in Pip's bubble, for the active input device: key caps on keyboard
 * (W A S D cluster, mouse, Space bar, E, Q), pad buttons on a gamepad (from the control map), the
 * on-screen control's pictogram on touch. Lets a child who cannot read see what to do.
 */
import type { ActionGlyph } from '../../buddy/types';
import { CONTROL_MAP } from '../controlMap';
import { h } from '../dom';
import { cap, padButton } from '../glyphs';
import { pictogram } from '../wayIcons';
import type { PictoName } from '../wayIcons';

type Device = 'keyboard' | 'gamepad' | 'touch';

const TOUCH: Record<ActionGlyph, PictoName> = {
  move: 'stick',
  look: 'hand',
  jump: 'wTrampoline',
  use: 'hand',
  skill: 'bolt',
};

export function actionGlyph(a: ActionGlyph, device: Device): HTMLElement {
  const box = h('span', `pipact pipact-${a}`, { 'data-device': device });
  if (device === 'touch') {
    box.append(pictogram(TOUCH[a], 'tch'));
    return box;
  }
  if (device === 'gamepad') {
    if (a === 'move' || a === 'look') box.append(pictogram('stick', 'tch'));
    box.append(padButton(CONTROL_MAP[a].pad[0][0]));
    return box;
  }
  switch (a) {
    case 'move': {
      const top = h('span', 'row', {}, cap('W'));
      const bottom = h('span', 'row', {}, cap('A'), cap('S'), cap('D'));
      box.append(h('span', 'wasd', {}, top, bottom));
      break;
    }
    case 'look':
      box.append(pictogram('mouse', 'tch'));
      break;
    case 'jump':
      box.append(cap('␣', 'space'));
      break;
    default:
      box.append(cap(CONTROL_MAP[a].keys[0][0]));
  }
  return box;
}
