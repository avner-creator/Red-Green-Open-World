/**
 * Secret paths and weak-eye extras: the red-green heart of the island.
 *
 *  1. Secret paths: four routes of floating stepping stones that only the weak eye sees (WeakOnly
 *     layer) but that are solid (invisible colliders, skipped by camera and gameplay rays). Each ends
 *     at a both-eye reward pedestal: confetti, stars, fanfare. Stones pulse gently, chime when you
 *     land on them and the one you stand on lights up (still weak-eye only).
 *  2. Weak-eye arrows: trails of arrows on the ground from the nearest road to each path start and to
 *     each chest key that is still waiting to be found.
 *  3. Two-eye vault doors: the weak eye sees a floating sequence of three shapes; the strong eye sees
 *     shape buttons on the door (and matching floor tiles). Press them in the weak eye's order (E on
 *     each). A wrong press is a friendly wobble and a restart. Inside: a both-eye treasure pile.
 *
 * Nothing on a layer leaks into the main scene, HUD or audio: prompts sit on both-eye objects (the
 * pedestal, the door) and sounds are not positional.
 */
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import { VisionLayer } from '../../types';
import type { GameContext, Interactable } from '../../types';
import { GROUP_AVATAR, GROUP_VEHICLE, groups } from '../../core/physics';
import { ROADS } from '../../world/layout';
import { Confetti } from '../chests/confetti';
import { ARROWS, arrowTrail, nearestOnPolylines } from './arrowLogic';
import type { ArrowPlace } from './arrowLogic';
import { DOOR_RULES, DoorLock, SHAPES, buttonAt, fromDoorLocal, makeSequence, toDoorLocal } from './doorLogic';
import { STONE, onStone } from './pathLogic';
import type { Stone } from './pathLogic';
import { TREASURE_STAR_Y, VAULT, arrowGeometry, buildButtons, buildPedestal, buildSign, buildVault, haloGeometry, layerBasic, stoneGeometry } from './models';
import type { ButtonsModel, PedestalModel, SignModel, VaultModel } from './models';
import { RING_GLOW } from './models';
import { distanceCull, surfaceMaterial } from './batch';
import { buildRoutes, buildVaults } from './routes';
import type { RouteDef, VaultDef } from './routes';

export { buildRoutes, buildVaults } from './routes';

/** A gem-worthy spot the economy/gem system may use (this module creates no gems). */
export interface SecretSpot {
  /** Absolute world position the item should float at. */
  position: THREE.Vector3;
  /** e.g. `secret-lake-top`, `secret-lake-mid`, `vault-cliff`. */
  tag: string;
}

/** Live array: cleared and refilled by `createSecrets`. */
export const secretRewardSpots: SecretSpot[] = [];

/**
 * Stones collide with the walking player only. Membership = the vehicle bit, so `PhysicsApi.raycast`
 * (camera, gameplay probes) skips them; filter = the avatar bit, so only the player's character
 * controller hits them (cars and props pass through).
 */
export const STONE_GROUPS = groups(GROUP_VEHICLE, GROUP_AVATAR);

export interface SecretsInfo {
  paths: {
    id: string;
    stones: [number, number, number, number][];
    pedestal: [number, number, number, number];
    claimed: boolean;
    lit: number;
    start: [number, number];
  }[];
  doors: {
    id: string;
    x: number;
    y: number;
    z: number;
    yaw: number;
    sequence: number[];
    progress: number;
    open: boolean;
    treasure: boolean;
    misses: number;
    selected: number;
  }[];
  arrows: number;
  trails: { target: string; count: number; visible: boolean; first: [number, number, number] | null; last: [number, number, number] | null }[];
}

/** Test hook (`window.__rgSecrets`, only with `?test=1`). */
export interface SecretsTestApi {
  info(): SecretsInfo;
  /** Our colliders that intersect other colliders (terrain excluded for the vaults). */
  overlaps(): string[];
  /** World x,z to stand on to press button `button` of door `door`. */
  standPoint(door: number, button: number, dist?: number): [number, number];
  /** World x,z inside the vault chamber (by the treasure). */
  insidePoint(door: number): [number, number];
  /** Hide/show our own layer parts (for channel tests that isolate them from gems and keys). */
  setVisible(part: 'stones' | 'arrows' | 'sign' | 'buttons', visible: boolean): void;
}

declare global {
  interface Window {
    __rgSecrets?: SecretsTestApi;
  }
}

interface PathRt {
  def: RouteDef;
  group: THREE.Group;
  stones: THREE.InstancedMesh;
  halos: THREE.InstancedMesh;
  lit: Float32Array;
  lastOn: number;
  pedestal: PedestalModel;
  pedestalCull: THREE.LOD;
  claimed: boolean;
  pop: number;
  spin: number;
  center: THREE.Vector3;
  reach: number;
  colliders: RAPIER.Collider[];
}

