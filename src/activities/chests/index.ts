/**
 * Treasure chests with a both-eye symbol lock.
 *
 *  - The KEY floats 6-12 m from each chest and is WeakOnly: the weak eye finds it (a WeakOnly arrow
 *    trail on the ground also leads from the chest toward it).
 *  - The ANSWER (which of star / moon / circle opens this chest) floats over the chest and on its lid
 *    and is StrongOnly: the strong eye reads it.
 *  - Around the chest, a ring of six big floor buttons (each symbol twice) is in the main scene, so
 *    both eyes see them. With the key in hand, stepping on (or pressing E at) a button with the right
 *    symbol opens the chest from ANY direction; a wrong one wobbles, giggles and sinks for 2 s (no
 *    penalty). Without the key the buttons just boing.
 *  - Opening gives an outfit (hat, cape, glasses, buggy paint), equips it and pops confetti.
 */
import * as THREE from 'three';
import { VisionLayer } from '../../types';
import type { GameContext, Interactable } from '../../types';
import { segmentSphereHit } from '../gemLogic';
import { Confetti } from './confetti';
import { buildChest, CHEST } from './chestModel';
import type { ChestModel } from './chestModel';
import { buildKey, buildSymbolHint } from './lockModel';
import type { KeyModel, SymbolHintModel } from './lockModel';
import { buildBadge, buildButtons, buildTrail, chestTrail } from './ringModel';
import type { Badge, Trail } from './ringModel';
import { ApproachHints, CHEST_RULES, ChestLock, Loadout, RING, buttonWorld, keyCandidates, nearestButton, pickKeySpot, ringButtons, rightSymbol, sideDirection } from './logic';
import { OUTFITS, outfitForChest } from './outfits';

export { OUTFITS } from './outfits';
export { chestTrail, setChestTrailEnabled } from './ringModel';

export interface ChestInfo {
  id: string;
  outfitId: string;
  position: [number, number, number];
  yaw: number;
  /** The symbol that opens this chest: 0 star, 1 moon, 2 circle. */
  symbol: number;
  wrongTries: number;
  buttons: { x: number; y: number; z: number; symbol: number; sunk: boolean }[];
  key: [number, number, number];
  keyState: 'ground' | 'carried' | 'used';
  open: boolean;
  /** Where the key model is drawn right now (follows the player while carried). */
  keyNow: [number, number, number];
}

/** Test hook (`window.__rgChests`, only with `?test=1`). */
export interface ChestsTestApi {
  info(): ChestInfo[];
  /** World x,z of a point `dist` metres from chest `i`, straight out from side `side` (0..3). */
  sidePoint(i: number, side: number, dist?: number): [number, number];
  /** Hide or show the floating keys (and their trails). */
  setKeyVisible(visible: boolean): void;
}

/** What a guide character needs to know: the chest the player is near (if any) and how it is going. */
export interface ChestHintState {
  nearChestId: string;
  hasKey: boolean;
  wrongTries: number;
}

let hintSource: (() => ChestHintState | null) | null = null;

