/**
 * Buggy workshop at the garage forecourt: E at the tool cart → the buggy rolls onto the turntable,
 * you hop into the seat and it spins slowly while you pick silly upgrades from a row of cards
 * (gems; first fit is a purchase, later taps fit / take off). Parts attach to the buggy body;
 * gameplay goes through the buggy hooks in `src/core/vehicles` (tuning, boost, horn/skill/hop/bump).
 *
 * Upgrades: monster wheels (bigger, bouncier, grass as fast as road), spring bumper (huge comic
 * bounces), bubble exhaust, rocket boost (skill key), musical horns (F), rubber duck on the roof,
 * confetti cannon (fires on every hop). All both-eye.
 */
import * as THREE from 'three';
import type { BuggyHooks, VehiclePublic, VehiclesPublic } from '../../core/vehicles/types';
import { finish, finishMaterial, mergeFinished, placed, rodBetween, type Finish } from '../../core/vertex-finish';
import type { ExternalController, GameContext } from '../../types';
import { ThrillConfetti } from '../thrillConfetti';
import { Bubbles } from './bubbles';
import { CANNON_MUZZLE, EXHAUST_TIPS, createPartKit, type Part, type PartState } from './parts';
import { ROCKET, StickStepper, cardAction, gemsShort, itemId, tuningFor, upgradeDef, wrapIndex, type UpgradeId } from './upgrades';
import { createWorkshopUi } from './ui';
import { getWallet } from './wallet';

export interface Workshop {
  update(dt: number): void;
  readonly open: boolean;
  /** Fitted upgrades right now. */
  readonly fitted: ReadonlySet<UpgradeId>;
  dispose(): void;
}

/** Test hooks (`?test=1`): `window.__rgWorkshop`. */
export interface WorkshopTestApi {
  open(): boolean;
  readonly isOpen: boolean;
  select(index: number): void;
  press(): void;
  close(how: 'drive' | 'exit'): void;
  fitted(): string[];
  /** Fit an upgrade without paying (test only). */
  give(id: UpgradeId): void;
  console: [number, number, number];
}

declare global {
  interface Window {
    __rgWorkshop?: WorkshopTestApi;
  }
}

const DARK: Finish = { color: 0x23262d, rough: 0.7, metal: 0.1 };
const HAZARD: Finish = { color: 0xffd02a, rough: 0.5, metal: 0 };
const STEEL: Finish = { color: 0xc9ced4, rough: 0.3, metal: 0.9 };
const RED: Finish = { color: 0xc8433a, rough: 0.35, metal: 0.1 };
const WHITE: Finish = { color: 0xf4f1ea, rough: 0.45, metal: 0 };
const INK: Finish = { color: 0x1d2333, rough: 0.6, metal: 0 };
const LIGHT: Finish = { color: 0xffffff, rough: 0.3, metal: 0, emissive: 0xfff2cc, glow: 1.6 };

/** Camera framing while the menu is open. */
const VIEW = { distance: 7.4, height: 2.6, fov: 48, lookAhead: 0 } as const;
const TT_RADIUS = 2.9;
const TT_HEIGHT = 0.1;
const SPIN = 0.42;

function turntableGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  parts.push(finish(new THREE.CylinderGeometry(TT_RADIUS, TT_RADIUS + 0.08, TT_HEIGHT, 48).translate(0, TT_HEIGHT / 2, 0), DARK));
  // Hazard ring: alternating bright / dark segments (brightness, not hue).
  const n = 24;
  for (let i = 0; i < n; i++) {
    const g = new THREE.RingGeometry(TT_RADIUS - 0.34, TT_RADIUS - 0.05, 3, 1, (i / n) * Math.PI * 2, (Math.PI * 2) / n).rotateX(-Math.PI / 2).translate(0, TT_HEIGHT + 0.006, 0);
    parts.push(finish(g, i % 2 ? HAZARD : INK));
  }
  // Ring of little lights and a steel hub.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    parts.push(finish(placed(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 10), Math.cos(a) * (TT_RADIUS - 0.55), TT_HEIGHT + 0.01, Math.sin(a) * (TT_RADIUS - 0.55)), LIGHT));
  }
  parts.push(finish(new THREE.CylinderGeometry(0.5, 0.5, 0.02, 24).translate(0, TT_HEIGHT + 0.006, 0), STEEL));
  // Two chevrons (show the spin).
  for (const a of [0, Math.PI]) {
    const s = new THREE.Shape();
    s.moveTo(-0.35, -0.2);
    s.lineTo(0, 0.25);
    s.lineTo(0.35, -0.2);
    s.lineTo(0.2, -0.2);
    s.lineTo(0, 0.05);
    s.lineTo(-0.2, -0.2);
    const g = new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2).rotateY(a + Math.PI / 2).translate(Math.cos(a) * (TT_RADIUS - 1.05), TT_HEIGHT + 0.008, -Math.sin(a) * (TT_RADIUS - 1.05));
    parts.push(finish(g, WHITE));
  }
  return mergeFinished(parts);
}

