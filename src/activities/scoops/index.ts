/**
 * Scoops, the ice-cream shop (Carnival Island stream K).
 *
 * Walk up to the counter and press E: the hero hops over the counter and builds a cone in 3D —
 * pick a cone, stack up to five scoops (the tower wobbles; rush it and the top topples off with a
 * splat), add a sauce and silly toppings, then chomp it for a funny 30-second effect chosen by the
 * toppings. A friend's recipe card pays bonus gems when matched. The secret topping of the day
 * peeks out of one of three identical shelf jars and is visible ONLY to the weak eye.
 *
 * Controls (through `ctx.input.state` only): move left/right = choose, jump = add, use = next/eat,
 * respawn = leave. The tiles can also be clicked, tapped or dragged up onto the cone.
 * First cone each session is free, then a 3-gem ticket (`ctx.profile` if the economy is present).
 */
import * as THREE from 'three';
import { PLAYER } from '../../config';
import type { Anchor, ExternalController, GameContext, InputState, PlayerApi } from '../../types';
import { ConeView, disposeConeCaches } from './coneView';
import type { ConeState } from './coneView';
import { createCursor } from './cursor';
import { createEffects } from './effects';
import { createFriends } from './friends';
import { CONE } from './ingredients';
import {
  ConeBuilder,
  SCOOPS,
  StackWobble,
  WOBBLE,
  dayNumber,
  effectsFor,
  makeRecipe,
  matchesRecipe,
  recipeProgress,
  rng,
  scoreCone,
  secretOfDay,
  ticketFor,
} from './logic';
import type { BuildSnapshot, ChooseResult, EffectId, Recipe, SecretId, Tile } from './logic';
import { FLOOR, JAR, LAYOUT, buildParlour } from './parlour';
import { createSecretTopping } from './secret';
import { createScoopsUi } from './ui';

export { SCOOPS } from './logic';

/** Where the parlour stands until the main build adds `anchors.iceCream`: between the plaza and Bouncy Park, facing the plaza. */
export const SCOOPS_SITE = { x: 24, z: -2, yaw: -1.22 } as const;

type Phase = 'idle' | 'enter' | 'build' | 'eat' | 'exit';

/** Minimal view of the economy's profile (on `main` after Stream C; absent before). */
interface ProfileLike {
  readonly wallet: number;
  earn(amount: number, reason: 'mission' | 'ticket'): void;
  spend(amount: number, reason: 'ticket'): boolean;
}

export interface ScoopsInfo {
  phase: Phase;
  build: BuildSnapshot | null;
  tiles: Tile[];
  recipe: Recipe | null;
  secret: SecretId;
  effects: { id: EffectId; remaining: number }[];
  site: { x: number; y: number; z: number; yaw: number };
  customer: [number, number, number];
  debris: number;
  cones: number;
  friendsLoaded: boolean;
  lean: number;
}

/** Test hook (`window.__rgScoops`, only with `?test=1`). */
export interface ScoopsTestApi {
  info(): ScoopsInfo;
  /** World position of the secret topping, or null while hidden. */
  secretWorld(): [number, number, number] | null;
  /** Force the secret topping shown/hidden (channel tests); null hands it back to the game. */
  setSecretVisible(v: boolean | null): void;
  setRecipe(r: Recipe): void;
  /** Start effects directly (screenshots). */
  startEffects(list: EffectId[]): void;
}

declare global {
  interface Window {
    __rgScoops?: ScoopsTestApi;
  }
}

export interface Scoops {
  update(dt: number): void;
  dispose(): void;
}

const UP = new THREE.Vector3(0, 1, 0);
const smooth = (t: number): number => t * t * (3 - 2 * t);

