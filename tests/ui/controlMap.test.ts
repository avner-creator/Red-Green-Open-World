import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONTROL_MAP, padLabel } from '../../src/ui/controlMap';
import type { ControlId } from '../../src/ui/controlMap';
import { GAMEPAD_GLYPH } from '../../src/ui/glyphs';

const src = readFileSync('src/core/input.ts', 'utf8');

const PAD_LETTER: Record<string, string> = { a: 'A', b: 'B', x: 'X', y: 'Y', start: 'START', lt: 'LT', rt: 'RT', ls: 'L3', lb: 'LB', up: '↑' };
const KEY_LABEL: Record<string, string> = { Space: '␣', KeyE: 'E', KeyF: 'F', KeyR: 'R', Escape: 'Esc', KeyQ: 'Q', KeyC: 'C', KeyG: 'G' };
const ACTION_CONTROL: Record<string, ControlId> = { jump: 'jump', use: 'use', flop: 'flop', respawn: 'respawn', pause: 'pause', skill: 'skill', emote: 'emote' };

describe('control glyph table vs src/core/input.ts', () => {
  it('covers every gamepad edge action with the right button', () => {
    const edges = [...src.matchAll(/edge\(PAD\.(\w+),\s*'(\w+)'\)/g)];
    expect(edges.length).toBeGreaterThanOrEqual(5);
    for (const [, btn, action] of edges) {
      const id = ACTION_CONTROL[action];
      expect(id, `action ${action} has a control`).toBeDefined();
      expect(padLabel(id)).toBe(PAD_LETTER[btn]);
    }
  });

  it('covers every keyboard action with the right key', () => {
    const block = /KEY_ACTIONS[^{]*\{([^}]*)\}/.exec(src)?.[1] ?? '';
    const pairs = [...block.matchAll(/(\w+):\s*'(\w+)'/g)];
    expect(pairs.length).toBeGreaterThanOrEqual(5);
    for (const [, code, action] of pairs) {
      if (code === 'KeyP') continue; // alias of Escape
      expect(CONTROL_MAP[ACTION_CONTROL[action]].keys.flat()).toContain(KEY_LABEL[code]);
    }
  });

  it('sprint is RT or left-stick click (never RB), as read by input.ts', () => {
    expect(src).toMatch(/sprint:\s*btn\(PAD\.rt\)\s*\|\|\s*padSprintLatch/);
    expect(src).toMatch(/PAD\.ls/);
    expect(CONTROL_MAP.sprint.pad.flat()).toEqual(['RT', 'L3']);
    expect(CONTROL_MAP.sprint.pad.flat()).not.toContain('RB');
    expect(GAMEPAD_GLYPH.sprint).toBe('RT');
    expect(CONTROL_MAP.sprint.keys.flat()).toContain('⇧');
  });

  it('drive uses RT/LT and move/look use the sticks', () => {
    expect(CONTROL_MAP.drive.pad.flat()).toEqual(['RT', 'LT']);
    expect(CONTROL_MAP.move.pad.flat()).toEqual(['L']);
    expect(CONTROL_MAP.look.pad.flat()).toEqual(['R']);
  });

  it('every control has glyphs for both devices and an icon', () => {
    for (const [id, d] of Object.entries(CONTROL_MAP)) {
      expect(d.keys.flat().length, id).toBeGreaterThan(0);
      expect(d.pad.flat().length, id).toBeGreaterThan(0);
      expect(d.icon, id).toBeTruthy();
    }
  });
});

describe('touch column', () => {
  it('every control says what the touch HUD shows (or null for none)', () => {
    for (const [id, d] of Object.entries(CONTROL_MAP)) expect('touch' in d, id).toBe(true);
    expect(CONTROL_MAP.move.touch).toBe('stick');
    expect(CONTROL_MAP.jump.touch).toBe('jump');
    expect(CONTROL_MAP.respawn.touch).toBeNull(); // no respawn button on touch
  });
});
