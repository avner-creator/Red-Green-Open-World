/**
 * The ONE table of control glyphs (pure data). It mirrors what `src/core/input.ts` really reads:
 * keyboard Space/E/F/R/Esc, WASD/arrows, Shift; gamepad A jump, X use, B flop, Y respawn,
 * Start pause, RT or left-stick click (L3) sprint, left stick move, right stick look, RT/LT drive.
 * Tutorial, mode hints, interaction prompt and controls card all read from here.
 * `tests/ui/controlMap.test.ts` checks this table against input.ts so it cannot drift.
 */
import type { UiIconName } from './icons';
import type { PictoName } from './wayIcons';

export type Device = 'keyboard' | 'gamepad' | 'touch';

/** On-screen touch control for a control: a button's icon, 'jump' (the jump button), or null (none). */
export type TouchGlyph = UiIconName | 'jump' | null;

export type ControlId =
  | 'move' | 'look' | 'jump' | 'sprint' | 'use' | 'flop' | 'respawn' | 'pause' | 'air'
  | 'steer' | 'drive' | 'hop' | 'slide' | 'horn' | 'exit' | 'chute' | 'skill' | 'emote';

export interface ControlDef {
  /** Clusters shown side by side for one press. */
  keys: string[][];
  pad: string[][];
  /** What the touch HUD shows for it (`src/ui/touch`): stick, look drag (hand) or a button icon. */
  touch: TouchGlyph;
  icon: PictoName;
}

/**
 * Labels: single characters are key caps, `MOUSE` is the mouse pictogram. Several clusters in one
 * array mean "either one" (shown with a slash), e.g. sprint is RT or L3 on a gamepad.
 */
export const CONTROL_MAP: Record<ControlId, ControlDef> = {
  move: { keys: [['W', 'A', 'S', 'D']], pad: [['L']], touch: 'stick', icon: 'stick' },
  look: { keys: [['MOUSE']], pad: [['R']], touch: 'hand', icon: 'eye' },
  jump: { keys: [['␣']], pad: [['A']], touch: 'jump', icon: 'trampoline' },
  sprint: { keys: [['⇧']], pad: [['RT'], ['L3']], touch: 'bolt', icon: 'wRun' },
  use: { keys: [['E']], pad: [['X']], touch: 'hand', icon: 'hand' },
  flop: { keys: [['F']], pad: [['B']], touch: 'flop', icon: 'flop' },
  respawn: { keys: [['R']], pad: [['Y']], touch: null, icon: 'restart' },
  // Character skill (hold for glide / bounce charge) and signature emote; LB and D-pad up.
  // On touch: the Skill button (shows the character's skill icon) and the Emote button.
  skill: { keys: [['Q']], pad: [['LB']], touch: 'bolt', icon: 'bolt' },
  emote: { keys: [['C']], pad: [['↑']], touch: 'sparkle', icon: 'sparkle' },
  pause: { keys: [['Esc']], pad: [['START']], touch: 'pause', icon: 'pause' },
  // In the air, the move keys flip and spin.
  air: { keys: [['W', 'A', 'S', 'D']], pad: [['L']], touch: 'stick', icon: 'wAir' },
  steer: { keys: [['A', 'D']], pad: [['L']], touch: 'stick', icon: 'car' },
  drive: { keys: [['W', 'S']], pad: [['RT', 'LT']], touch: 'stick', icon: 'bolt' },
  // Buggy hop; hold it while steering for a power-slide.
  hop: { keys: [['␣']], pad: [['A']], touch: 'jump', icon: 'trampoline' },
  slide: { keys: [['␣', 'A', 'D']], pad: [['A', 'L']], touch: 'jump', icon: 'wSlide' },
  horn: { keys: [['F']], pad: [['B']], touch: 'speaker', icon: 'speaker' },
  exit: { keys: [['E']], pad: [['X']], touch: 'exit', icon: 'exit' },
  chute: { keys: [['␣']], pad: [['A']], touch: 'jump', icon: 'parachute' },
};

/** First gamepad label of a control, e.g. padLabel('use') === 'X'. */
export function padLabel(id: ControlId): string {
  return CONTROL_MAP[id].pad[0][0];
}
