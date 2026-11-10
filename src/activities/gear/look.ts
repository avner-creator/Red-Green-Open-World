/**
 * Pure logic for "make the player and buggy match the profile": what is worn, what changed.
 */
import type { EquipSlot } from '../../types';

export type WornSlot = 'head' | 'back' | 'face';
export const WORN_SLOTS: readonly WornSlot[] = ['head', 'back', 'face'];

export interface Look {
  head: string | null;
  back: string | null;
  face: string | null;
  carColor: string | null;
}

export type LookSlot = keyof Look;

export interface LookChange {
  slot: LookSlot;
  from: string | null;
  to: string | null;
}

export const LOOK_SLOTS: readonly LookSlot[] = ['head', 'back', 'face', 'carColor'];

export function isLookSlot(slot: EquipSlot): slot is LookSlot {
  return (LOOK_SLOTS as readonly string[]).includes(slot);
}

export function readLook(profile: { equipped(slot: EquipSlot): string | null }): Look {
  return {
    head: profile.equipped('head'),
    back: profile.equipped('back'),
    face: profile.equipped('face'),
    carColor: profile.equipped('carColor'),
  };
}

export function emptyLook(): Look {
  return { head: null, back: null, face: null, carColor: null };
}

/** What has to change to go from `current` to `wanted` (slots that already match are left out). */
export function lookChanges(current: Look, wanted: Look): LookChange[] {
  const out: LookChange[] = [];
  for (const slot of LOOK_SLOTS) {
    if (current[slot] !== wanted[slot]) out.push({ slot, from: current[slot], to: wanted[slot] });
  }
  return out;
}
