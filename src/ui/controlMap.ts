/**
 * The ONE table of control glyphs (pure data). It mirrors what `src/core/input.ts` really reads:
 * keyboard Space/E/F/R/Esc, WASD/arrows, Shift; gamepad A jump, X use, B flop, Y respawn,
 * Start pause, RT or left-stick click (L3) sprint, left stick move, right stick look, RT/LT drive.
 * Tutorial, mode hints, interaction prompt and controls card all read from here.
 * `tests/ui/controlMap.test.ts` checks this table against input.ts so it cannot drift.
 */
import type { PictoName } from './wayIcons';

export type Device = 'keyboard' | 'gamepad';

export type ControlId =
  | 'move' | 'look' | 'jump' | 'sprint' | 'use' | 'flop' | 'respawn' | 'pause' | 'air'
  | 'steer' | 'drive' | 'hop' | 'slide' | 'horn' | 'exit' | 'chute' | 'skill' | 'emote';

export interface ControlDef {
  /** Clusters shown side by side for one press. */
  keys: string[][];
  pad: string[][];
  icon: PictoName;
}

/**
 * Labels: single characters are key caps, `MOUSE` is the mouse pictogram. Several clusters in one
 * array mean "either one" (shown with a slash), e.g. sprint is RT or L3 on a gamepad.
 */
export const CONTROL_MAP: Record<ControlId, ControlDef> = {
  move: { keys: [['W', 'A', 'S', 'D']], pad: [['L']], icon: 'stick' },
  look: { keys: [['MOUSE']], pad: [['R']], icon: 'eye' },
  jump: { keys: [['␣']], pad: [['A']], icon: 'trampoline' },
  sprint: { keys: [['⇧']], pad: [['RT'], ['L3']], icon: 'bolt' },
  use: { keys: [['E']], pad: [['X']], icon: 'hand' },
  flop: { keys: [['F']], pad: [['B']], icon: 'flop' },
  respawn: { keys: [['R']], pad: [['Y']], icon: 'restart' },
  // Character skill (hold for glide / bounce charge) and signature emote; LB and D-pad up.
  skill: { keys: [['Q']], pad: [['LB']], icon: 'bolt' },
  emote: { keys: [['C']], pad: [['↑']], icon: 'sparkle' },
  pause: { keys: [['Esc']], pad: [['START']], icon: 'pause' },
  // In the air, the move keys flip and spin.
  air: { keys: [['W', 'A', 'S', 'D']], pad: [['L']], icon: 'wAir' },
  steer: { keys: [['A', 'D']], pad: [['L']], icon: 'car' },
  drive: { keys: [['W', 'S']], pad: [['RT', 'LT']], icon: 'bolt' },
  // Buggy hop; hold it while steering for a power-slide.
  hop: { keys: [['␣']], pad: [['A']], icon: 'trampoline' },
  slide: { keys: [['␣', 'A', 'D']], pad: [['A', 'L']], icon: 'wSlide' },
  horn: { keys: [['F']], pad: [['B']], icon: 'speaker' },
  exit: { keys: [['E']], pad: [['X']], icon: 'exit' },
  chute: { keys: [['␣']], pad: [['A']], icon: 'parachute' },
};

/** First gamepad label of a control, e.g. padLabel('use') === 'X'. */
export function padLabel(id: ControlId): string {
  return CONTROL_MAP[id].pad[0][0];
}
