/**
 * The one place that makes the player and the buggy match the profile. Equipped items persist
 * between sessions, so this runs when the game starts, when something is equipped (shop, wardrobe,
 * chest) and when the profile is reset.
 */
import * as THREE from 'three';
import type { GameContext, VehicleApi } from '../../types';
import { CAR_FALLBACK_COLOR } from '../chests/outfits';
import { paintColor } from './catalog';
import { emptyLook, lookChanges, readLook, WORN_SLOTS } from './look';
import type { Look, WornSlot } from './look';
import { buildGear } from './models';
import type { Wearable } from './models';

const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

interface Worn {
  id: string;
  wearable: Wearable;
  remove: () => void;
  /** 0..1 pop-in progress. */
  pop: number;
}

export interface GearApplier {
  /** Make the player and buggy match the profile. `animate` = pop new items in. */
  sync(animate: boolean): void;
  update(dt: number): void;
  /** Ids on the player per slot (test hook). */
  attached(): Record<WornSlot, string | null>;
  /** Colour hex the first buggy is painted in right now (test hook). */
  carColor(): number | null;
  dispose(): void;
}

export function createApplier(ctx: GameContext): GearApplier {
  const worn = new Map<WornSlot, Worn>();
  let applied: Look = emptyLook();
  const cars = new Map<VehicleApi, number>();

  const take = (slot: WornSlot): void => {
    const w = worn.get(slot);
    if (!w) return;
    w.remove();
    w.wearable.dispose();
    worn.delete(slot);
  };

  const put = (slot: WornSlot, id: string, animate: boolean): void => {
    const wearable = buildGear(id);
    if (!wearable) return;
    const remove = ctx.player.attach(slot, wearable.object);
    const w: Worn = { id, wearable, remove, pop: animate ? 0 : 1 };
    if (animate) wearable.object.scale.setScalar(0.001);
    worn.set(slot, w);
  };

  /** Cars may be created later or replaced: keep every car in the chosen paint (or its own default). */
  const syncCars = (): void => {
    const wanted = paintColor(applied.carColor);
    for (const v of ctx.vehicles.all) {
      if (v.kind !== 'car') continue;
      const def = v.object.userData.defaultColor as THREE.ColorRepresentation | undefined;
      const color = wanted ?? new THREE.Color(def ?? CAR_FALLBACK_COLOR).getHex();
      if (cars.get(v) === color) continue;
      v.setColor(color);
      cars.set(v, color);
    }
  };

  function sync(animate: boolean): void {
    const wanted = readLook(ctx.profile);
    for (const c of lookChanges(applied, wanted)) {
      if (c.slot === 'carColor') continue;
      take(c.slot);
      if (c.to) put(c.slot, c.to, animate);
    }
    applied = wanted;
    syncCars();
  }

  return {
    sync,
    update(dt) {
      const speed = Math.hypot(ctx.player.velocity.x, ctx.player.velocity.z);
      for (const w of worn.values()) {
        if (w.pop < 1) {
          w.pop = Math.min(1, w.pop + dt / 0.5);
          w.wearable.object.scale.setScalar(Math.max(0.001, easeOutBack(w.pop)));
        }
        w.wearable.update?.(dt, speed);
      }
      syncCars();
    },
    attached() {
      const out = { head: null, back: null, face: null } as Record<WornSlot, string | null>;
      for (const s of WORN_SLOTS) out[s] = worn.get(s)?.id ?? null;
      return out;
    },
    carColor() {
      for (const c of cars.values()) return c;
      return null;
    },
    dispose() {
      for (const s of WORN_SLOTS) take(s);
      cars.clear();
    },
  };
}
