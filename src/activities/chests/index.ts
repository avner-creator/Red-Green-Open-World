/**
 * Treasure chests with a both-eye lock.
 *
 *  - The KEY floats near each chest and is WeakOnly: the weak eye finds it.
 *  - The LOCK (keyhole plate, symbol ring, arrow) is StrongOnly and sits on one of the chest's four
 *    sides: the strong eye finds the keyhole side. The chest looks the same from every side in the
 *    main scene, so neither eye alone can solve it.
 *  - With the key in hand, pressing E on the keyhole side opens the chest. Any other side only
 *    wobbles and clicks (no penalty).
 *  - Opening gives an outfit (hat, cape, glasses, buggy paint), equips it and pops confetti.
 */
import * as THREE from 'three';
import { VisionLayer } from '../../types';
import type { GameContext, Interactable } from '../../types';
import { segmentSphereHit } from '../gemLogic';
import { Confetti } from './confetti';
import { buildChest, CHEST } from './chestModel';
import type { ChestModel } from './chestModel';
import { buildKey, buildLock } from './lockModel';
import type { KeyModel, LockModel } from './lockModel';
import { CHEST_RULES, ChestLock, Loadout, keyCandidates, keyholeSide, onKeyholeSide, pickKeySpot, rightSymbol, sideDirection } from './logic';
import { OUTFITS, outfitForChest } from './outfits';

export { OUTFITS } from './outfits';

export interface ChestInfo {
  id: string;
  outfitId: string;
  position: [number, number, number];
  yaw: number;
  keyholeSide: number;
  key: [number, number, number];
  keyState: 'ground' | 'carried' | 'used';
  open: boolean;
}

/** Test hook (`window.__rgChests`, only with `?test=1`). */
export interface ChestsTestApi {
  info(): ChestInfo[];
  /** World x,z of a point `dist` metres from chest `i`, straight out from side `side`. */
  sidePoint(i: number, side: number, dist?: number): [number, number];
  /** Closest distance from any chest's key to its chest, and whether each key is on land. */
  setKeyVisible(visible: boolean): void;
}

declare global {
  interface Window {
    __rgChests?: ChestsTestApi;
  }
}

export interface Chests {
  update(dt: number): void;
  dispose(): void;
}

interface Entry {
  index: number;
  id: string;
  outfitId: string;
  spot: { position: THREE.Vector3; yaw: number };
  lock: ChestLock;
  model: ChestModel;
  lockModel: LockModel;
  lockRoot: THREE.Group;
  keyModel: KeyModel;
  keyHome: THREE.Vector3;
  keyPos: THREE.Vector3;
  /** 0..1 lid/treasure animation. */
  openT: number;
  openedFor: number;
  wobble: number;
  /** 0..1 while a used key flies into the lock. */
  keyFly: number;
  placed: boolean;
  offs: (() => void)[];
  collider: { handle: number } | null;
}

const easeOutBack = (t: number): number => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

const UP = new THREE.Vector3(0, 1, 0);