interface DoorRt {
  def: VaultDef;
  index: number;
  model: VaultModel;
  cull: THREE.LOD;
  weak: THREE.Group;
  strong: THREE.Group;
  sign: SignModel;
  /** Holds the current sign (it is rebuilt with each new sequence). */
  signHolder: THREE.Group;
  buttons: ButtonsModel;
  starSpin: number;
  /** Last door pose written (x, y), to skip uploads while it rests. */
  doorPose: [number, number];
  buttonScale: Float32Array;
  signScale: Float32Array;
  lock: DoorLock;
  selected: number;
  openT: number;
  wobble: number;
  flash: Float32Array;
  treasure: boolean;
  treasureT: number;
  doorCollider: RAPIER.Collider | null;
  makeDoorCollider: () => RAPIER.Collider;
  colliders: RAPIER.Collider[];
  off: () => void;
}

interface Trail {
  target: string;
  start: number;
  places: (ArrowPlace & { y: number; q: THREE.Quaternion })[];
  key: THREE.Object3D | null;
  visible: boolean;
}

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const MAX_ARROWS = 260;
/** The weak-eye sequence floats in front of the rock, just above the door's lintel. */
const SIGN_Y = VAULT.doorH + 1.75;
const SIGN_Z = 2.3;
/**
 * Draw distances (camera to object, metres; the fog keeps 100–180 m clear, so the big pieces stay
 * on longer). Stones: beyond the path's own radius. The vault's small layer parts (sign, buttons)
 * go first: from 60 m they are a few pixels.
 */
const DRAW = { path: 95, pedestal: 140, vault: 150, vaultLayer: 60 } as const;
/** Animate (and upload) pieces only while the camera is this close. */
const ANIMATE_DIST = 80;

const easeInOut = (t: number): number => t * t * (3 - 2 * t);

export interface Secrets {
  update(dt: number): void;
  dispose(): void;
}