/** Tool cart with a big wrench sign on a pole (local: +Z faces the turntable). */
function consoleGeometry(): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  p.push(finish(new THREE.BoxGeometry(1.0, 0.9, 0.62).translate(0, 0.62, 0), RED));
  for (let i = 0; i < 3; i++) p.push(finish(new THREE.BoxGeometry(0.86, 0.035, 0.02).translate(0, 0.38 + i * 0.24, 0.32), STEEL));
  p.push(finish(new THREE.BoxGeometry(1.08, 0.06, 0.7).translate(0, 1.1, 0), DARK));
  for (const [x, z] of [[-0.42, -0.24], [0.42, -0.24], [-0.42, 0.24], [0.42, 0.24]]) {
    p.push(finish(placed(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 12), x, 0.09, z, 0, 0, Math.PI / 2), INK));
  }
  // Big round push button on top.
  p.push(finish(new THREE.CylinderGeometry(0.17, 0.19, 0.08, 20).translate(0.22, 1.17, 0.08), INK));
  p.push(finish(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 20).translate(0.22, 1.22, 0.08), HAZARD));
  // Tools lying on top.
  p.push(finish(new THREE.BoxGeometry(0.42, 0.04, 0.06).translate(-0.2, 1.15, -0.1), STEEL));
  p.push(finish(new THREE.TorusGeometry(0.06, 0.02, 6, 12).translate(-0.43, 1.15, -0.1), STEEL));
  // Sign: pole + white disc + dark wrench and car.
  p.push(finish(rodBetween(new THREE.Vector3(0.38, 1.12, -0.22), new THREE.Vector3(0.38, 2.5, -0.22), 0.045, 8), STEEL));
  p.push(finish(placed(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 32), 0.38, 2.95, -0.22, Math.PI / 2), INK));
  p.push(finish(placed(new THREE.CylinderGeometry(0.54, 0.54, 0.1, 32), 0.38, 2.95, -0.22, Math.PI / 2), WHITE));
  // Wrench: handle + open jaw (two faces, front and back).
  for (const side of [1, -1]) {
    const z = -0.22 + side * 0.055;
    const handle = new THREE.BoxGeometry(0.13, 0.62, 0.02).translate(0, -0.08, 0);
    const jawL = new THREE.BoxGeometry(0.08, 0.18, 0.02).translate(-0.1, 0.3, 0);
    const jawR = new THREE.BoxGeometry(0.08, 0.18, 0.02).translate(0.1, 0.3, 0);
    const ring = new THREE.BoxGeometry(0.28, 0.1, 0.02).translate(0, 0.2, 0);
    for (const g of [handle, jawL, jawR, ring]) {
      g.rotateZ(0.75);
      g.translate(0.38, 2.95, z);
      p.push(finish(g, INK));
    }
  }
  return mergeFinished(p);
}

