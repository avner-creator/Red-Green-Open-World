/**
 * The player's saved profile: wallet, owned and equipped items, a few lifetime counters.
 * Saved to localStorage under `PROFILE_KEY` on every change; every storage call is wrapped in
 * try/catch so a blocked or broken storage never breaks the game (the profile then lives in memory).
 */
import { ECONOMY, PROFILE_KEY } from './config';
import type { EquipSlot, EventBus, ProfileApi, ProfileData, UnlockSource, WalletReason } from './types';

export interface ProfileStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface ProfileOptions {
  /** Storage to use (tests pass a fake). Default: `localStorage` if reachable. null = memory only. */
  storage?: ProfileStorage | null;
}

export const EQUIP_SLOTS: readonly EquipSlot[] = [
  'head', 'back', 'face', 'carColor', 'horseColor', 'hand', 'trail', 'emote', 'character', 'power',
];

/** The 'power' slot is not an owned item: per-hero picks as `hero:power` pairs joined by ','. */
const POWER_VALUE = /^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+(,[A-Za-z0-9_-]+:[A-Za-z0-9_-]+)*$/;

/** Ceiling for wallet, lifetime gems and sessions (so the HUD never shows "1e+21"). */
export const PROFILE_MAX_COUNT = 999_999;
/** Most owned item ids kept from storage. */
export const PROFILE_MAX_OWNED = 500;

/** bestCombo is a multiplier: 1 = no combo yet. */
export function freshProfile(): ProfileData {
  return { version: 1, wallet: 0, lifetimeGems: 0, owned: [], equipped: {}, sessions: 0, bestCombo: 1 };
}

/** Finite non-negative integer up to `max` (NaN, Infinity, strings → 0). */
const count = (v: unknown, max = PROFILE_MAX_COUNT): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.floor(v))) : 0;
const comboOf = (v: unknown): number => Math.max(1, count(v, ECONOMY.comboMax));

/** Turn anything loaded from storage into a valid profile (bad or missing data → fresh profile). */
export function sanitizeProfile(input: unknown): ProfileData {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return freshProfile();
  const o = input as Record<string, unknown>;
  if (o.version !== 1) return freshProfile();
  const owned: string[] = [];
  if (Array.isArray(o.owned)) {
    for (const id of o.owned) {
      if (owned.length >= PROFILE_MAX_OWNED) break;
      if (typeof id === 'string' && id.length > 0 && !owned.includes(id)) owned.push(id);
    }
  }
  const equipped: Partial<Record<EquipSlot, string>> = {};
  if (typeof o.equipped === 'object' && o.equipped !== null && !Array.isArray(o.equipped)) {
    const e = o.equipped as Record<string, unknown>;
    for (const slot of EQUIP_SLOTS) {
      const id = e[slot];
      if (typeof id !== 'string') continue;
      if (slot === 'power' ? id.length <= 600 && POWER_VALUE.test(id) : owned.includes(id)) equipped[slot] = id;
    }
  }
  const wallet = count(o.wallet);
  return {
    version: 1,
    wallet,
    lifetimeGems: Math.max(wallet, count(o.lifetimeGems)),
    owned,
    equipped,
    sessions: count(o.sessions),
    bestCombo: comboOf(o.bestCombo),
  };
}

function defaultStorage(): ProfileStorage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function createProfile(events: EventBus, opts: ProfileOptions = {}): ProfileApi {
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;

  let data: ProfileData = freshProfile();
  try {
    const raw = storage?.getItem(PROFILE_KEY);
    if (raw) data = sanitizeProfile(JSON.parse(raw));
  } catch {
    data = freshProfile();
  }

  const save = (): void => {
    try {
      storage?.setItem(PROFILE_KEY, JSON.stringify(data));
    } catch {
      /* storage full or blocked: keep playing from memory */
    }
  };

  const walletChanged = (delta: number, reason: WalletReason): void => {
    save();
    events.emit('wallet:changed', { wallet: data.wallet, delta, reason });
  };

  return {
    get data() {
      return data;
    },
    get wallet() {
      return data.wallet;
    },
    earn(amount, reason) {
      const n = Math.min(count(amount), PROFILE_MAX_COUNT - data.wallet);
      if (n <= 0) return;
      data.wallet += n;
      data.lifetimeGems = Math.min(PROFILE_MAX_COUNT, data.lifetimeGems + n);
      walletChanged(n, reason);
    },
    spend(amount, reason) {
      const n = count(amount);
      if (n > data.wallet) return false;
      if (n === 0) return true;
      data.wallet -= n;
      walletChanged(-n, reason);
      return true;
    },
    owns(itemId) {
      return data.owned.includes(itemId);
    },
    unlock(itemId: string, source: UnlockSource) {
      if (!itemId || data.owned.includes(itemId)) return false;
      data.owned.push(itemId);
      save();
      events.emit('item:unlocked', { itemId, source });
      return true;
    },
    equip(slot, itemId) {
      if (itemId) data.equipped[slot] = itemId;
      else delete data.equipped[slot];
      save();
      events.emit('item:equipped', { slot, itemId: itemId || null });
    },
    equipped(slot) {
      return data.equipped[slot] ?? null;
    },
    noteCombo(multiplier) {
      const m = comboOf(multiplier);
      if (m <= data.bestCombo) return;
      data.bestCombo = m;
      save();
    },
    noteSession() {
      data.sessions = Math.min(PROFILE_MAX_COUNT, data.sessions + 1);
      save();
    },
    reset() {
      const old = data;
      data = freshProfile();
      save();
      events.emit('profile:reset', {});
      events.emit('wallet:changed', { wallet: 0, delta: -old.wallet, reason: 'test' });
      for (const slot of EQUIP_SLOTS) {
        if (old.equipped[slot]) events.emit('item:equipped', { slot, itemId: null });
      }
    },
  };
}