export function createChests(ctx: GameContext): Chests {
  const spots = ctx.world.chestSpots;
  const n = spots.length;
  ctx.session.setTotals({ chests: n });

  const confetti = new Confetti();
  ctx.scene.add(confetti.group);
  const loadout = new Loadout();
  let time = 0;
  let placedAll = false;
  const prev = new THREE.Vector3();
  const cur = new THREE.Vector3();
  let havePrev = false;
  let wasPlaying = false;

  const entries: Entry[] = [];
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();

  for (let i = 0; i < n; i++) {
    const spot = spots[i];
    const side = keyholeSide(i, n);
    const model = buildChest();
    model.group.position.copy(spot.position).y -= 0.02;
    model.group.rotation.y = spot.yaw;
    ctx.scene.add(model.group);

    const lockModel = buildLock(side, rightSymbol(i));
    const lockRoot = lockModel.root;
    lockRoot.position.copy(model.group.position);
    lockRoot.rotation.y = spot.yaw;
    ctx.vision.add(lockRoot, VisionLayer.StrongOnly);

    const keyModel = buildKey(rightSymbol(i));
    keyModel.group.visible = false; // until its spot is validated against the physics world
    ctx.vision.add(keyModel.group, VisionLayer.WeakOnly);

    const q = new THREE.Quaternion().setFromAxisAngle(UP, spot.yaw);
    const collider = ctx.physics.addStaticBox(
      new THREE.Vector3(spot.position.x, spot.position.y + 0.44, spot.position.z),
      new THREE.Vector3(CHEST.width / 2 + 0.01, 0.44, CHEST.depth / 2 + 0.01),
      q,
    );

    const entry: Entry = {
      index: i,
      id: `chest${i}`,
      outfitId: outfitForChest(i).id,
      spot,
      lock: new ChestLock(side),
      model,
      lockModel,
      lockRoot,
      keyModel,
      keyHome: new THREE.Vector3(spot.position.x + 8, spot.position.y + 1.3, spot.position.z),
      keyPos: new THREE.Vector3(),
      openT: 0,
      openedFor: 0,
      wobble: 0,
      keyFly: 0,
      placed: false,
      offs: [],
      collider: { handle: collider.handle },
    };
    entry.keyPos.copy(entry.keyHome);

    const where = (out: THREE.Vector3): THREE.Vector3 => out.set(spot.position.x, spot.position.y + 0.8, spot.position.z);
    const facing = (): boolean =>
      onKeyholeSide(spot.position.x, spot.position.z, spot.yaw, side, ctx.player.position.x, ctx.player.position.z);
    const useLock = (): void => tryOpen(entry, facing());
    // Two prompts at the same spot: a lock icon until the key is found, then a key icon.
    const lockedPrompt: Interactable = {
      id: `${entry.id}-lock`,
      position: () => where(tmp2.clone()),
      radius: 2.9,
      icon: 'lock',
      enabled: () => !entry.lock.opened && !entry.lock.hasKey,
      onUse: useLock,
    };
    const keyPrompt: Interactable = {
      id: `${entry.id}-key`,
      position: () => where(tmp2.clone()),
      radius: 2.9,
      icon: 'key',
      enabled: () => !entry.lock.opened && entry.lock.hasKey,
      onUse: useLock,
    };
    entry.offs.push(ctx.interactions.add(lockedPrompt), ctx.interactions.add(keyPrompt));
    entries.push(entry);
  }

  // ───────────── placement ─────────────

  function placeKeys(): void {
    for (const e of entries) {
      const c = e.spot.position;
      const accept = (k: { x: number; z: number }): boolean => {
        if (!ctx.world.isLand(k.x, k.z)) return false;
        const gy = ctx.world.heightAt(k.x, k.z);
        if (gy < ctx.world.waterLevel + 0.6 || Math.abs(gy - c.y) > 4.5) return false;
        // Not on a roof or under one: the ground must be the first thing hit from above and below.
        const down = ctx.physics.raycast(tmp.set(k.x, gy + 30, k.z), new THREE.Vector3(0, -1, 0), 60);
        if (down && down.point.y > gy + 0.6) return false;
        const up = ctx.physics.raycast(tmp.set(k.x, gy + 0.3, k.z), UP, 4);
        if (up) return false;
        // Clear line of sight from above the chest to where the key floats.
        const from = new THREE.Vector3(c.x, c.y + 1.4, c.z);
        const to = new THREE.Vector3(k.x, gy + 1.3, k.z);
        const dir = to.clone().sub(from);
        const dist = dir.length();
        const hit = ctx.physics.raycast(from, dir, dist);
        return !hit || hit.distance > dist - 0.8;
      };
      const cands = keyCandidates(e.index, c.x, c.z);
      const pick = pickKeySpot(cands, accept) ?? pickKeySpot(cands, (k) => ctx.world.isLand(k.x, k.z) && ctx.world.heightAt(k.x, k.z) > ctx.world.waterLevel + 0.6);
      if (pick) {
        e.keyHome.set(pick.x, ctx.world.heightAt(pick.x, pick.z) + 1.3, pick.z);
      }
      e.keyPos.copy(e.keyHome);
      e.placed = true;
      e.keyModel.group.visible = e.lock.key === 'ground';
    }
    placedAll = true;
  }

  // ───────────── game flow ─────────────

  function tryOpen(e: Entry, onSide: boolean): void {
    const result = e.lock.use(onSide);
    if (result === 'opened') {
      openChest(e);
    } else if (result === 'no-key' || result === 'wrong-side') {
      e.wobble = 1;
      ctx.audio.play('click');
    }
  }

  function openChest(e: Entry): void {
    e.keyFly = 0.001;
    e.openedFor = 0;
    e.lockRoot.visible = false;
    e.model.treasure.visible = false;
    ctx.events.emit('chest:opened', { chestId: e.id, outfitId: e.outfitId });
    equip(e.outfitId);
    ctx.audio.play('chest');
    ctx.audio.play('star', { pitch: 1.1 });
    ctx.cameraRig.shake(0.18);
    tmp.set(e.spot.position.x, e.spot.position.y + 1.0, e.spot.position.z);
    confetti.burst(tmp);
  }

  /**
   * Give the outfit to the player for good: it goes into the saved profile and is worn through the
   * gear applier (`item:equipped`), so there is one way to put things on. `loadout` only tells this
   * session whether the outfit is new to it (for the `outfit:unlocked` event and the counter).
   */
  function equip(outfitId: string): void {
    const def = OUTFITS.find((o) => o.id === outfitId);
    if (!def) return;
    const res = loadout.equip(def);
    ctx.profile.unlock(def.id, 'chest');
    ctx.profile.equip(def.slot, def.id);
    if (res.unlocked) ctx.events.emit('outfit:unlocked', { outfitId: def.id });
    ctx.events.emit('outfit:equipped', { outfitId: def.id, slot: def.slot });
  }

  function resetAll(): void {
    // Worn outfits and paints are saved in the profile and stay between sessions (see ../gear).
    loadout.reset();
    confetti.clear();
    for (const e of entries) {
      e.lock.reset();
      e.openT = 0;
      e.openedFor = 0;
      e.keyFly = 0;
      e.wobble = 0;
      e.lockRoot.visible = true;
      e.model.setLid(0);
      e.model.treasure.visible = false;
      e.model.beam.visible = false;
      e.keyPos.copy(e.keyHome);
      e.keyModel.group.visible = e.placed;
      e.keyModel.group.scale.setScalar(1);
    }
    havePrev = false;
    ctx.session.setTotals({ chests: n });
  }

  const offPhase = ctx.events.on('session:phase', (ev) => {
    if (ev.phase === 'title' || (ev.phase === 'playing' && ev.previous === 'title')) resetAll();
  });

  // ───────────── per-frame ─────────────

  function update(dt: number): void {
    time += dt;
    if (!placedAll) placeKeys();
    const playing = ctx.session.state.phase === 'playing';
    if (playing !== wasPlaying) {
      havePrev = false;
      wasPlaying = playing;
    }

    cur.copy(ctx.player.position);
    cur.y += 0.85;
    if (!havePrev) prev.copy(cur);
    const from = prev.distanceTo(cur) > 90 / 60 + 2 && dt < 0.2 ? cur : prev;

    const carried = entries.filter((e) => e.lock.hasKey);
    for (const e of entries) {
      // Floating key: spin and bob, or follow the player once picked up.
      const kg = e.keyModel.group;
      if (e.lock.key === 'ground') {
        kg.position.set(e.keyPos.x, e.keyPos.y + Math.sin(time * 1.8 + e.index) * 0.14, e.keyPos.z);
        e.keyModel.body.rotation.y = time * 1.1 + e.index;
        e.keyModel.body.rotation.z = Math.sin(time * 1.3 + e.index) * 0.12;
        if (playing && e.placed && segmentSphereHit(from, cur, kg.position, CHEST_RULES.keyPickupRadius) && e.lock.pickUp()) {
          ctx.events.emit('chest:key', { chestId: e.id });
          ctx.events.emit('ui:toast', { icon: 'key' });
          ctx.audio.play('key');
          e.keyPos.copy(kg.position);
        }
      } else if (e.lock.key === 'carried') {
        const slot = carried.indexOf(e);
        const a = time * 2.3 + (slot * Math.PI * 2) / Math.max(1, carried.length);
        tmp.set(ctx.player.position.x + Math.cos(a) * 0.9, ctx.player.position.y + 1.6 + Math.sin(time * 3 + slot) * 0.07, ctx.player.position.z + Math.sin(a) * 0.9);
        kg.position.lerp(tmp, 1 - Math.exp(-10 * dt));
        kg.scale.setScalar(0.34);
        e.keyModel.body.rotation.y = time * 3;
        e.keyModel.body.rotation.z = 0;
      } else if (e.lock.key === 'used' && e.keyFly > 0 && e.keyFly < 1) {
        // Fly into the keyhole and shrink away.
        e.keyFly = Math.min(1, e.keyFly + dt / 0.45);
        const dir = sideDirection(e.lock.keyholeSide);
        const c = Math.cos(e.spot.yaw);
        const s = Math.sin(e.spot.yaw);
        const half = e.lock.keyholeSide % 2 === 0 ? CHEST.depth / 2 : CHEST.width / 2;
        const lx = dir.x * (half + 0.1);
        const lz = dir.z * (half + 0.1);
        tmp.set(e.spot.position.x + c * lx + s * lz, e.spot.position.y + 0.3, e.spot.position.z - s * lx + c * lz);
        kg.position.lerp(tmp, 1 - Math.exp(-14 * dt));
        kg.scale.setScalar(0.34 * (1 - e.keyFly));
        if (e.keyFly >= 1) kg.visible = false;
      }

      // Lock ring + arrow.
      if (e.lockRoot.visible) e.lockModel.update(time + e.index * 1.3);

      // Wobble (wrong side / no key) and the lid.
      if (e.wobble > 0) e.wobble = Math.max(0, e.wobble - dt * 2.2);
      const w = e.wobble * e.wobble;
      const wob = Math.sin(time * 42) * 0.05 * w;
      e.model.group.rotation.z = wob;
      e.lockRoot.rotation.z = wob;
      if (e.lock.opened) {
        e.openedFor += dt;
        e.openT = Math.min(1, e.openT + dt / 0.75);
        e.model.setLid(easeOutBack(e.openT));
        const tt = Math.max(0, (e.openT - 0.3) / 0.7);
        e.model.treasure.visible = tt > 0;
        e.model.treasure.scale.setScalar(Math.max(0.001, easeOutBack(tt)));
        e.model.star.rotation.y = time * 2.4;
        e.model.star.position.y = 0.62 + Math.sin(time * 2.6) * 0.04;
        e.model.beam.visible = tt > 0;
        (e.model.beam.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.65 * Math.max(0, 1 - e.openedFor / 3.5);
      } else {
        e.model.setLid(0.045 * Math.sin(time * 42) * w);
      }
    }

    prev.copy(cur);
    havePrev = true;
    confetti.update(dt);

  }

  // ───────────── test hooks ─────────────

  if (ctx.testMode) {
    window.__rgChests = {
      info: () =>
        entries.map((e) => ({
          id: e.id,
          outfitId: e.outfitId,
          position: [e.spot.position.x, e.spot.position.y, e.spot.position.z],
          yaw: e.spot.yaw,
          keyholeSide: e.lock.keyholeSide,
          key: [e.keyPos.x, e.keyPos.y, e.keyPos.z],
          keyState: e.lock.key,
          open: e.lock.opened,
        })),
      sidePoint(i, side, dist = 1.9) {
        const e = entries[i];
        const d = sideDirection(side);
        const c = Math.cos(e.spot.yaw);
        const s = Math.sin(e.spot.yaw);
        return [e.spot.position.x + c * d.x * dist + s * d.z * dist, e.spot.position.z - s * d.x * dist + c * d.z * dist];
      },
      setKeyVisible(visible) {
        for (const e of entries) e.keyModel.group.visible = visible && e.lock.key === 'ground';
      },
    };
  }

  return {
    update,
    dispose() {
      offPhase();
      resetAll();
      for (const e of entries) {
        for (const off of e.offs) off();
        ctx.vision.remove(e.lockRoot);
        ctx.vision.remove(e.keyModel.group);
        ctx.scene.remove(e.model.group);
        e.model.dispose();
        e.lockModel.dispose();
        e.keyModel.dispose();
        if (e.collider) {
          const c = ctx.physics.world.getCollider(e.collider.handle);
          if (c) ctx.physics.removeCollider(c);
        }
      }
      ctx.scene.remove(confetti.group);
      confetti.dispose();
      if (window.__rgChests) delete window.__rgChests;
    },
  };
}
