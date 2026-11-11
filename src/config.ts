/** Game-wide constants. Only the orchestrator edits this file. */
import type { GameSettings } from './types';

export const DEFAULT_SETTINGS: GameSettings = {
  eye: { leftLens: 'red', weakEye: 'left', weakStrength: 1, crosstalkLimit: 1, strongContrast: 1 },
  sessionMinutes: 5,
  volumeMaster: 0.8,
  volumeMusic: 0.5,
  volumeSfx: 0.9,
  voicePip: 1,
  quality: 'medium',
};

export const SETTINGS_KEY = 'rgow.settings.v1';
/** The remembered character pick (written by the character select, read by the player at boot). */
export const CHARACTER_KEY = 'rgow.character.v1';

export const WORLD = {
  size: 400,
  waterLevel: 0,
} as const;

export const PLAYER = {
  walkSpeed: 6.5,
  sprintSpeed: 11,
  jumpSpeed: 7.8,
  gravity: 22,
  height: 1.7,
  radius: 0.35,
} as const;

export const CAMERA = { distance: 5.5, height: 2.2, fov: 60, near: 0.1, far: 1500 } as const;

export const FIXED_DT = 1 / 60;
export const MAX_FRAME_DT = 1 / 20;

export const SESSION = { minMinutes: 3, maxMinutes: 15, tickInterval: 0.25 } as const;

export const GEMS = { pickupRadius: 1.6, nearRadius: 12 } as const;

export const BALLOON = { topHeight: 180, ascentSeconds: 10, autoChuteHeight: 40 } as const;

export const PROFILE_KEY = 'rgow.profile.v1';
export const ECONOMY = {
  gemValue: 1,
  megaGemValue: 5,
  comboWindow: 3, // seconds between pickups that keep a streak alive
  comboMax: 5, // ×5 cap
  respawnSeconds: 45,
  balloonTicket: 5,
  rocketPadTicket: 3,
  attractionTicket: 3, // after each attraction's first (free) play per session
  freeBalloonRides: 1, // per session
  missionsPerSession: 3,
  jackpot: 15, // bonus for finishing all three missions
} as const;
