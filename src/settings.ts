import { DEFAULT_SETTINGS, SESSION, SETTINGS_KEY } from './config';
import type { DeepPartial, EventBus, GameSettings, SettingsApi } from './types';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

export function sanitizeSettings(input: DeepPartial<GameSettings> | undefined, base: GameSettings = DEFAULT_SETTINGS): GameSettings {
  const eyeIn = input?.eye ?? {};
  const b = base.eye;
  const autoChallenge = typeof input?.autoChallenge === 'boolean' ? input.autoChallenge : typeof base.autoChallenge === 'boolean' ? base.autoChallenge : undefined;
  return {
    eye: {
      leftLens: eyeIn.leftLens === 'red' || eyeIn.leftLens === 'green' ? eyeIn.leftLens : b.leftLens,
      weakEye: eyeIn.weakEye === 'left' || eyeIn.weakEye === 'right' ? eyeIn.weakEye : b.weakEye,
      weakStrength: clamp(eyeIn.weakStrength ?? b.weakStrength, 0, 1),
      crosstalkLimit: clamp(eyeIn.crosstalkLimit ?? b.crosstalkLimit, 0.05, 1),
      strongContrast: clamp(eyeIn.strongContrast ?? b.strongContrast, 0.4, 1),
    },
    sessionMinutes: Math.round(clamp(input?.sessionMinutes ?? base.sessionMinutes, SESSION.minMinutes, SESSION.maxMinutes)),
    volumeMaster: clamp(input?.volumeMaster ?? base.volumeMaster, 0, 1),
    volumeMusic: clamp(input?.volumeMusic ?? base.volumeMusic, 0, 1),
    volumeSfx: clamp(input?.volumeSfx ?? base.volumeSfx, 0, 1),
    quality: input?.quality === 'low' || input?.quality === 'medium' || input?.quality === 'high' ? input.quality : base.quality,
    ...(autoChallenge === undefined ? {} : { autoChallenge }),
  };
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function safeStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function createSettings(events: EventBus, storage: StorageLike | null = safeStorage()): SettingsApi {
  let current = DEFAULT_SETTINGS;
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    if (raw) current = sanitizeSettings(JSON.parse(raw) as DeepPartial<GameSettings>);
  } catch {
    current = DEFAULT_SETTINGS;
  }
  const save = (): void => {
    try {
      storage?.setItem(SETTINGS_KEY, JSON.stringify(current));
    } catch {
      /* private mode / quota: settings just don't persist */
    }
  };
  return {
    get: () => current,
    set(patch) {
      current = sanitizeSettings({ ...patch, eye: { ...current.eye, ...(patch.eye ?? {}) } }, current);
      save();
      events.emit('settings:changed', { settings: current });
    },
    reset() {
      current = DEFAULT_SETTINGS;
      try {
        storage?.removeItem(SETTINGS_KEY);
      } catch {
        /* ignore */
      }
      events.emit('settings:changed', { settings: current });
    },
  };
}