export function createWorkshop(ctx: GameContext): Workshop {
  const anchor = ctx.world.anchors.garage;
  const centre = new THREE.Vector3(anchor.position.x, ctx.world.heightAt(anchor.position.x, anchor.position.z), anchor.position.z);
  const yaw0 = anchor.yaw;
  const local = (x: number, z: number): THREE.Vector3 =>
    new THREE.Vector3(centre.x + Math.cos(yaw0) * x + Math.sin(yaw0) * z, centre.y, centre.z - Math.sin(yaw0) * x + Math.cos(yaw0) * z);

  // ── Site: turntable (spins) + tool cart console. 2 draws, no shadow casters needed (low). ──
  const material = finishMaterial('workshop-site');
  const turntable = new THREE.Mesh(turntableGeometry(), material);
  turntable.name = 'workshop-turntable';
  turntable.position.copy(centre);
  turntable.receiveShadow = true;
  ctx.scene.add(turntable);
  const ttCollider = ctx.physics.addStaticCylinder(new THREE.Vector3(centre.x, centre.y + TT_HEIGHT / 2, centre.z), TT_HEIGHT / 2, TT_RADIUS);

  // Look direction of the showroom camera: from the front of the site, a little from the
  // side away from the tool cart.
  const viewYaw = yaw0 + Math.PI - 0.35;
  const consolePos = local(3.9, 0.6);
  consolePos.y = ctx.world.heightAt(consolePos.x, consolePos.z);
  const cart = new THREE.Mesh(consoleGeometry(), material);
  cart.name = 'workshop-console';
  cart.position.copy(consolePos);
  cart.rotation.y = Math.atan2(centre.x - consolePos.x, centre.z - consolePos.z);
  cart.castShadow = true;
  cart.receiveShadow = true;
  ctx.scene.add(cart);
  const cartCollider = ctx.physics.addStaticBox(
    new THREE.Vector3(consolePos.x, consolePos.y + 0.6, consolePos.z),
    new THREE.Vector3(0.52, 0.6, 0.34),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), cart.rotation.y),
  );

  const confetti = new ThrillConfetti();
  ctx.scene.add(confetti.group);
  const bubbles = new Bubbles();
  ctx.scene.add(bubbles.mesh);
  const kit = createPartKit();
  const wallet = getWallet(ctx);
  const ui = createWorkshopUi(ctx.uiRoot);

  const car = ctx.vehicles.all.find((v) => v.kind === 'car') as VehiclePublic | undefined;
  const hooks: BuggyHooks | undefined = car?.buggy;

  // ── Fitted upgrades ──
  const fitted = new Set<UpgradeId>();
  const parts = new Map<UpgradeId, Part>();
  const partState: PartState = { time: 0, accelLong: 0, accelLat: 0, plume: 0, bumperKick: 0, hornKick: 0, cannonKick: 0 };
  const popIn = new Map<UpgradeId, number>();

  const applyFitted = (): void => {
    if (!hooks) return;
    hooks.setTuning(tuningFor(fitted));
    for (const [id, part] of parts) {
      if (!fitted.has(id)) {
        part.object.removeFromParent();
        part.dispose();
        parts.delete(id);
      }
    }
    for (const id of fitted) {
      if (parts.has(id)) continue;
      const part = kit.build(id);
      if (!part) continue;
      hooks.body.add(part.object);
      parts.set(id, part);
    }
    wallet.setFitted([...fitted]);
  };
  for (const id of wallet.fitted()) {
    if (upgradeDef(id) && wallet.owns(itemId(id as UpgradeId))) fitted.add(id as UpgradeId);
  }
  applyFitted();

  // ── Upgrade behaviour while driving ──
  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const notes: { at: number; pitch: number }[] = [];
  let hornClock = 0;
  let rocketCd = 0;
  let cannonCd = 0;
  let bubbleAcc = 0;
  let bubbleSeed = 1;
  const bodyToWorld = (p: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 => {
    if (!hooks) return out.copy(p);
    hooks.body.updateWorldMatrix(true, false);
    return out.copy(p).applyMatrix4(hooks.body.matrixWorld);
  };
  if (hooks) {
    hooks.onHorn = () => {
      if (!fitted.has('musicalHorns')) {
        ctx.audio.play('horn');
        return;
      }
      // A happy little arpeggio (do-mi-so-do).
      notes.length = 0;
      [1, 1.26, 1.5, 2].forEach((pitch, i) => notes.push({ at: hornClock + i * 0.11, pitch }));
      partState.hornKick = 1;
    };
    hooks.onSkill = () => {
      if (!fitted.has('rocketBoost') || rocketCd > 0) return;
      rocketCd = ROCKET.cooldown;
      hooks.boost(ROCKET.extra, ROCKET.seconds, ROCKET.kick);
      partState.plume = 1;
      ctx.audio.play('whoosh', { pitch: 1.3, volume: 1 });
      ctx.cameraRig.shake(0.25);
    };
    hooks.onHop = () => {
      if (!fitted.has('confettiCannon') || cannonCd > 0) return;
      cannonCd = 0.9;
      partState.cannonKick = 1;
      confetti.burst(bodyToWorld(CANNON_MUZZLE, tmpV), 45);
      ctx.audio.play('star', { pitch: 1.4, volume: 0.7 });
    };
    hooks.onBump = (speed) => {
      if (fitted.has('springBumper')) {
        partState.bumperKick = Math.min(1.4, 0.4 + speed / 8);
        ctx.audio.play(speed > 6 ? 'bigBoing' : 'boing');
      }
      if (fitted.has('duckOrnament')) ctx.audio.play('click', { pitch: 2.4, volume: 0.6 });
    };
  }

  const prevVel = new THREE.Vector3();
  let havePrev = false;
  function updateParts(dt: number): void {
    if (!hooks || !car) return;
    // Far away and parked: nothing to animate.
    if (!hooks.driven && !open && parts.size > 0 && ctx.camera.position.distanceTo(car.position) > 90) return;
    partState.time += dt;
    hornClock += dt;
    rocketCd = Math.max(0, rocketCd - dt);
    cannonCd = Math.max(0, cannonCd - dt);
    while (notes.length && notes[0].at <= hornClock) {
      const n = notes.shift()!;
      ctx.audio.play('horn', { pitch: n.pitch, volume: 0.75 });
    }
    // Rocket plume follows the boost.
    const boosting = hooks.boostLeft > 0 && fitted.has('rocketBoost');
    partState.plume += ((boosting ? 1 : 0) - partState.plume) * (1 - Math.exp(-(boosting ? 20 : 6) * dt));
    // Body-frame acceleration for the duck's wobble.
    const v = tmpV.set(0, 0, 0);
    const obj = car.object;
    v.copy(car.position);
    if (havePrev && dt > 0) {
      const vel = tmpV2.copy(v).sub(prevVel).divideScalar(dt);
      tmpQ.copy(obj.quaternion).invert();
      vel.applyQuaternion(tmpQ);
      // Velocity in body frame → acceleration by differencing (kept in userData).
      const last = (obj.userData.__wsVel as THREE.Vector3 | undefined) ?? vel.clone();
      const k = 1 - Math.exp(-10 * dt);
      partState.accelLong += (THREE.MathUtils.clamp((vel.z - last.z) / dt, -40, 40) - partState.accelLong) * k;
      partState.accelLat += (THREE.MathUtils.clamp((vel.x - last.x) / dt, -40, 40) - partState.accelLat) * k;
      obj.userData.__wsVel = vel.clone();
    }
    prevVel.copy(v);
    havePrev = true;
    for (const p of parts.values()) p.update(dt, partState);
    // Pop-in squash for freshly fitted parts.
    for (const [id, t] of popIn) {
      const nt = t + dt;
      const part = parts.get(id);
      if (!part || nt > 0.5) {
        part?.object.scale.setScalar(1);
        popIn.delete(id);
        continue;
      }
      popIn.set(id, nt);
      const s = 1 + Math.sin(nt * 22) * Math.exp(-nt * 7) * 0.5;
      part.object.scale.setScalar(Math.min(1.5, Math.max(0.2, nt < 0.06 ? nt / 0.06 : s)));
    }
    // Bubbles from the exhausts while the engine runs (and gently on the turntable).
    if (fitted.has('bubbleExhaust') && ctx.camera.position.distanceTo(car.position) < 70) {
      const speed = Math.abs(hooks.forwardSpeed);
      const rate = hooks.driven || open ? 5 + speed * 1.4 : 0;
      bubbleAcc += rate * dt;
      while (bubbleAcc >= 1) {
        bubbleAcc -= 1;
        bubbleSeed++;
        const tip = EXHAUST_TIPS[bubbleSeed & 1];
        bodyToWorld(tip, tmpV);
        tmpV2.set(0, 0, -1.2).applyQuaternion(obj.quaternion);
        bubbles.emit(tmpV, tmpV2, bubbleSeed);
      }
    }
    bubbles.update(dt);
  }

  // ── Menu ──
  let open = false;
  let closing: 'drive' | 'exit' | null = null;
  let pendingDrive = false;
  let sel = 0;
  let sinceOpen = 0;
  let spinYaw = 0;
  const stepper = new StickStepper();
  const seatPos = new THREE.Vector3();
  const seatQ = new THREE.Quaternion();
  const seatS = new THREE.Vector3();
  const fwd = new THREE.Vector3();

  const view = (id: UpgradeId): { owned: boolean; fitted: boolean; affordable: boolean; short: number } => {
    const def = upgradeDef(id)!;
    const owned = wallet.owns(itemId(id));
    return { owned, fitted: fitted.has(id), affordable: wallet.gems >= def.price, short: gemsShort(wallet.gems, def.price) };
  };
  const refresh = (): void => ui.render(wallet.gems, view, ctx.input.state.device === 'gamepad');

  const partWorldPos = (id: UpgradeId): THREE.Vector3 => {
    const p = parts.get(id);
    if (p) {
      p.object.updateWorldMatrix(true, false);
      return new THREE.Vector3().setFromMatrixPosition(p.object.matrixWorld).add(new THREE.Vector3(0, 0.4, 0));
    }
    return car ? car.position.clone().add(new THREE.Vector3(0, 1.2, 0)) : centre.clone();
  };

  function activate(index: number): void {
    const kind = ui.cards[index];
    if (kind === 'drive' || kind === 'exit') {
      closing = kind;
      ctx.audio.play('click');
      return;
    }
    const def = upgradeDef(kind)!;
    const v = view(kind);
    const outcome = cardAction(v.owned, v.fitted, wallet.gems, def.price);
    if (outcome === 'tooPoor') {
      ui.shake(kind, v.short);
      ctx.audio.play('click', { pitch: 0.6 });
      return;
    }
    if (outcome === 'bought') {
      if (!wallet.spend(def.price, 'shop')) {
        ui.shake(kind, gemsShort(wallet.gems, def.price));
        return;
      }
      wallet.unlock(itemId(kind));
      ctx.audio.play('chest');
      ctx.audio.play('fanfare', { volume: 0.6 });
    } else {
      ctx.audio.play(outcome === 'fitted' ? 'boing' : 'click');
    }
    if (outcome === 'removed') fitted.delete(kind);
    else fitted.add(kind);
    applyFitted();
    if (outcome !== 'removed') {
      popIn.set(kind, 0);
      confetti.burst(partWorldPos(kind), outcome === 'bought' ? 70 : 25);
    }
    ui.pop(kind);
    refresh();
  }

  ui.onClick = (i) => {
    if (!open || closing) return;
    sel = i;
    ui.select(sel);
    activate(i);
  };

  const controller: ExternalController = {
    update(dt, input) {
      if (!car || !hooks) return false;
      sinceOpen += dt;
      spinYaw += SPIN * dt;
      car.teleport(centre.clone().setY(centre.y + TT_HEIGHT), spinYaw);
      turntable.rotation.y = spinYaw - startYaw;
      hooks.seat.updateWorldMatrix(true, false);
      hooks.seat.matrixWorld.decompose(seatPos, seatQ, seatS);
      ctx.player.position.copy(seatPos);
      fwd.set(0, 0, 1).applyQuaternion(seatQ);
      ctx.player.yaw = Math.atan2(fwd.x, fwd.z);
      ctx.player.setAnimation('sit');
      // Fixed showroom angle from the road side (the buggy turns, the camera stays).
      ctx.cameraRig.setOverride({ ...VIEW, yawOffset: viewYaw - ctx.player.yaw });
      if (sinceOpen > 0.25 && !closing) {
        const step = stepper.step(input.moveX, dt);
        if (step !== 0) {
          sel = wrapIndex(sel + step, ui.cards.length);
          ui.select(sel);
          ctx.audio.play('click', { pitch: 1.3, volume: 0.5 });
        }
        if (input.usePressed || input.jumpPressed) activate(sel);
        else if (input.respawnPressed) closing = 'exit';
      }
      return closing === null;
    },
    onRelease() {
      const how = closing;
      open = false;
      closing = null;
      ui.show(false);
      ctx.cameraRig.setOverride(null);
      ctx.input.capturePointer();
      if (how === 'drive') pendingDrive = true;
      else if (how === 'exit' && car) {
        // Step off on the console side.
        const spot = centre.clone().lerp(consolePos, 0.62);
        spot.y = ctx.world.heightAt(spot.x, spot.z) + 0.05;
        ctx.player.teleport(spot, Math.atan2(centre.x - spot.x, centre.z - spot.z));
      }
    },
  };
  let startYaw = 0;

  function openWorkshop(): boolean {
    if (open || !car || !hooks || ctx.player.mode !== 'walk' || ctx.session.state.phase !== 'playing') return false;
    // Tow the buggy back onto the turntable if it is elsewhere (with a poof).
    if (car.position.distanceTo(centre) > 1.6) {
      confetti.burst(car.position.clone().add(new THREE.Vector3(0, 1, 0)), 40);
      ctx.audio.play('whoosh', { pitch: 0.8 });
    }
    spinYaw = hooks.heading();
    startYaw = spinYaw;
    ctx.player.setExternalController(controller);
    if ((ctx.player.mode as string) !== 'external') return false;
    open = true;
    closing = null;
    sinceOpen = 0;
    sel = 0;
    ui.select(sel);
    refresh();
    ui.show(true);
    ctx.player.setVisible(true);
    ctx.input.releasePointer();
    ctx.cameraRig.setOverride({ ...VIEW, yawOffset: viewYaw - ctx.player.yaw });
    ctx.audio.play('click');
    return true;
  }

  const removeInteraction = ctx.interactions.add({
    id: 'workshop',
    position: () => tmpPrompt.copy(consolePos).setY(consolePos.y + 1.7),
    radius: 2.6,
    icon: 'paint',
    enabled: () => !open,
    onUse: () => {
      openWorkshop();
    },
  });
  const tmpPrompt = new THREE.Vector3();
  const offWallet = ctx.events.on('gem:collected', () => {
    if (open) refresh();
  });

  if (ctx.testMode) {
    window.__rgWorkshop = {
      open: () => openWorkshop(),
      get isOpen() {
        return open;
      },
      select(i) {
        sel = wrapIndex(i, ui.cards.length);
        ui.select(sel);
      },
      press() {
        activate(sel);
      },
      close(how) {
        if (open) closing = how;
      },
      fitted: () => [...fitted],
      give(id) {
        wallet.unlock(itemId(id));
        fitted.add(id);
        applyFitted();
      },
      console: [consolePos.x, consolePos.y, consolePos.z],
    };
  }

  return {
    get open() {
      return open;
    },
    get fitted() {
      return fitted;
    },
    update(dt) {
      if (pendingDrive) {
        pendingDrive = false;
        if (car && ctx.player.mode === 'walk') (ctx.vehicles as VehiclesPublic).board?.(car.id);
      }
      // Lights on the turntable ring breathe a little; nothing else updates far away.
      updateParts(dt);
      if (open || ctx.camera.position.distanceTo(centre) < 90 || hooks?.driven) confetti.update(dt);
    },
    dispose() {
      removeInteraction();
      offWallet();
      if (hooks) {
        hooks.onHorn = hooks.onSkill = hooks.onHop = null;
        hooks.onBump = null;
      }
      for (const p of parts.values()) {
        p.object.removeFromParent();
        p.dispose();
      }
      kit.dispose();
      ui.dispose();
      turntable.removeFromParent();
      cart.removeFromParent();
      turntable.geometry.dispose();
      cart.geometry.dispose();
      material.dispose();
      ctx.physics.removeCollider(ttCollider);
      ctx.physics.removeCollider(cartCollider);
      confetti.group.removeFromParent();
      confetti.dispose();
      bubbles.mesh.removeFromParent();
      bubbles.dispose();
      if (ctx.testMode) delete window.__rgWorkshop;
    },
  };
}