/** The locked chest the player is near right now, or null. Poll it; nothing is emitted for it. */
export function chestHintState(): ChestHintState | null {
  return hintSource ? hintSource() : null;
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

interface BtnState {
  symbol: number;
  x: number;
  y: number;
  z: number;
  on: boolean;
  /** Seconds left sunk after a wrong step. */
  sunk: number;
  press: number;
  boing: number;
  shake: number;
}

interface Entry {
  index: number;
  id: string;
  outfitId: string;
  spot: { position: THREE.Vector3; yaw: number };
  lock: ChestLock;
  model: ChestModel;
  hint: SymbolHintModel;
  lockRoot: THREE.Group;
  badge: Badge;
  trail: Trail;
  hints: ApproachHints;
  buttons: BtnState[];
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
  let keysShown = true;

  const entries: Entry[] = [];
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  /** Player feet last frame: carried keys follow in the player's frame (no lag at freefall speed). */
  const lastPlayer = new THREE.Vector3();

  // Instanced floor buttons for every chest: slot = chest * RING.count + k.
  const ring = ringButtons();
  const slotSymbols: number[] = [];
  for (let i = 0; i < n; i++) for (const b of ring) slotSymbols.push(b.symbol);
  const buttonSet = buildButtons(slotSymbols);
  for (const m of buttonSet.meshes) ctx.scene.add(m);

  for (let i = 0; i < n; i++) {
    const spot = spots[i];
    const symbol = rightSymbol(i);
    const model = buildChest();
    model.group.position.copy(spot.position).y -= 0.02;
    model.group.rotation.y = spot.yaw;
    ctx.scene.add(model.group);

    const hint = buildSymbolHint(symbol);
    const lockRoot = hint.root;
    lockRoot.position.copy(model.group.position);
    lockRoot.rotation.y = spot.yaw;
    ctx.vision.add(lockRoot, VisionLayer.StrongOnly);

    const keyModel = buildKey(symbol);
    keyModel.group.visible = false; // until its spot is validated against the physics world
    ctx.vision.add(keyModel.group, VisionLayer.WeakOnly);

    const trail = buildTrail();
    trail.mesh.visible = false;
    ctx.vision.add(trail.mesh, VisionLayer.WeakOnly);

    const badge = buildBadge();
    ctx.scene.add(badge.group);

    const buttons: BtnState[] = ring.map((b) => {
      const w = buttonWorld(spot.position.x, spot.position.z, spot.yaw, b.angle);
      return { symbol: b.symbol, x: w.x, y: ctx.world.heightAt(w.x, w.z), z: w.z, on: false, sunk: 0, press: 0, boing: 0, shake: 0 };
    });

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
      lock: new ChestLock(symbol),
      model,
      hint,
      lockRoot,
      badge,
      trail,
      hints: new ApproachHints(),
      buttons,
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
    const useChest = (): void => pressNearest(entry);
    // Two prompts at the same spot: a key icon until the key is found (the "?" badge and toast say
    // "find the key"), then a lock icon: step on, or press E at, the right shape.
    const needKey: Interactable = {
      id: `${entry.id}-key`,
      position: () => where(tmp2.clone()),
      radius: 4.5,
      icon: 'key',
      enabled: () => !entry.lock.opened && !entry.lock.hasKey,
      onUse: useChest,
    };
    const haveKey: Interactable = {
      id: `${entry.id}-lock`,
      position: () => where(tmp2.clone()),
      radius: 4.5,
      icon: 'lock',
      enabled: () => !entry.lock.opened && entry.lock.hasKey,
      onUse: useChest,
    };
    entry.offs.push(ctx.interactions.add(needKey), ctx.interactions.add(haveKey));
    entries.push(entry);
  }

  hintSource = () => {
    for (const e of entries) {
      if (e.hints.isNear && !e.lock.opened) return { nearChestId: e.id, hasKey: e.lock.hasKey, wrongTries: e.lock.wrongTries };
    }
    return null;
  };

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
      {
        // Trail: from just outside the button ring toward the key, stopping a little short of it.
        const dx = e.keyHome.x - c.x;
        const dz = e.keyHome.z - c.z;
        const len = Math.hypot(dx, dz) || 1;
        const from = RING.radius + 1.0;
        const to = Math.max(from + 1.5, len - 1.1);
        e.trail.layOut(c.x + (dx / len) * from, c.z + (dz / len) * from, c.x + (dx / len) * to, c.z + (dz / len) * to, (x, z) => ctx.world.heightAt(x, z));
      }
      e.placed = true;
      e.keyModel.group.visible = e.lock.key === 'ground';
    }
    placedAll = true;
  }

  // ───────────── game flow ─────────────

  /** Step on / press at button `k`: boing without the key, wobble if wrong, open if right. */
  function pressButton(e: Entry, k: number): void {
    const b = e.buttons[k];
    if (e.lock.opened || b.sunk > 0) return;
    const result = e.lock.press(b.symbol);
    if (result === 'opened') {
      b.press = 1;
      openChest(e);
    } else if (result === 'wrong-symbol') {
      b.sunk = RING.sunkSeconds;
      b.shake = 1;
      e.wobble = 0.7;
      ctx.audio.play('boing', { pitch: 1.7, volume: 0.7 });
      ctx.audio.play('click', { pitch: 1.4, volume: 0.6 });
    } else if (result === 'no-key') {
      b.boing = 1;
      ctx.audio.play('boing', { pitch: 1.1, volume: 0.8 });
    }
  }

  /** E at a chest: the nearest button within reach counts as stepped on. */
  function pressNearest(e: Entry): void {
    const k = nearestButton(e.buttons, ctx.player.position.x, ctx.player.position.z, RING.useReach);
    if (k < 0) {
      e.wobble = 1;
      ctx.audio.play('click');
      return;
    }
    pressButton(e, k);
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
      e.hints.reset();
      e.badge.group.visible = false;
      e.model.keyFill.visible = false;
      for (const b of e.buttons) {
        b.on = false;
        b.sunk = 0;
        b.press = 0;
        b.boing = 0;
        b.shake = 0;
      }
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
        tmp.set(Math.cos(a) * 0.9, 1.6 + Math.sin(time * 3 + slot) * 0.07, Math.sin(a) * 0.9);
        kg.position.sub(lastPlayer).lerp(tmp, 1 - Math.exp(-10 * dt)).add(ctx.player.position);
        kg.scale.setScalar(0.34);
        e.keyModel.body.rotation.y = time * 3;
        e.keyModel.body.rotation.z = 0;
      } else if (e.lock.key === 'used' && e.keyFly > 0 && e.keyFly < 1) {
        // Fly into the chest and shrink away.
        e.keyFly = Math.min(1, e.keyFly + dt / 0.45);
        tmp.set(e.spot.position.x, e.spot.position.y + 0.5, e.spot.position.z);
        kg.position.lerp(tmp, 1 - Math.exp(-14 * dt));
        kg.scale.setScalar(0.34 * (1 - e.keyFly));
        if (e.keyFly >= 1) kg.visible = false;
      }

      // Strong-eye symbol: floats over the chest and turns to face the camera.
      if (e.lockRoot.visible) {
        e.hint.update(time + e.index * 1.3, Math.atan2(ctx.camera.position.x - e.spot.position.x, ctx.camera.position.z - e.spot.position.z));
      }
      e.model.keyFill.visible = e.lock.key !== 'ground';

      // Hints: once per approach, and the "?" badge while the key is still missing.
      const dist = Math.hypot(ctx.player.position.x - e.spot.position.x, ctx.player.position.z - e.spot.position.z);
      const hint = playing ? e.hints.update(dist, e.lock.hasKey, e.lock.opened) : null;
      if (hint === 'find-key') ctx.events.emit('ui:toast', { icon: 'key', text: 'Find the key!' });
      else if (hint === 'step-shape') ctx.events.emit('ui:toast', { icon: 'lock', text: 'Step on the right shape!' });
      const showBadge = e.hints.isNear && !e.lock.hasKey && !e.lock.opened;
      e.badge.group.visible = showBadge;
      if (showBadge) {
        e.badge.group.position.set(e.spot.position.x, e.spot.position.y + 1.5 + Math.sin(time * 2.6 + e.index) * 0.06, e.spot.position.z);
        e.badge.group.rotation.y = Math.atan2(ctx.camera.position.x - e.spot.position.x, ctx.camera.position.z - e.spot.position.z);
      }

      // Weak-eye arrow trail: chest toward key, only while the key is still out there.
      const showTrail = chestTrail.enabled && keysShown && e.placed && e.lock.key === 'ground' && !e.lock.opened;
      e.trail.mesh.visible = showTrail;
      if (showTrail) e.trail.update(time + e.index);

      // Floor buttons: idle bob, press, boing, wrong-shape sink.
      const stepNow = playing && !e.lock.opened;
      for (let k = 0; k < e.buttons.length; k++) {
        const b = e.buttons[k];
        const on = stepNow && Math.hypot(ctx.player.position.x - b.x, ctx.player.position.z - b.z) <= RING.stepRadius && Math.abs(ctx.player.position.y - b.y) < 1.1;
        if (on && !b.on) pressButton(e, k);
        b.on = on;
        if (b.sunk > 0) b.sunk = Math.max(0, b.sunk - dt);
        if (b.boing > 0) b.boing = Math.max(0, b.boing - dt * 1.6);
        if (b.shake > 0) b.shake = Math.max(0, b.shake - dt * 1.8);
        const goal = e.lock.opened ? 0.85 : b.sunk > 0 ? 1 : on ? 0.8 : 0;
        b.press += (goal - b.press) * (1 - Math.exp(-14 * dt));
        const bob = e.lock.opened || b.press > 0.3 ? 0 : Math.sin(time * 1.7 + e.index * 1.3 + k * 1.05) * 0.028 + 0.03;
        const spring = Math.sin((1 - b.boing) * Math.PI * 3) * b.boing * 0.3;
        buttonSet.set(e.index * RING.count + k, b.symbol, {
          x: b.x,
          y: b.y + bob - b.press * 0.07 + Math.max(0, spring) * 0.12,
          z: b.z,
          yaw: e.spot.yaw + Math.sin(time * 34) * 0.09 * b.shake * b.shake,
          squash: 1 - 0.38 * b.press + spring,
          tint: e.lock.opened ? 0.8 : b.sunk > 0 ? 0.62 : on ? 1.2 : 1,
        });
      }

      // Wobble (wrong side / no key) and the lid.
      if (e.wobble > 0) e.wobble = Math.max(0, e.wobble - dt * 2.2);
      const w = e.wobble * e.wobble;
      const wob = Math.sin(time * 42) * 0.05 * w;
      e.model.group.rotation.z = wob;
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
    lastPlayer.copy(ctx.player.position);
    buttonSet.flush();
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
          symbol: e.lock.symbol,
          wrongTries: e.lock.wrongTries,
          buttons: e.buttons.map((b) => ({ x: b.x, y: b.y, z: b.z, symbol: b.symbol, sunk: b.sunk > 0 })),
          key: [e.keyPos.x, e.keyPos.y, e.keyPos.z],
          keyState: e.lock.key,
          open: e.lock.opened,
          keyNow: [e.keyModel.group.position.x, e.keyModel.group.position.y, e.keyModel.group.position.z],
        })),
      sidePoint(i, side, dist = 5) {
        const e = entries[i];
        const d = sideDirection(side);
        const c = Math.cos(e.spot.yaw);
        const s = Math.sin(e.spot.yaw);
        return [e.spot.position.x + c * d.x * dist + s * d.z * dist, e.spot.position.z - s * d.x * dist + c * d.z * dist];
      },
      setKeyVisible(visible) {
        keysShown = visible;
        for (const e of entries) {
          e.keyModel.group.visible = visible && e.lock.key === 'ground';
          e.trail.mesh.visible = visible && chestTrail.enabled && e.placed && e.lock.key === 'ground' && !e.lock.opened;
        }
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
        e.hint.dispose();
        ctx.vision.remove(e.trail.mesh);
        e.trail.dispose();
        ctx.scene.remove(e.badge.group);
        e.badge.dispose();
        e.keyModel.dispose();
        if (e.collider) {
          const c = ctx.physics.world.getCollider(e.collider.handle);
          if (c) ctx.physics.removeCollider(c);
        }
      }
      for (const m of buttonSet.meshes) ctx.scene.remove(m);
      buttonSet.dispose();
      hintSource = null;
      ctx.scene.remove(confetti.group);
      confetti.dispose();
      if (window.__rgChests) delete window.__rgChests;
    },
  };
}
