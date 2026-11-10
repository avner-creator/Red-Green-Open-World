/** Game-wide constants. Only the orchestrator edits this file. */
import type { GameSettings } from './types';

export const DEFAULT_SETTINGS: GameSettings = {
  eye: { leftLens: 'red', weakEye: 'left', weakStrength: 1, crosstalkLimit: 1, strongContrast: 1 },
  sessionMinutes: 5,
  volumeMaster: 0.8,
  volumeMusic: 0.5,
  volumeSfx: 0.9,
  quality: 'medium',
};

export const SETTINGS_KEY = 'rgow.settings.v1';

export const WORLD = {
  size: 400,
  waterLevel: 0,
} as const;

export const PLAYER = {
  walkSpeed: 4.5,
  sprintSpeed: 8.5,
  jumpSpeed: 7.5,
  gravity: 22,
  height: 1.7,
  radius: 0.35,
} as const;

export const CAMERA = { distance: 6.5, height: 2.2, fov: 60, near: 0.1, far: 1500 } as const;

export const FIXED_DT = 1 / 60;
export const MAX_FRAME_DT = 1 / 20;

export const SESSION = { minMinutes: 3, maxMinutes: 15, tickInterval: 0.25 } as const;

export const GEMS = { pickupRadius: 1.6, nearRadius: 12 } as const;

export const TRAMPOLINE = { maxHeight: 40, firstBounce: 6, growth: 1.35 } as const;
export const BALLOON = { topHeight: 180, ascentSeconds: 10, autoChuteHeight: 40 } as const;
