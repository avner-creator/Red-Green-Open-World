import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CONTROL_MAP, ON_FOOT_BINDINGS, padLabel } from '../../src/ui/controlMap';
import type { ControlId } from '../../src/ui/controlMap';
import { GAMEPAD_GLYPH } from '../../src/ui/glyphs';

const src = readFileSync('src/core/input.ts', 'utf8');

const PAD_LETTER: Record<string, string> = { a: 'A', b: 'B', x: 'X', y: 'Y', start: 'START', lt: 'LT', rt: 'RT', ls: 'L3', lb: 'LB', up: '↑' };
const KEY_LABEL: Record<string, string> = { Space: '␣', KeyE: 'E', KeyF: 'F', KeyR: 'R', Escape: 'Esc', KeyQ: 'Q', KeyC: 'C' };
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
      if (code === 'KeyP' || code === 'KeyG') continue; // aliases of Escape / C
      expect(CONTROL_MAP[ACTION_CONTROL[action]].keys[0]).toContain(KEY_LABEL[code]);
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
    expect(CONTROL_MAP.skill.touch).toBeTruthy(); // touch Skill and Emote buttons exist
    expect(CONTROL_MAP.emote.touch).toBe('sparkle');
  });
});

describe('no shared bindings', () => {
  it('no two on-foot actions share a key or a gamepad button', () => {
    const keys = new Map<string, string>();
    const pads = new Map<number, string>();
    for (const b of ON_FOOT_BINDINGS) {
      for (const k of b.keys) {
        expect(keys.get(k), `${k}: ${b.action} vs ${keys.get(k)}`).toBeUndefined();
        keys.set(k, b.action);
      }
      for (const p of b.pad) {
        expect(pads.get(p), `pad ${p}: ${b.action} vs ${pads.get(p)}`).toBeUndefined();
        pads.set(p, b.action);
      }
    }
  });

  it('the table matches the code that reads each shortcut', () => {
    const read = (f: string): string => readFileSync(f, 'utf8');
    const bind = (a: string): { keys: readonly string[]; pad: readonly number[] } => ON_FOOT_BINDINGS.find((b) => b.action === a)!;
    expect(read('src/ui/radio.ts')).toContain(`RADIO_PAD_BUTTON = ${bind('radio').pad[0]}`);
    expect(read('src/ui/radio.ts')).toContain(`'${bind('radio').keys[0]}'`);
    expect(read('src/ui/index.ts')).toContain(`buttons[${bind('wardrobe').pad[0]}]`);
    expect(read('src/ui/index.ts')).toContain(`'${bind('wardrobe').keys[0]}'`);
    expect(read('src/ui/funPass.ts')).toContain(`buttons[${bind('pass').pad[0]}]`);
    expect(read('src/ui/controlsCard.ts')).toContain(`buttons[${bind('help').pad[0]}]`);
    expect(read('src/buddy/index.ts')).toContain(`buttons[${bind('buddy').pad[0]}]`);
    expect(padLabel('wardrobe')).toBe('←');
    expect(padLabel('radio')).toBe('RB');
    expect(CONTROL_MAP.wardrobe.keys[0]).toEqual(['I']);
    expect(CONTROL_MAP.radio.keys[0]).toEqual(['M']);
  });
});

describe('help card icons', () => {
  it('rows shown together on the on-foot card have distinct icons (sprint is not the skill bolt)', () => {
    const foot: ControlId[] = ['move', 'look', 'jump', 'sprint', 'air', 'use', 'skill', 'emote', 'respawn'];
    const icons = foot.map((id) => CONTROL_MAP[id].icon);
    expect(new Set(icons).size).toBe(icons.length);
    expect(CONTROL_MAP.sprint.icon).toBe('wRun');
  });
});