export function createScoops(ctx: GameContext): Scoops {
  // ── Site ──
  const anchor = (ctx.world.anchors as Partial<Record<string, Anchor>>).iceCream;
  const sx = anchor?.position.x ?? SCOOPS_SITE.x;
  const sz = anchor?.position.z ?? SCOOPS_SITE.z;
  const yaw = anchor?.yaw ?? SCOOPS_SITE.yaw;
  const groundY = anchor?.position.y ?? ctx.world.heightAt(sx, sz);
  const siteQ = new THREE.Quaternion().setFromAxisAngle(UP, yaw);

  const parlour = buildParlour();
  const group = parlour.group;
  group.position.set(sx, groundY, sz);
  group.quaternion.copy(siteQ);
  ctx.scene.add(group);
  group.updateMatrixWorld(true);
  const inv = group.matrixWorld.clone().invert();
  const toWorld = (v: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 => out.copy(v).applyMatrix4(group.matrixWorld);
  const toLocal = (v: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 => out.copy(v).applyMatrix4(inv);

  const colliders = parlour.colliders.map((c) => {
    const centre = toWorld(c.c);
    return c.kind === 'box' ? ctx.physics.addStaticBox(centre, c.h.clone(), siteQ) : ctx.physics.addStaticCylinder(centre, c.h.y, c.h.x);
  });

  // ── Parts ──
  const counterTop = LAYOUT.holder.y - 0.12;
  const restAt = (x: number, z: number): number => (Math.abs(x) < 3.4 && Math.abs(z - 1.72) < 0.39 ? counterTop + 0.06 : Math.abs(x) < 3.75 && Math.abs(z + 2.45) < 0.36 ? counterTop + 0.06 : FLOOR);
  const coneView = new ConeView(group, restAt);
  coneView.root.position.copy(LAYOUT.holder);
  group.add(coneView.root);
  const today = secretOfDay(dayNumber(Date.now()));
  const secret = createSecretTopping(ctx, today);
  const effects = createEffects(ctx);
  const friends = createFriends(group, ctx.player.characterId);
  const cursor = createCursor();
  group.add(cursor.root);
  const profile = (): ProfileLike | null => (ctx as unknown as { profile?: ProfileLike }).profile ?? null;

  // ── State ──
  let phase: Phase = 'idle';
  let phaseT = 0;
  /** Seconds the idle hero has stood behind the counter (see update). */
  let trappedT = 0;
  let builder: ConeBuilder | null = null;
  let wobble = new StackWobble();
  let recipe: Recipe | null = null;
  let recipeFriend = 0;
  let cones = 0;
  let paid = 0;
  /** Could not pay: a practice cone (no gem prize). */
  let practice = false;
  /** Wallet right after the ticket (the result shows exactly what it gained). */
  let walletStart = 0;
  let seed = ctx.testMode ? 1234 : (Date.now() & 0xffff) + 1;
  let r = rng(seed);
  let lastMove = 0;
  let moveRepeat = 0;
  let dropT = 1;
  let recipeMatched = false;
  let ate: BuildSnapshot | null = null;
  let toastShown = false;
  let secretForced: boolean | null = null;
  /** The jar the secret peeks out of while nobody is building (the next cone starts with it there). */
  let idleJar = Math.floor(r() * SCOOPS.jars);
  let idleShown = false;
  const hopFrom = new THREE.Vector3();
  const hopTo = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const local = new THREE.Vector3();
  const secretTop = new THREE.Vector3();

  // Sprinkle burst from the cannon (a few instanced bits flying to the cone).
  const sprinkleGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.05, 4);
  const sprinkleMat = new THREE.MeshStandardMaterial({ vertexColors: false, color: 0xffffff, roughness: 0.4 });
  const SPR = 24;
  const sprinkles = new THREE.InstancedMesh(sprinkleGeo, sprinkleMat, SPR);
  const sprCols = [0xffffff, 0x2a1a3a, 0xffd93b];
  for (let i = 0; i < SPR; i++) sprinkles.setColorAt(i, new THREE.Color(sprCols[i % 3]));
  sprinkles.count = 0;
  sprinkles.frustumCulled = false;
  group.add(sprinkles);
  let sprT = -1;
  const sprM = new THREE.Matrix4();
  const sprQ = new THREE.Quaternion();
  const sprS = new THREE.Vector3(1, 1, 1);

  // Jars: lid pop animations.
  const jarAnim = [0, 0, 0].map(() => ({ open: 0, want: 0, wobble: 0 }));

  const ui = createScoopsUi(ctx.uiRoot, {
    onTile(i) {
      if (phase !== 'build' || !builder) return;
      builder.select(i);
      act(builder.choose());
    },
    onExit() {
      if (phase === 'build' || phase === 'enter') leave();
    },
  });

  const jarTop = (i: number): THREE.Vector3 => toWorld(tmp.copy(LAYOUT.jar(i)).add(new THREE.Vector3(0, JAR.height + 0.24, 0)), new THREE.Vector3());
  const placeSecret = (instant = false): void => {
    if (!builder || builder.secret) return;
    secret.toJar(builder.secretJar >= 0 && builder.stage !== 'eat' ? jarTop(builder.secretJar) : null, instant);
  };

  const coneState = (): ConeState => ({
    cone: builder?.cone ?? null,
    scoops: builder?.scoops ?? [],
    sauce: builder?.sauce ?? null,
    toppings: builder?.toppings ?? [],
  });

  function renderUi(): void {
    if (!builder) return;
    const tiles = builder.tiles();
    ui.render({
      stage: builder.stage,
      tiles: tiles.map((tile) => ({ tile, enabled: builder!.enabled(tile) })),
      selected: builder.selected,
      scoops: builder.scoops.length,
      device: ctx.input.state.device,
      recipe,
      recipeColor: friends.color(recipeFriend),
      recipeOk: !!recipe && (builder.stage === 'eat' ? matchesRecipe(builder, recipe) : Object.values(recipeProgress(builder, recipe)).every(Boolean)),
    });
  }

  // ── Opening and leaving ──
  function tryOpen(): void {
    if (phase !== 'idle' || ctx.session.state.phase !== 'playing') return;
    const p = profile();
    paid = 0;
    practice = false;
    const economy = (ctx as Partial<GameContext>).economy;
    if (economy) {
      // Through the economy: first cone free, then a ticket; short of gems = a practice cone
      // (no prize). A paid ticket is refunded if the player leaves before eating.
      const price = economy.ticketPrice('scoops');
      const out = economy.rideTicket('scoops');
      if (out === 'paid') paid = price;
      if (out === 'practice') practice = true;
    } else {
      const t = ticketFor(cones, p ? p.wallet : undefined);
      if (!t.ok) {
        ui.showNeed(t.need);
        ctx.audio.play('tick', { pitch: 0.7 });
        return;
      }
      if (t.price > 0 && p) {
        if (!p.spend(t.price, 'ticket')) {
          ui.showNeed(t.price - p.wallet);
          return;
        }
        paid = t.price;
      }
    }
    seed += 1;
    walletStart = p ? p.wallet : 0;
    ui.setPractice(practice);
    r = rng(seed);
    builder = new ConeBuilder(r, idleJar);
    idleJar = Math.floor(r() * SCOOPS.jars);
    idleShown = false;
    wobble = new StackWobble(r);
    recipe = makeRecipe(r);
    recipeFriend = Math.floor(r() * 2);
    recipeMatched = false;
    ate = null;
    toastShown = false;
    coneView.clear();
    coneView.root.position.copy(LAYOUT.holder);
    for (const j of jarAnim) j.want = 0;
    placeSecret(true);
    hopFrom.copy(ctx.player.position);
    hopTo.copy(toWorld(LAYOUT.chef));
    phase = 'enter';
    phaseT = 0;
    ctx.player.setExternalController(controller);
    ctx.player.setAnimation('jump');
    ctx.input.releasePointer();
    ctx.audio.play('start', { volume: 0.6 });
    friends.setQueue(true);
    friends.react('wave');
    ui.show(true);
    renderUi();
  }

  /** R / exit button: hop back out (refund if the cone was not eaten). */
  function leave(): void {
    if (phase !== 'build' && phase !== 'enter') return;
    refund();
    startExit();
  }

  function refund(): void {
    const p = profile();
    if (paid > 0 && p) p.earn(paid, 'ticket');
    paid = 0;
  }

  function startExit(): void {
    phase = 'exit';
    phaseT = 0;
    hopFrom.copy(ctx.player.position);
    hopTo.copy(toWorld(LAYOUT.customer));
    ctx.player.setAnimation('jump');
    ctx.cameraRig.setOverride(null);
    ui.show(false);
    secret.toJar(null);
    friends.setQueue(false);
  }

  /** Clean up without animation (session end, another ride took over, respawn). */
  function reset(): void {
    if (phase === 'build' || phase === 'enter') refund();
    phase = 'idle';
    builder = null;
    idleShown = false;
    ctx.cameraRig.setOverride(null);
    ui.show(false);
    secret.toJar(null);
    secret.onCone(null);
    coneView.clear();
    friends.setQueue(false);
    friends.giveCone(0, null);
    friends.giveCone(1, null);
  }

  // ── Choosing ──
  function act(res: ChooseResult): void {
    if (!builder) return;
    switch (res.type) {
      case 'cone':
        coneView.set(coneState());
        dropT = 0;
        ctx.audio.play('click', { pitch: 1.3 });
        ctx.audio.play('star', { volume: 0.4, pitch: 1.2 });
        break;
      case 'scoop':
        coneView.set(coneState());
        if (wobble.push(res.count)) ctx.audio.play('squeak', { pitch: 0.8, volume: 0.7 }); // uh-oh: it leaned
        dropT = 0;
        ctx.audio.play('boing', { pitch: 1.3 + res.count * 0.12, volume: 0.6 });
        if (res.count === SCOOPS.maxScoops) friends.react('cheer');
        else if (res.count >= 3) friends.react('cheer', res.count % 2);
        break;
      case 'sauce':
        coneView.set(coneState());
        ctx.audio.play('splash', { pitch: 1.8, volume: 0.45 });
        break;
      case 'topping':
        if (res.id === 'sprinkles') {
          sprT = 0;
          ctx.audio.play('whoosh', { pitch: 2, volume: 0.6 });
          setTimeoutSim(0.35, () => coneView.set(coneState()));
        } else {
          coneView.set(coneState());
          ctx.audio.play('star', { pitch: 1.5, volume: 0.5 });
        }
        break;
      case 'jarRight':
        jarAnim[res.index].want = 1;
        jarAnim[res.index].wobble = 1;
        secret.onCone(coneView.topWorld(secretTop));
        ctx.audio.play('key', { pitch: 1.2 });
        ctx.events.emit('glasses:result', { mechanic: 'scoopsSecret', kind: 'read', tier: 1, hit: true });
        friends.react('cheer');
        break;
      case 'jarWrong':
        jarAnim[res.index].want = 1;
        jarAnim[res.index].wobble = 1;
        ctx.audio.play('bump', { pitch: 1.4, volume: 0.6 });
        ctx.audio.play('tick', { pitch: 0.8 });
        ctx.events.emit('glasses:result', { mechanic: 'scoopsSecret', kind: 'read', tier: 1, hit: false });
        placeSecret();
        break;
      case 'stage':
        ctx.audio.play('click', { pitch: 1 });
        if (res.stage === 'eat') startEat();
        else placeSecret();
        break;
      case 'full':
      case 'noop':
        ui.nope();
        ctx.audio.play('tick', { pitch: 0.6, volume: 0.6 });
        break;
    }
    renderUi();
  }

  // A tiny deterministic timer queue (runs on the game clock, so frozen tests stay exact).
  const timers: { t: number; fn: () => void }[] = [];
  function setTimeoutSim(sec: number, fn: () => void): void {
    timers.push({ t: sec, fn });
  }

  function startEat(): void {
    if (!builder) return;
    phase = 'eat';
    phaseT = 0;
    ate = builder.snapshot();
    secret.toJar(null);
    if (builder.secret) secret.onCone(coneView.topWorld(secretTop));
    recipeMatched = !!recipe && matchesRecipe(ate, recipe);
    if (recipeMatched) {
      friends.giveCone(recipeFriend, coneState());
      friends.react('cheer', recipeFriend);
    }
    ui.show(false);
  }

  function finishEat(): void {
    if (!ate) return;
    const score = scoreCone(ate, recipe);
    cones += 1;
    paid = 0;
    const p = profile();
    if (p && !practice) p.earn(score.gems, 'mission');
    ctx.events.emit('stunt', { kind: 'scoops', value: score.stars, stars: score.stars });
    ctx.events.emit('stamp:earned', { id: 'iceCream' });
    ctx.events.emit('ui:toast', { icon: 'check' });
    // Exactly what the wallet got since the ticket: the prize, plus a bonus line for anything else
    // paid meanwhile (a finished mission, a Fun Pass prize).
    const gained = p ? Math.max(0, p.wallet - walletStart) : 0;
    ui.showResult({
      stars: score.stars,
      gems: p && !practice ? score.gems : null,
      recipe: score.recipe,
      secret: score.secret,
      bonus: practice ? 0 : gained - score.gems,
      practice,
    });
    ctx.audio.play('fanfare', { volume: 0.8 });
    ctx.cameraRig.shake(0.2);
    friends.react('dance');
    toastShown = true;
  }

  // ── The ride (ExternalController) ──
  const chefYaw = yaw;
  const controller: ExternalController = {
    update(dt: number, input: Readonly<InputState>): boolean {
      phaseT += dt;
      const pl: PlayerApi = ctx.player;
      if (phase === 'enter' || phase === 'exit') {
        const dur = 0.75;
        const k = Math.min(1, phaseT / dur);
        const e = smooth(k);
        pl.position.lerpVectors(hopFrom, hopTo, e);
        pl.position.y += Math.sin(k * Math.PI) * 1.35;
        const faceIn = yaw + Math.PI;
        pl.yaw = phase === 'enter' ? faceIn + (k > 0.6 ? (k - 0.6) / 0.4 : 0) * Math.PI : chefYaw;
        pl.setAnimation(k < 0.85 ? 'jump' : 'idle');
        if (k >= 1) {
          if (phase === 'enter') {
            phase = 'build';
            phaseT = 0;
            pl.yaw = chefYaw;
            ctx.audio.play('land', { volume: 0.5 });
            ctx.cameraRig.setOverride({ distance: 3.9, height: 1.9, fov: 54, yawOffset: Math.PI });
          } else {
            phase = 'idle';
            builder = null;
            secret.onCone(null);
            coneView.clear();
            friends.giveCone(0, null);
            friends.giveCone(1, null);
            ctx.audio.play('land', { volume: 0.5 });
            if (ate) effects.start(effectsFor(ate, today));
            ate = null;
            return false;
          }
        }
        return true;
      }
      if (phase === 'build' && builder) {
        pl.position.copy(hopTo);
        pl.yaw = chefYaw;
        pl.setAnimation('idle');
        if (input.respawnPressed) {
          leave();
          return true;
        }
        // Left/right with auto-repeat while held.
        const mx = Math.abs(input.moveX) > 0.5 ? Math.sign(input.moveX) : 0;
        if (mx !== 0 && (mx !== lastMove || moveRepeat <= 0)) {
          builder.move(mx);
          moveRepeat = mx !== lastMove ? 0.38 : 0.16;
          ctx.audio.play('click', { pitch: 1.6, volume: 0.35 });
          renderUi();
        }
        lastMove = mx;
        moveRepeat -= dt;
        if (input.jumpPressed) act(builder.choose());
        else if (input.usePressed) act(builder.next());
        return true;
      }
      if (phase === 'eat' && builder) {
        pl.position.copy(hopTo);
        pl.yaw = chefYaw;
        // Lift the cone to the mouth, three big chomps, a gulp, then hop out.
        const mouthY = FLOOR + PLAYER.height * 0.78 * pl.object.scale.y;
        const lift = smooth(Math.min(1, phaseT / 0.6));
        coneView.root.position.set(
          LAYOUT.holder.x + (LAYOUT.chef.x + 0.08 - LAYOUT.holder.x) * lift,
          LAYOUT.holder.y + (mouthY - LAYOUT.holder.y - CONE.height * 0.9 - (coneState().scoops.length * CONE.step) * 0.5) * lift,
          LAYOUT.holder.z + (LAYOUT.chef.z + 0.42 - LAYOUT.holder.z) * lift,
        );
        const bites = [0.9, 1.45, 2.0];
        const bitten = bites.filter((b) => phaseT >= b).length;
        const prevBitten = bites.filter((b) => phaseT - dt >= b).length;
        coneView.setEaten(bitten / 3);
        if (recipeMatched) friends.setEaten(recipeFriend, bitten / 3);
        if (bitten > prevBitten) {
          ctx.audio.play('bump', { pitch: 1.5 + bitten * 0.1, volume: 0.8 });
          ctx.audio.play('click', { pitch: 0.7 });
          ctx.cameraRig.shake(0.12);
          if (bitten === 3) secret.onCone(null);
        }
        // Chomp squash: a quick squash-and-stretch after each bite.
        const since = Math.min(...bites.map((b) => (phaseT >= b ? phaseT - b : 9)));
        pl.setVisualStretch(since < 0.3 ? -Math.sin((since / 0.3) * Math.PI) * 0.22 : 0);
        pl.setAnimation(phaseT > 2.3 ? 'cheer' : 'idle');
        if (phaseT >= 2.4 && !toastShown) finishEat();
        if (phaseT >= 3.6) {
          pl.setVisualStretch(0);
          startExit();
        }
        return true;
      }
      return phase !== 'idle';
    },
    onRelease() {
      if (phase !== 'idle') reset();
    },
  };

  // ── Interaction ──
  const promptPos = toWorld(LAYOUT.prompt);
  const removeInteract = ctx.interactions.add({
    id: 'scoops-counter',
    position: () => promptPos,
    radius: 2.4,
    icon: 'hand',
    enabled: () => phase === 'idle' && ctx.session.state.phase === 'playing' && ctx.player.mode === 'walk',
    onUse: tryOpen,
  });

  // A new session: the first cone is free again.
  const offPhase = ctx.events.on('session:phase', (e) => {
    if (e.phase === 'playing' && e.previous === 'title') cones = 0;
    if (e.phase === 'title' || e.phase === 'ended') {
      if (phase !== 'idle') ctx.player.setExternalController(null);
      reset();
      effects.clear();
    }
  });

  if (ctx.testMode) {
    window.__rgScoops = {
      info: () => ({
        phase,
        build: builder ? builder.snapshot() : null,
        tiles: builder ? builder.tiles() : [],
        recipe,
        secret: today,
        effects: effects.active(),
        site: { x: sx, y: groundY, z: sz, yaw },
        customer: toWorld(LAYOUT.customer).toArray() as [number, number, number],
        debris: coneView.debris,
        cones,
        friendsLoaded: friends.loaded,
        lean: wobble.lean(),
      }),
      secretWorld: () => (secret.group.visible ? (secret.group.getWorldPosition(new THREE.Vector3()).toArray() as [number, number, number]) : null),
      setSecretVisible(v) {
        secretForced = v;
        if (v !== null) secret.group.visible = v;
      },
      setRecipe(rc) {
        recipe = rc;
        renderUi();
      },
      startEffects(list) {
        effects.start(list);
      },
    };
  }

  return {
    update(dt) {
      // Far away and idle: nothing to do but the effects (which follow the player anywhere).
      toLocal(ctx.player.position, local);
      const near = local.lengthSq() < 45 * 45 || phase !== 'idle';
      effects.update(dt);
      ui.setEffects(effects.active());
      // The friends' character models load only once the game is on (not behind the title screen),
      // in test mode too, so the boot request budget (npm run boot:requests) holds there.
      friends.update(dt, local, near && ctx.session.state.phase !== 'title');
      if (!near) return;

      // Behind the counter is a closed room (counter, walls, 0.45 m slits): a hero who got in there
      // without building (pushed or jumped over, QA round 5 M1) hops back out to the customer side.
      if (phase === 'idle' && ctx.player.mode === 'walk' && Math.abs(local.x) < 3.85 && local.z > -2.95 && local.z < 1.3 && local.y > -0.5 && local.y < FLOOR + 1.6) {
        trappedT += dt;
        if (trappedT > 0.5) {
          trappedT = 0;
          ate = null;
          hopFrom.copy(ctx.player.position);
          hopTo.copy(toWorld(LAYOUT.customer));
          phase = 'exit';
          phaseT = 0;
          ctx.player.setExternalController(controller);
          ctx.player.setAnimation('jump');
        }
      } else trappedT = 0;

      for (let i = timers.length - 1; i >= 0; i--) {
        timers[i].t -= dt;
        if (timers[i].t <= 0) {
          const fn = timers[i].fn;
          timers.splice(i, 1);
          fn();
        }
      }

      // Wobble and topple.
      if (builder && (phase === 'build' || phase === 'eat')) {
        const n = builder.scoops.length;
        const lx = wobble.x;
        const lz = wobble.z;
        if (phase === 'build' && wobble.step(dt, n)) {
          const drop = n - WOBBLE.keep;
          coneView.topple(drop, lx, lz);
          builder.dropTop(drop);
          coneView.set(coneState());
          ctx.audio.play('splash', { pitch: 1.3 });
          ctx.audio.play('flop', { pitch: 1.4, volume: 0.6 });
          ctx.cameraRig.shake(0.25);
          friends.react('laugh');
          renderUi();
        }
        coneView.setLean(wobble.x, wobble.z);
      }
      // New piece drops onto the stack with a little bounce.
      if (dropT < 1) {
        dropT = Math.min(1, dropT + dt / 0.22);
        const s = 1 + Math.sin(dropT * Math.PI) * 0.12;
        coneView.root.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
      } else coneView.root.scale.set(1, 1, 1);
      coneView.update(dt);

      // Secret topping rides on the cone once found.
      if (builder?.secret && phase !== 'idle' && !(phase === 'eat' && phaseT > 2.0)) secret.onCone(coneView.topWorld(secretTop));
      // While nobody builds, the day's secret peeks out of a jar for the weak eye (a reason to come in).
      if (phase === 'idle' && !idleShown) {
        secret.onCone(null);
        secret.toJar(jarTop(idleJar), true);
        idleShown = true;
      }
      if (secretForced !== null) secret.group.visible = secretForced;
      secret.update(dt);

      // Jar lids.
      jarAnim.forEach((j, i) => {
        if (phase === 'idle' || phase === 'exit') j.want = 0;
        j.open += (j.want - j.open) * (1 - Math.exp(-10 * dt));
        j.wobble = Math.max(0, j.wobble - dt * 1.6);
        parlour.setJar(i, j.open, j.wobble);
      });

      // Sprinkles cannon burst.
      if (sprT >= 0) {
        sprT += dt;
        const k = Math.min(1, sprT / 0.4);
        sprinkles.count = sprT < 0.6 ? SPR : 0;
        const from = LAYOUT.cannon;
        const to = coneView.topWorld(tmp);
        toLocal(to, to);
        for (let i = 0; i < SPR; i++) {
          const kk = Math.min(1, k * (0.8 + (i % 5) * 0.08));
          const spread = 0.12 * Math.sin(i * 2.3);
          sprQ.setFromAxisAngle(UP, i);
          sprM.compose(
            tmp2.set(from.x + (to.x - from.x) * kk + spread, from.y + 0.25 + (to.y - from.y - 0.25) * kk + Math.sin(kk * Math.PI) * 0.35, from.z + (to.z - from.z) * kk + spread * 0.5),
            sprQ,
            sprS,
          );
          sprinkles.setMatrixAt(i, sprM);
        }
        sprinkles.instanceMatrix.needsUpdate = true;
        if (sprT > 0.6) sprT = -1;
      }

      // Keep the build UI in step with the input device; point the 3D arrow at the selection.
      if (phase === 'build' && builder) {
        renderUi();
        cursor.point(builder.current(), toLocal(coneView.topWorld(tmp), tmp));
      } else cursor.point(null, tmp);
      cursor.update(dt);
      if (phase === 'idle' && ctx.player.mode !== 'external') coneView.root.position.copy(LAYOUT.holder);
    },
    dispose() {
      if (phase !== 'idle') ctx.player.setExternalController(null);
      removeInteract();
      offPhase();
      for (const c of colliders) ctx.physics.removeCollider(c);
      effects.dispose();
      friends.dispose();
      secret.dispose();
      coneView.dispose();
      ui.dispose();
      cursor.dispose();
      parlour.dispose();
      group.removeFromParent();
      sprinkleGeo.dispose();
      sprinkleMat.dispose();
      disposeConeCaches();
      if (window.__rgScoops) delete window.__rgScoops;
    },
  };
}