export function createSecrets(ctx: GameContext): Secrets {
  const world = ctx.world;
  const h = (x: number, z: number): number => world.heightAt(x, z);
  secretRewardSpots.length = 0;
  const routes = buildRoutes(h);
  const vaultDefs = buildVaults(h);
  const confetti = new Confetti();
  ctx.scene.add(confetti.group);
  const mine = new Set<number>();
  let time = 0;
  let sessionCount = 0;
  const tmpM = new THREE.Matrix4();
  const tmpQ = new THREE.Quaternion();
  const tmpS = new THREE.Vector3();
  const tmpP = new THREE.Vector3();
  const tmpC = new THREE.Color();

  const own = (c: RAPIER.Collider): RAPIER.Collider => {
    mine.add(c.handle);
    return c;
  };
  const removeCollider = (c: RAPIER.Collider | null): void => {
    if (!c) return;
    mine.delete(c.handle);
    ctx.physics.removeCollider(c);
  };

  // ───────────── paths ─────────────

  const stoneGeo = stoneGeometry();
  const haloGeo = haloGeometry();
  const stoneMat = layerBasic();
  const haloMat = layerBasic({ transparent: true, alpha: true });

  const stoneMatrix = (s: Stone, i: number, pop: number, out: THREE.Matrix4): THREE.Matrix4 => {
    tmpQ.setFromAxisAngle(UP, i * 1.9);
    const k = s.r * (1 + 0.1 * pop);
    return out.compose(tmpP.set(s.x, s.y, s.z), tmpQ, tmpS.set(k, s.r, k));
  };
  const haloMatrix = (s: Stone, pop: number, out: THREE.Matrix4): THREE.Matrix4 => {
    const k = s.r * (1 + 0.25 * pop);
    return out.compose(tmpP.set(s.x, s.y - 0.07, s.z), tmpQ.identity(), tmpS.set(k, 1, k));
  };

  // One lit material for every both-eye secret (pedestals, vault crags, doors, treasure).
  const surfMat = surfaceMaterial();

  const paths: PathRt[] = routes.map((def) => {
    const n = def.stones.length;
    const p = def.pedestal;
    const box = new THREE.Box3();
    for (const s of def.stones) box.expandByPoint(tmpP.set(s.x, s.y, s.z));
    box.expandByPoint(tmpP.set(p.x, p.y, p.z));
    const center = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    const reach = radius + 40;

    // Registered group (name used by tests) → distance cull at the path centre → world-space stones.
    const group = new THREE.Group();
    group.name = `secret-path-${def.id}`;
    const stones = new THREE.InstancedMesh(stoneGeo, stoneMat, n);
    const halos = new THREE.InstancedMesh(haloGeo, haloMat, n);
    halos.renderOrder = 1;
    def.stones.forEach((s, i) => {
      stones.setMatrixAt(i, stoneMatrix(s, i, 0, tmpM));
      halos.setMatrixAt(i, haloMatrix(s, 0, tmpM));
      stones.setColorAt(i, tmpC.setScalar(0.85));
      halos.setColorAt(i, tmpC.setScalar(0.85));
    });
    stones.computeBoundingSphere();
    halos.computeBoundingSphere();
    const inner = new THREE.Group();
    inner.position.copy(center).negate();
    inner.add(halos, stones);
    const cull = distanceCull(inner, radius + DRAW.path);
    cull.position.copy(center);
    group.add(cull);
    ctx.vision.add(group, VisionLayer.WeakOnly);

    const colliders = def.stones.map((s) => {
      const c = ctx.physics.addStaticCylinder(new THREE.Vector3(s.x, s.y - STONE.thickness / 2, s.z), STONE.thickness / 2, s.r * 0.97);
      c.setCollisionGroups(STONE_GROUPS);
      return own(c);
    });

    const pedestal = buildPedestal(p.r, p.floating, p.post, surfMat);
    const pedestalCull = distanceCull(pedestal.mesh, DRAW.pedestal);
    pedestalCull.name = 'secret-pedestal';
    pedestalCull.position.set(p.x, p.y, p.z);
    ctx.scene.add(pedestalCull);
    colliders.push(own(ctx.physics.addStaticCylinder(new THREE.Vector3(p.x, p.y - 0.18, p.z), 0.18, p.r)));

    // Gem-worthy spots: above the pedestal and above the middle stone.
    const mid = def.stones[Math.floor(n / 2)];
    secretRewardSpots.push({ position: new THREE.Vector3(p.x, p.y + 1.3, p.z), tag: `secret-${def.id}-top` });
    secretRewardSpots.push({ position: new THREE.Vector3(mid.x, mid.y + 1.2, mid.z), tag: `secret-${def.id}-mid` });

    const rt: PathRt = { def, group, stones, halos, lit: new Float32Array(n), lastOn: -1, pedestal, pedestalCull, claimed: false, pop: 0, spin: 0, center, reach, colliders };
    poseStar(rt);
    return rt;
  });

  /** Trophy star spin/pop and the floating ring's glow pulse (one CPU re-pose, one small upload). */
  function poseStar(p: PathRt): void {
    const popping = p.pop > 0 && p.pop < 1;
    const popScale = popping ? 1 + 0.6 * Math.sin(Math.PI * Math.min(1, p.pop * 2)) : 1;
    const y = 1.45 + Math.sin(time * 2 + p.def.stones.length) * 0.08 + (popping ? 0.6 * Math.sin(Math.PI * p.pop) : 0);
    const b = p.pedestal.batch;
    b.setMatrix(p.pedestal.star, tmpM.compose(tmpP.set(0, y, 0), tmpQ.setFromAxisAngle(UP, p.spin), tmpS.setScalar(popScale)));
    if (p.pedestal.ring >= 0) b.setSurface(p.pedestal.ring, { ...RING_GLOW, glow: RING_GLOW.glow + 0.25 * Math.sin(time * 3) });
    b.commit();
  }

  function claimPedestal(p: PathRt): void {
    p.claimed = true;
    p.pop = 0.001;
    const ped = p.def.pedestal;
    const ground = Math.max(world.waterLevel, h(ped.x, ped.z));
    confetti.burst(tmpP.set(ped.x, ped.y + 1.3, ped.z), 140);
    ctx.events.emit('stunt', { kind: 'bigAir', value: Math.round(ped.y - ground), stars: 3 });
    ctx.audio.play('fanfare');
    ctx.audio.play('star', { pitch: 1.2 });
    ctx.cameraRig.shake(0.15);
  }

  function updatePaths(dt: number, playing: boolean): void {
    const pl = ctx.player;
    const pp = pl.position;
    const canStand = playing && pl.mode === 'walk';
    const cam = ctx.camera.position;
    for (const p of paths) {
      const near = pp.distanceTo(p.center) < p.reach;
      const stones = p.def.stones;
      let on = -1;
      if (canStand && near && pl.grounded) {
        for (let i = 0; i < stones.length; i++) {
          if (onStone(stones[i], pp.x, pp.y, pp.z)) {
            on = i;
            break;
          }
        }
      }
      if (on >= 0 && on !== p.lastOn) {
        p.lit[on] = 1;
        ctx.audio.play('gemNear', { pitch: 0.85 + (0.7 * on) / Math.max(1, stones.length - 1), volume: 0.55 });
      }
      p.lastOn = on;
      if (near) {
        let moved = false;
        for (let i = 0; i < stones.length; i++) {
          const wasLit = p.lit[i] > 0;
          if (i === on) p.lit[i] = Math.max(p.lit[i], 0.7);
          else if (p.lit[i] > 0) p.lit[i] = Math.max(0, p.lit[i] - dt / 0.9);
          const lit = p.lit[i];
          const pulse = 0.8 + 0.12 * Math.sin(time * 2.2 - i * 0.6);
          const v = Math.min(1, Math.max(pulse, 0.75 + 0.35 * lit));
          p.stones.setColorAt(i, tmpC.setScalar(v));
          p.halos.setColorAt(i, tmpC.setScalar(Math.min(1, pulse + 0.4 * lit)));
          if (wasLit || lit > 0) {
            p.stones.setMatrixAt(i, stoneMatrix(stones[i], i, lit, tmpM));
            p.halos.setMatrixAt(i, haloMatrix(stones[i], lit, tmpM));
            moved = true;
          }
        }
        if (p.stones.instanceColor) p.stones.instanceColor.needsUpdate = true;
        if (p.halos.instanceColor) p.halos.instanceColor.needsUpdate = true;
        if (moved) {
          p.stones.instanceMatrix.needsUpdate = true;
          p.halos.instanceMatrix.needsUpdate = true;
        }
      }
      // Pedestal: spin the trophy, claim on arrival.
      const ped = p.def.pedestal;
      if (!p.claimed && canStand && Math.hypot(pp.x - ped.x, pp.z - ped.z) < ped.r + 0.15 && Math.abs(pp.y - ped.y) < 0.5) {
        claimPedestal(p);
      }
      if (p.pop > 0 && p.pop < 1) p.pop = Math.min(1, p.pop + dt / 1.6);
      p.spin += dt * (p.pop > 0 && p.pop < 1 ? 9 * (1 - p.pop) + 1.2 : 1.2);
      if (cam.distanceTo(p.pedestalCull.position) < ANIMATE_DIST) poseStar(p);
    }
  }

  // ───────────── vaults ─────────────

  const seqSeed = (i: number): number => (ctx.testMode ? 7 + i * 101 + sessionCount * 13 : (Date.now() & 0xffffff) + i * 7919);

  const doors: DoorRt[] = vaultDefs.map((def, index) => {
    const yawQ = new THREE.Quaternion().setFromAxisAngle(UP, def.yaw);
    const model = buildVault(index + 3, def.crag, surfMat);
    const cull = distanceCull(model.mesh, DRAW.vault);
    cull.name = 'secret-vault';
    cull.position.set(def.x, def.y, def.z);
    cull.rotation.y = def.yaw;
    ctx.scene.add(cull);

    const lock = new DoorLock(makeSequence(seqSeed(index)));
    const weak = new THREE.Group();
    weak.name = `vault-${def.id}-weak`;
    weak.position.copy(cull.position);
    weak.rotation.y = def.yaw;
    const sign = buildSign(lock.sequence.map((b) => SHAPES[b]));
    const signHolder = new THREE.Group();
    signHolder.position.set(0, SIGN_Y, SIGN_Z);
    signHolder.add(sign.root);
    weak.add(distanceCull(signHolder, DRAW.vaultLayer));
    ctx.vision.add(weak, VisionLayer.WeakOnly);

    const strong = new THREE.Group();
    strong.name = `vault-${def.id}-strong`;
    strong.position.copy(cull.position);
    strong.rotation.y = def.yaw;
    const tiles = DOOR_RULES.buttonX.map((lx) => {
      const o = fromDoorLocal(def.yaw, lx, 1.75);
      return { x: lx, y: h(def.x + o.x, def.z + o.z) - def.y + 0.1, z: 1.75 };
    });
    const buttons = buildButtons(DOOR_RULES.buttonX, SHAPES, VAULT.buttonY, tiles);
    strong.add(distanceCull(buttons.root, DRAW.vaultLayer));
    ctx.vision.add(strong, VisionLayer.StrongOnly);

    // Colliders (door-local boxes → world).
    const box = (lx: number, ly: number, lz: number, hx: number, hy: number, hz: number): RAPIER.Collider => {
      const o = fromDoorLocal(def.yaw, lx, lz);
      return own(ctx.physics.addStaticBox(new THREE.Vector3(def.x + o.x, def.y + ly, def.z + o.z), new THREE.Vector3(hx, hy, hz), yawQ));
    };
    const V = VAULT;
    const C = def.crag;
    const sideW = (C.halfW - V.halfW) / 2;
    const backD = C.back + V.depth;
    const colliders = [
      box(-(V.halfW + sideW), V.outerTop / 2 - 0.5, (C.back + 0.3) / 2, sideW, V.outerTop / 2, (0.3 - C.back) / 2),
      box(V.halfW + sideW, V.outerTop / 2 - 0.5, (C.back + 0.3) / 2, sideW, V.outerTop / 2, (0.3 - C.back) / 2),
      box(0, (V.h + V.outerTop) / 2, (C.back + 0.3) / 2, V.halfW, (V.outerTop - V.h) / 2, (0.3 - C.back) / 2),
      box(0, V.h / 2 - 0.25, (C.back - V.depth) / 2, V.halfW, V.h / 2 + 0.25, -backD / 2),
    ];
    const makeDoorCollider = (): RAPIER.Collider => box(0, V.doorH / 2, -V.doorT / 2, V.halfW, V.doorH / 2, V.doorT / 2);

    const rt: DoorRt = {
      def,
      index,
      model,
      cull,
      weak,
      strong,
      sign,
      signHolder,
      buttons,
      starSpin: 0,
      doorPose: [0, 0],
      buttonScale: new Float32Array(DOOR_RULES.buttons).fill(1),
      signScale: new Float32Array(3).fill(1),
      lock,
      selected: -1,
      openT: 0,
      wobble: 0,
      flash: new Float32Array(DOOR_RULES.buttons),
      treasure: false,
      treasureT: 0,
      doorCollider: makeDoorCollider(),
      makeDoorCollider,
      colliders,
      off: () => {},
    };

    const prompt: Interactable = {
      id: `vault-${def.id}`,
      position: () => {
        const o = fromDoorLocal(def.yaw, 0, 0.9);
        return new THREE.Vector3(def.x + o.x, def.y + 1.6, def.z + o.z);
      },
      radius: 4.2,
      icon: 'hand',
      enabled: () => !rt.lock.opened && rt.selected >= 0 && ctx.session.state.phase === 'playing',
      onUse: () => press(rt),
    };
    rt.off = ctx.interactions.add(prompt);

    const o = fromDoorLocal(def.yaw, 0, -V.depth * 0.58);
    secretRewardSpots.push({ position: new THREE.Vector3(def.x + o.x, def.y + 1.4, def.z + o.z), tag: `vault-${def.id}` });
    return rt;
  });

  function setLamps(d: DoorRt): void {
    for (let i = 0; i < 3; i++) d.model.setLamp(i, i < d.lock.progress || d.lock.opened);
    d.model.commit();
  }

  function press(d: DoorRt): void {
    const b = d.selected;
    const r = d.lock.press(b);
    if (r === 'ignored') return;
    d.flash[b] = 1;
    if (r === 'correct') {
      ctx.audio.play('star', { pitch: 0.9 + 0.2 * d.lock.progress, volume: 0.8 });
      ctx.audio.play('click');
    } else if (r === 'wrong') {
      d.wobble = 1;
      ctx.audio.play('click');
      ctx.audio.play('boing', { pitch: 0.7, volume: 0.6 });
    } else if (r === 'opened') {
      d.openT = 0.001;
      removeCollider(d.doorCollider);
      d.doorCollider = null;
      ctx.audio.play('chest');
      ctx.audio.play('fanfare');
      ctx.cameraRig.shake(0.25);
    }
    setLamps(d);
  }

  function claimTreasure(d: DoorRt): void {
    d.treasure = true;
    d.treasureT = 0.001;
    const o = fromDoorLocal(d.def.yaw, 0, -VAULT.depth * 0.58);
    confetti.burst(tmpP.set(d.def.x + o.x, d.def.y + 1.4, d.def.z + o.z), 180);
    ctx.events.emit('stunt', { kind: 'bullseye', value: 1, stars: 3 });
    ctx.events.emit('ui:toast', { icon: 'chest' });
    ctx.audio.play('fanfare');
    ctx.audio.play('gem', { pitch: 1.3 });
    ctx.cameraRig.shake(0.2);
  }

  function updateDoors(dt: number, playing: boolean): void {
    const pp = ctx.player.position;
    for (const d of doors) {
      const def = d.def;
      const l = toDoorLocal(def.x, def.z, def.yaw, pp.x, pp.z);
      const levelOk = Math.abs(pp.y - (def.y + 0.0)) < 1.6;
      d.selected = playing && !d.lock.opened && levelOk ? buttonAt(l.x, l.z) : -1;

      // Door wobble (wrong press) and opening.
      if (d.openT > 0 && d.openT < 1) d.openT = Math.min(1, d.openT + dt / 1.5);
      if (d.wobble > 0) d.wobble = Math.max(0, d.wobble - dt * 2.4);
      const w = d.wobble * d.wobble;
      // Opening: a little shudder, then the door sinks into the floor like a portcullis.
      const wob = Math.sin(time * 38) * 0.06 * w + (d.openT > 0 && d.openT < 0.2 ? Math.sin(time * 60) * 0.03 : 0);
      const sink = -VAULT.sink * easeInOut(Math.max(0, (d.openT - 0.12) / 0.88));
      d.signHolder.visible = !d.lock.opened;
      d.signHolder.position.y = SIGN_Y + Math.sin(time * 1.4 + d.index) * 0.06;

      // Treasure: claim when the player steps inside.
      const inside = d.lock.opened && d.openT > 0.5 && l.z < -0.9 && l.z > -VAULT.depth && Math.abs(l.x) < VAULT.halfW && Math.abs(pp.y - def.y) < 2;
      if (playing && inside && !d.treasure) claimTreasure(d);
      if (d.treasureT > 0 && d.treasureT < 1) d.treasureT = Math.min(1, d.treasureT + dt / 1.4);
      const popping = d.treasureT > 0 && d.treasureT < 1;
      d.starSpin += dt * (popping ? 10 : 1.4);
      for (let i = 0; i < d.flash.length; i++) if (d.flash[i] > 0) d.flash[i] = Math.max(0, d.flash[i] - dt * 2.5);

      // Everything below only re-poses vertices: skip it while the camera is far away.
      if (ctx.camera.position.distanceTo(d.cull.position) > ANIMATE_DIST) continue;
      if (wob !== d.doorPose[0] || sink !== d.doorPose[1]) {
        d.model.setDoor(wob, sink);
        d.doorPose[0] = wob;
        d.doorPose[1] = sink;
      }
      d.model.setStar(d.starSpin, TREASURE_STAR_Y + Math.sin(time * 2.2) * 0.06 + (popping ? Math.sin(Math.PI * d.treasureT) * 0.8 : 0), popping ? 1 + 0.5 * Math.sin(Math.PI * d.treasureT) : 1);
      d.model.commit();

      // Weak-eye sign: the shapes light up one after another (1 → 2 → 3, pause), wobble on a miss.
      if (!d.lock.opened) {
        const cycle = (time % 3.4) / 0.85;
        for (let i = 0; i < 3; i++) {
          const target = Math.floor(cycle) === i ? 1.28 : 1;
          d.signScale[i] += (target - d.signScale[i]) * (1 - Math.exp(-10 * dt));
          d.sign.setStep(i, d.signScale[i], Math.sin(time * 40 + i) * 0.08 * w);
        }
        d.sign.commit();
      }

      // Strong-eye buttons (on the door, moving with it) and floor tiles: the selected one stands
      // out, pressed ones flash; buttons go once the door is down, tiles once it is open.
      const buttonsOn = d.openT < 0.98;
      for (let i = 0; i < DOOR_RULES.buttons; i++) {
        const sel = i === d.selected ? 1 : 0;
        const target = 1 + 0.2 * sel + 0.25 * d.flash[i];
        d.buttonScale[i] += (target - d.buttonScale[i]) * (1 - Math.exp(-12 * dt));
        d.buttons.setButton(i, wob, sink, buttonsOn ? d.buttonScale[i] : 0, 0.06 * d.flash[i]);
        d.buttons.setTile(i, d.lock.opened ? 0 : 1 + 0.08 * sel + Math.sin(time * 5) * 0.02 * sel);
      }
      d.buttons.commit();
    }
  }

  // ───────────── arrows ─────────────

  const arrowGeo = arrowGeometry();
  const arrowMat = layerBasic();
  const arrows = new THREE.InstancedMesh(arrowGeo, arrowMat, MAX_ARROWS);
  arrows.count = 0;
  arrows.frustumCulled = false;
  arrows.name = 'secret-arrows';
  ctx.vision.add(arrows, VisionLayer.WeakOnly);
  const trails: Trail[] = [];
  let arrowsPlaced = false;
  const roadLines = ROADS.map((r) => r.points.map((p) => ({ x: p[0], z: p[1] })));

  function surfaceAt(x: number, z: number): number | null {
    const g = h(x, z);
    if (g < world.waterLevel + 0.25 || !world.isLand(x, z)) return null;
    const hit = ctx.physics.raycast(tmpP.set(x, g + 8, z), DOWN, 12);
    if (hit && hit.point.y > g + 0.5) return null; // on a prop or roof: skip this arrow
    return hit ? Math.max(g, hit.point.y) : g;
  }

  function placeTrail(target: string, to: { x: number; z: number }, key: THREE.Object3D | null): void {
    const from = nearestOnPolylines(roadLines, to.x, to.z);
    const places: Trail['places'] = [];
    for (const a of arrowTrail(from, to)) {
      if (arrows.count + places.length >= MAX_ARROWS) break;
      const y = surfaceAt(a.x, a.z);
      if (y === null) continue;
      // Tilt to the ground slope.
      const e = 0.6;
      const n = new THREE.Vector3(h(a.x - e, a.z) - h(a.x + e, a.z), 2 * e, h(a.x, a.z - e) - h(a.x, a.z + e)).normalize();
      const q = new THREE.Quaternion().setFromUnitVectors(UP, n).multiply(new THREE.Quaternion().setFromAxisAngle(UP, a.yaw));
      places.push({ ...a, y, q });
    }
    trails.push({ target, start: arrows.count, places, key, visible: true });
    arrows.count += places.length;
  }

  function placeArrows(): void {
    arrowsPlaced = true;
    for (const p of paths) placeTrail(`path-${p.def.id}`, p.def.start, null);
    // Chest keys live on the same weak layer: find them among our siblings (read-only).
    const keys = arrows.parent ? arrows.parent.children.filter((o) => o.name === 'chest-key') : [];
    keys.forEach((k, i) => placeTrail(`key-${i}`, { x: k.position.x, z: k.position.z }, k));
    writeArrowMatrices();
  }

  function writeArrowMatrices(): void {
    for (const t of trails) {
      t.places.forEach((a, i) => {
        const s = t.visible ? 1 : 0;
        arrows.setMatrixAt(t.start + i, tmpM.compose(tmpP.set(a.x, a.y + 0.1, a.z), a.q, tmpS.set(s, s, s)));
        arrows.setColorAt(t.start + i, tmpC.setScalar(0.8));
      });
    }
    arrows.instanceMatrix.needsUpdate = true;
    if (arrows.instanceColor) arrows.instanceColor.needsUpdate = true;
  }

  function updateArrows(): void {
    if (!arrowsPlaced) placeArrows();
    let dirty = false;
    for (const t of trails) {
      if (!t.key) continue;
      const vis = t.key.visible && t.key.scale.x > 0.9 && !!t.key.parent;
      if (vis !== t.visible) {
        t.visible = vis;
        dirty = true;
      }
    }
    if (dirty) writeArrowMatrices();
    const pp = ctx.player.position;
    for (const t of trails) {
      if (!t.visible || t.places.length === 0) continue;
      const mid = t.places[Math.floor(t.places.length / 2)];
      if (Math.hypot(pp.x - mid.x, pp.z - mid.z) > ARROWS.maxLength + 60) continue;
      // A bright wave runs along the trail toward the target.
      t.places.forEach((a, i) => {
        const ph = (((time * 0.7 - a.t) % 1) + 1) % 1;
        const bump = Math.max(0, 1 - Math.abs(ph - 0.5) * 4);
        arrows.setColorAt(t.start + i, tmpC.setScalar(0.62 + 0.38 * bump));
      });
    }
    if (arrows.instanceColor) arrows.instanceColor.needsUpdate = true;
  }

  // ───────────── session ─────────────

  function resetAll(): void {
    for (const p of paths) {
      p.claimed = false;
      p.pop = 0;
      p.lastOn = -1;
      p.lit.fill(0);
      poseStar(p);
    }
    for (const d of doors) {
      d.lock.reset(makeSequence(seqSeed(d.index)));
      d.openT = 0;
      d.wobble = 0;
      d.flash.fill(0);
      d.treasure = false;
      d.treasureT = 0;
      if (!d.doorCollider) d.doorCollider = d.makeDoorCollider();
      // New sequence → new sign. The door, buttons and tiles go back to rest.
      d.signHolder.remove(d.sign.root);
      d.sign.dispose();
      d.sign = buildSign(d.lock.sequence.map((b) => SHAPES[b]));
      d.signHolder.add(d.sign.root);
      d.signScale.fill(1);
      d.buttonScale.fill(1);
      d.model.setDoor(0, 0);
      d.doorPose[0] = d.doorPose[1] = 0;
      for (let i = 0; i < DOOR_RULES.buttons; i++) {
        d.buttons.setButton(i, 0, 0, 1, 0);
        d.buttons.setTile(i, 1);
      }
      d.buttons.commit();
      setLamps(d);
    }
    confetti.clear();
  }

  const offPhase = ctx.events.on('session:phase', (ev) => {
    if (ev.phase === 'title' || (ev.phase === 'playing' && ev.previous === 'title')) {
      sessionCount++;
      resetAll();
    }
  });

  // ───────────── test hooks ─────────────

  if (ctx.testMode) {
    window.__rgSecrets = {
      info: () => ({
        paths: paths.map((p) => ({
          id: p.def.id,
          stones: p.def.stones.map((s) => [s.x, s.y, s.z, s.r] as [number, number, number, number]),
          pedestal: [p.def.pedestal.x, p.def.pedestal.y, p.def.pedestal.z, p.def.pedestal.r],
          claimed: p.claimed,
          lit: p.lastOn,
          start: [p.def.start.x, p.def.start.z],
        })),
        doors: doors.map((d) => ({
          id: d.def.id,
          x: d.def.x,
          y: d.def.y,
          z: d.def.z,
          yaw: d.def.yaw,
          sequence: d.lock.sequence.slice(),
          progress: d.lock.progress,
          open: d.lock.opened,
          treasure: d.treasure,
          misses: d.lock.misses,
          selected: d.selected,
        })),
        arrows: arrows.count,
        trails: trails.map((t) => {
          const f = t.places[0];
          const l = t.places[t.places.length - 1];
          return {
            target: t.target,
            count: t.places.length,
            visible: t.visible,
            first: f ? ([f.x, f.y, f.z] as [number, number, number]) : null,
            last: l ? ([l.x, l.y, l.z] as [number, number, number]) : null,
          };
        }),
      }),
      overlaps() {
        const out: string[] = [];
        const w = ctx.physics.world;
        const R = ctx.physics.rapier;
        const check = (label: string, c: RAPIER.Collider, ignoreTerrain: boolean): void => {
          w.intersectionsWithShape(
            c.translation(),
            c.rotation(),
            c.shape,
            (other) => {
              if (mine.has(other.handle)) return true;
              const body = other.parent();
              if (body && !body.isFixed()) return true;
              if (ignoreTerrain && other.shape.type === R.ShapeType.HeightField) return true;
              out.push(`${label} × collider ${other.handle} (${R.ShapeType[other.shape.type]}) at ${other.translation().x.toFixed(1)},${other.translation().y.toFixed(1)},${other.translation().z.toFixed(1)}`);
              return true;
            },
          );
        };
        for (const p of paths) p.colliders.forEach((c, i) => check(`${p.def.id}#${i}`, c, false));
        for (const d of doors) [...d.colliders, ...(d.doorCollider ? [d.doorCollider] : [])].forEach((c, i) => check(`vault-${d.def.id}#${i}`, c, true));
        return out;
      },
      standPoint(door, button, dist = 1.75) {
        const d = doors[door];
        const o = fromDoorLocal(d.def.yaw, DOOR_RULES.buttonX[button], dist);
        return [d.def.x + o.x, d.def.z + o.z];
      },
      insidePoint(door) {
        const d = doors[door];
        const o = fromDoorLocal(d.def.yaw, 0, -1.6);
        return [d.def.x + o.x, d.def.z + o.z];
      },
      setVisible(part, visible) {
        if (part === 'stones') for (const p of paths) p.group.visible = visible;
        else if (part === 'arrows') arrows.visible = visible;
        else if (part === 'sign') for (const d of doors) d.weak.visible = visible;
        else for (const d of doors) d.strong.visible = visible;
      },
    };
  }

  return {
    update(dt) {
      time += dt;
      const playing = ctx.session.state.phase === 'playing';
      updatePaths(dt, playing);
      updateDoors(dt, playing);
      updateArrows();
      confetti.update(dt);
    },
    dispose() {
      offPhase();
      for (const p of paths) {
        ctx.vision.remove(p.group);
        ctx.scene.remove(p.pedestalCull);
        p.pedestal.dispose();
        p.stones.dispose();
        p.halos.dispose();
        for (const c of p.colliders) removeCollider(c);
      }
      for (const d of doors) {
        d.off();
        ctx.vision.remove(d.weak);
        ctx.vision.remove(d.strong);
        ctx.scene.remove(d.cull);
        d.model.dispose();
        d.sign.dispose();
        d.buttons.dispose();
        for (const c of d.colliders) removeCollider(c);
        removeCollider(d.doorCollider);
      }
      ctx.vision.remove(arrows);
      arrows.dispose();
      stoneGeo.dispose();
      haloGeo.dispose();
      arrowGeo.dispose();
      stoneMat.dispose();
      haloMat.dispose();
      arrowMat.dispose();
      surfMat.dispose();
      ctx.scene.remove(confetti.group);
      confetti.dispose();
      secretRewardSpots.length = 0;
      if (window.__rgSecrets) delete window.__rgSecrets;
    },
  };
}
