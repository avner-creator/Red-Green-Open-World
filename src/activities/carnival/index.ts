/**
 * Carnival games row (Stream J): five striped booths on the village side street, each with a
 * friendly stall-keeper, played against two friends (the other heroes as cheerful AI rivals).
 *
 * Flow per booth: E at the counter → ticket (first play per booth per session free, then
 * TICKET_PRICE gems; never blocks free fun elsewhere) → 3-2-1 with pictograms → 30-ish s round →
 * result card (podium, stars, gems, plush on the shelf if you won) → E replay / R exit. R always
 * leaves safely. The glasses twist of each game lives in the weak-eye layer only.
 */
import * as THREE from 'three';
import { VisionLayer } from '../../types';
import type { Anchor, ExternalController, GameContext, InputState, Interactable, PlayerAnim } from '../../types';
import { asShadowProxy, shadowProxyWatcher } from '../../core/shadow-proxy';
import { CHARACTERS } from '../../core/characters/catalog';
import { buildRow } from './booths';
import { CarnivalFx } from './fx';
import { Friends } from './friends';
import { createBalloonPop } from './games/balloonPop';
import { createDuckPond } from './games/duckPond';
import { createGlowDodge } from './games/glowDodge';
import { createRingToss } from './games/ringToss';
import { createStrengthBell } from './games/strengthBell';
import type { BoothGame, GameEnv, GameFactory, RoundApi } from './games/types';
import { CarnivalHud } from './hud';
import type { Contestant } from './hud';
import { Keepers } from './keepers';
import { kitMaterial } from './kit';
import { ACTIVE_RANGE, BOOTH_FRONT_Z, DECK_H, BOOTH_X, FRIEND_SPOTS, GAME_IDS, STAND_Z, resolveSite } from './layout';
import type { GameId, SiteSpec } from './layout';
import { createPictoAtlas } from './picto';
import { PlushShelf } from './plush';
import { TICKET_PRICE, resultOf, walletOf } from './round';
import type { ProfileLike, RoundResult, TicketOutcome } from './round';
import { makeRng } from './rng';
import type { Rng } from './rng';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** One game per booth. */
const FACTORIES: Record<GameId, GameFactory> = {
  balloonPop: createBalloonPop,
  ringToss: createRingToss,
  duckPond: createDuckPond,
  glowDodge: createGlowDodge,
  strengthBell: createStrengthBell,
};

const COUNTDOWN = 3;
const RESULT_TIMEOUT = 25;

type Phase = 'count' | 'play' | 'result';

export interface CarnivalInfo {
  site: SiteSpec & { y: number };
  booths: { id: GameId; playable: boolean; stand: [number, number, number]; yaw: number }[];
  active: GameId | null;
  phase: Phase | null;
  scores: number[];
  result: RoundResult | null;
  plush: number;
  freeUsed: string[];
}

/** Test hook (`window.__rgCarnival`, only with `?test=1`). */
export interface CarnivalTestApi {
  info(): CarnivalInfo;
  /** Same as pressing E at the booth (the player is moved there first). */
  start(id: GameId): TicketOutcome | 'busy' | 'missing';
  /** The game plays itself well (aim + presses) — for e2e rounds. */
  autopilot(on: boolean): void;
  replay(): void;
  exit(): void;
  /** Booth-frame point of a booth → world [x, y, z]. */
  boothPoint(id: GameId, x: number, y: number, z: number): [number, number, number];
}

declare global {
  interface Window {
    __rgCarnival?: CarnivalTestApi;
  }
}

export interface Carnival {
  update(dt: number): void;
  dispose(): void;
}

function profileOf(ctx: GameContext): ProfileLike | null {
  const p = (ctx as unknown as { profile?: ProfileLike }).profile;
  return p && typeof p === 'object' ? p : null;
}

function contestantOf(id: string, me: boolean): Contestant {
  const def = CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
  return { name: def.name, colors: def.cardColors, me };
}

class Round implements RoundApi {
  t = 0;
  left = Infinity;
  scores = [0, 0, 0];
  aim = { yaw: 0, pitch: 0 };
  readonly playerOffset = new THREE.Vector3();
  readonly friendSpots = FRIEND_SPOTS.map(([x, z]) => new THREE.Vector3(x, 0, z));
  finished = false;
  anim: PlayerAnim = 'idle';
  animHold = 0;
  stretch = 0;
  constructor(
    readonly rng: Rng,
    private readonly host: {
      onScore(who: number, pts: number): void;
      friendAct(i: number, anim: PlayerAnim | 'emote', hold: number): void;
      meter(v: number | null, mark: number | null): void;
      keeperCheer(big: boolean): void;
    },
  ) {}
  score(who: number, points: number): void {
    if (points <= 0 || who < 0 || who > 2) return;
    this.scores[who] += points;
    this.host.onScore(who, points);
  }
  friendAct(i: number, anim: PlayerAnim | 'emote', hold = 0.8): void {
    this.host.friendAct(i, anim, hold);
  }
  friendPos(i: number): THREE.Vector3 {
    return this.friendSpots[i];
  }
  playerAct(anim: PlayerAnim, hold = 0.6): void {
    this.anim = anim;
    this.animHold = hold;
  }
  playerStretch(s: number): void {
    this.stretch = s;
  }
  meter(v: number | null, mark: number | null = null): void {
    this.host.meter(v, mark);
  }
  finish(): void {
    this.finished = true;
  }
  keeperCheer(big = false): void {
    this.host.keeperCheer(big);
  }
}

export function createCarnival(ctx: GameContext): Carnival {
  const site = resolveSite(ctx.world.anchors as Readonly<Record<string, Anchor | undefined>>);
  const siteY = ctx.world.heightAt(site.x, site.z);
  const root = new THREE.Group();
  root.name = 'carnival-row';
  root.position.set(site.x, siteY + DECK_H, site.z);
  root.rotation.y = site.yaw;
  ctx.scene.add(root);
  root.updateMatrixWorld(true);
  const siteQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), site.yaw);

  // ── Static row: one vertex-colour mesh, one sign mesh, one merged shadow proxy, colliders.
  const row = buildRow();
  const proxyGeo = mergeGeometries(row.proxies, false) ?? new THREE.BoxGeometry(0, 0, 0);
  for (const g of row.proxies) g.dispose();
  const proxy = asShadowProxy(new THREE.Mesh(proxyGeo));
  proxy.name = 'carnival-shadow-proxy';
  root.add(proxy);
  const watchShadows = shadowProxyWatcher(ctx.scene);
  const colliders = row.colliders.map((b) => ctx.physics.addStaticBox(root.localToWorld(b.center.clone()), b.half, siteQuat));

  const keepers = new Keepers();
  root.add(keepers.group);
  const plush = new PlushShelf(!ctx.testMode);
  root.add(plush.mesh);
  const friends = new Friends(root);
  const fx = new CarnivalFx(ctx);
  const hud = new CarnivalHud(ctx.uiRoot);

  // ── Booth games.
  const games = new Map<GameId, { game: BoothGame; booth: THREE.Group; weak: THREE.Group }>();
  for (const id of GAME_IDS) {
    const make = FACTORIES[id];
    if (!make) continue;
    const booth = new THREE.Group();
    booth.name = `carnival-${id}`;
    booth.position.set(BOOTH_X[id], 0, BOOTH_FRONT_Z);
    root.add(booth);
    booth.updateMatrixWorld(true);
    const weak = new THREE.Group();
    weak.name = `carnival-${id}-weak`;
    weak.matrixAutoUpdate = false;
    weak.matrix.copy(booth.matrixWorld);
    ctx.vision.add(weak, VisionLayer.WeakOnly);
    const boothM = new THREE.Matrix4().makeTranslation(BOOTH_X[id], 0, BOOTH_FRONT_Z);
    const env: GameEnv = {
      ctx,
      booth,
      weak,
      fx,
      toWorld: (v) => booth.localToWorld(v),
      addStatic: (geo, color, m, selfLit = 0) => void row.kit.add(geo, color, boothM.clone().multiply(m), selfLit),
      addSign: (picto, m, size = 1) => row.signs.add(picto, boothM.clone().multiply(m), size),
    };
    games.set(id, { game: make(env), booth, weak });
  }
  const atlas = createPictoAtlas();
  const signMat = new THREE.MeshBasicMaterial({ map: atlas });
  const signMesh = new THREE.Mesh(row.signs.build(), signMat);
  signMesh.name = 'carnival-signs';
  root.add(signMesh);
  const rowMat = kitMaterial();
  const rowMesh = new THREE.Mesh(row.kit.build(), rowMat);
  rowMesh.name = 'carnival-booths';
  rowMesh.userData.cameraOccluder = true; // static: the chase camera stops at awnings and walls
  rowMesh.castShadow = false;
  rowMesh.receiveShadow = true;
  root.add(rowMesh);

  const boothWorld = (id: GameId, x: number, y: number, z: number): THREE.Vector3 =>
    root.localToWorld(new THREE.Vector3(BOOTH_X[id] + x, y, BOOTH_FRONT_Z + z));

  // ── Round state.
  const freeUsed = new Set<string>();
  let active: {
    id: GameId;
    game: BoothGame;
    phase: Phase;
    t: number;
    round: Round;
    result: RoundResult | null;
    contestants: Contestant[];
    exitRequested: boolean;
    goT: number;
    /** Could not pay: a practice round (no prize). */
    practice: boolean;
  } | null = null;
  let autopilot = false;
  let seed = 1;

  const keeperOf = (): GameId | null => active?.id ?? null;

  const newRound = (): Round =>
    new Round(makeRng(ctx.testMode ? 7 + seed++ : (Date.now() ^ (seed++ * 7919)) >>> 0), {
      onScore(who, pts) {
        if (!active) return;
        hud.setScores(active.round.scores);
        if (who === 0) {
          hud.popPoints(pts);
          ctx.audio.play('star', { volume: 0.5, pitch: 1 + Math.min(0.6, pts * 0.12) });
        }
        keepers.cheer(active.id);
      },
      friendAct(i, anim, hold) {
        friends.act(i, anim, hold);
      },
      meter(v, mark) {
        hud.setMeter(v, mark);
      },
      keeperCheer(big) {
        const id = keeperOf();
        if (id) keepers.cheer(id, big);
      },
    });

  const placeFriends = (): void => {
    if (!active) return;
    const fs = active.round.friendSpots;
    fs.forEach((p, i) => friends.place(i, BOOTH_X[active!.id] + p.x, p.y, BOOTH_FRONT_Z + p.z, Math.PI));
  };

  const cleanup = (): void => {
    if (!active) return;
    const a = active;
    active = null;
    if (a.phase === 'play') a.game.end(a.round);
    hud.hide();
    friends.setVisible(false);
    ctx.cameraRig.setOverride(null);
    ctx.player.setVisualStretch(0);
    // Back on the midway, facing the booth (a safe, flat spot).
    const stand = boothWorld(a.id, 0, 0, STAND_Z + 0.3);
    ctx.player.teleport(stand, site.yaw + Math.PI);
  };

  const finishRound = (): void => {
    if (!active) return;
    const a = active;
    a.game.end(a.round);
    const s = a.round.scores;
    const r = resultOf(s[0], [s[1], s[2]], a.game.thresholds);
    a.result = r;
    a.phase = 'result';
    a.t = 0;
    a.round.meter(null);
    const profile = profileOf(ctx);
    if (a.practice) r.gems = 0;
    try {
      if (r.gems > 0) profile?.earn?.(r.gems, 'mission');
    } catch (err) {
      console.warn('carnival: earn failed', err);
    }
    if (r.won) plush.add(a.id);
    ctx.events.emit('stunt', { kind: 'carnival', value: s[0], stars: r.stars });
    ctx.events.emit('stamp:earned', { id: 'carnivalRow' });
    ctx.events.emit('ui:toast', { icon: 'gem', text: `+${r.gems}` });
    ctx.audio.play(r.won ? 'fanfare' : 'chest');
    const burst = boothWorld(a.id, 0, 2.2, 0.4);
    fx.burst(burst, r.won ? 140 : 60);
    keepers.cheer(a.id, true);
    a.round.playerAct(r.won ? 'dance' : 'cheer', 3);
    // Friends are good sports: whoever won dances, everyone else cheers.
    for (let i = 0; i < 2; i++) friends.act(i, !r.won && s[i + 1] === Math.max(s[1], s[2]) ? 'emote' : 'cheer', 2.5);
    hud.showResult(r, a.contestants, s, r.won, ctx.input.state.device);
  };

  const beginCountdown = (): void => {
    if (!active) return;
    const round = newRound();
    active.round = round;
    active.phase = 'count';
    active.t = 0;
    active.result = null;
    active.goT = 0;
    round.left = active.game.duration > 0 ? active.game.duration : Infinity;
    hud.show(active.contestants);
    hud.setTime(active.game.duration > 0 ? 1 : null);
    placeFriends();
    ctx.audio.play('tick');
  };

  const ticket = (id: GameId): TicketOutcome => {
    // Through the economy: first carnival play per session free, then a ticket; a child who
    // cannot pay plays a practice round (no prize). The economy emits ticket:paid / ticket:denied.
    freeUsed.add(id);
    const economy = (ctx as Partial<GameContext>).economy;
    const out = economy ? economy.rideTicket('carnival') : 'free';
    if (out === 'practice') {
      const have = walletOf(profileOf(ctx));
      ctx.events.emit('ui:toast', { icon: 'gem', text: `${have ?? 0}/${TICKET_PRICE}` });
      keepers.cheer(id);
    }
    return out;
  };

  const controller: ExternalController = {
    update(dt, realInput) {
      const a = active;
      if (!a) return false;
      if (a.exitRequested) return false;
      let input: Readonly<InputState> = realInput;
      if (autopilot && a.phase === 'play') input = { ...realInput, ...a.game.autopilot(dt, a.round) };
      if (realInput.respawnPressed || (a.phase === 'result' && realInput.flopPressed)) return false;

      // Aim (camera follows the player's yaw).
      const lim = a.game.aimLimits;
      const r = a.round;
      if (lim && a.phase !== 'result' && !autopilot) {
        r.aim.yaw = THREE.MathUtils.clamp(r.aim.yaw - input.lookX - input.moveX * 1.1 * dt, -lim.yaw, lim.yaw);
        r.aim.pitch = THREE.MathUtils.clamp(r.aim.pitch - input.lookY + input.moveY * 0.9 * dt, lim.pitchMin, lim.pitchMax);
      } else if (!lim) {
        r.aim.yaw = 0;
        r.aim.pitch = 0;
      }

      a.t += dt;
      if (a.phase === 'count') {
        const n = Math.ceil(COUNTDOWN - a.t);
        const before = Math.ceil(COUNTDOWN - (a.t - dt));
        if (n !== before && n > 0) ctx.audio.play('tick');
        hud.setCount(Math.max(0, n), a.id, a.game.how, ctx.input.state.device);
        if (a.t >= COUNTDOWN) {
          a.phase = 'play';
          a.t = 0;
          a.goT = 0.7;
          r.t = 0;
          ctx.audio.play('start');
          a.game.begin(r);
        }
      } else if (a.phase === 'play') {
        if (a.goT > 0) {
          a.goT -= dt;
          hud.setCount(a.goT > 0 ? 0 : null, a.id, a.game.how, ctx.input.state.device);
        }
        r.t += dt;
        const dur = a.game.duration;
        if (dur > 0) {
          r.left = Math.max(0, dur - r.t);
          hud.setTime(r.left / dur);
        }
        a.game.update(dt, input, r);
        if (r.finished || (dur > 0 && r.t >= dur)) finishRound();
      } else {
        const go = a.t > 0.9 && (realInput.usePressed || realInput.jumpPressed);
        if (go) replay();
        else if (a.t > RESULT_TIMEOUT) return false;
      }
      if (!active) return false;

      // Pose the player at the stand spot (+ the game's offset), facing into the booth.
      if (r.animHold > 0) {
        r.animHold -= dt;
        if (r.animHold <= 0) r.anim = 'idle';
      }
      const p = boothWorld(a.id, r.playerOffset.x, r.playerOffset.y, STAND_Z + r.playerOffset.z);
      ctx.player.position.copy(p);
      ctx.player.yaw = site.yaw + Math.PI + r.aim.yaw;
      ctx.player.setAnimation(r.anim);
      ctx.player.setVisualStretch(r.stretch);
      placeFriends();
      return true;
    },
    onRelease() {
      cleanup();
    },
  };

  function startGame(id: GameId): TicketOutcome | 'busy' | 'missing' {
    const entry = games.get(id);
    if (!entry) return 'missing';
    if (active || ctx.session.state.phase !== 'playing' || ctx.player.mode !== 'walk') return 'busy';
    const out = ticket(id);
    if (out === 'short') return out;
    const me = ctx.player.characterId;
    const fl = friends.prepare(me);
    active = {
      id,
      game: entry.game,
      phase: 'count',
      t: 0,
      round: newRound(),
      result: null,
      contestants: [contestantOf(me, true), ...fl.map((f) => contestantOf(f.def.id, false))],
      exitRequested: false,
      goT: 0,
      practice: out === 'practice',
    };
    friends.setVisible(true);
    for (let i = 0; i < 2; i++) friends.act(i, 'wave', 1.2);
    ctx.audio.play('click');
    ctx.player.setExternalController(controller);
    const c = entry.game.camera;
    ctx.cameraRig.setOverride({ distance: c.distance, height: c.height, fov: c.fov, lookAhead: c.lookAhead, yawOffset: 0 });
    beginCountdown();
    return out;
  }

  function replay(): void {
    if (!active || active.phase !== 'result') return;
    const out = ticket(active.id);
    if (out === 'short') {
      active.exitRequested = true;
      return;
    }
    active.practice = out === 'practice';
    ctx.audio.play('click');
    beginCountdown();
  }

  function exit(): void {
    if (!active) return;
    if (ctx.player.mode === 'external') ctx.player.setExternalController(null);
    cleanup();
  }

  hud.onReplay = () => replay();
  hud.onExit = () => {
    if (active) active.exitRequested = true;
  };

  // ── E prompts at each playable booth.
  const removers = [...games.keys()].map((id) => {
    const at = boothWorld(id, 0, 1.25, 0.6);
    const target: Interactable = {
      id: `carnival-${id}`,
      position: () => at,
      radius: 2.6,
      icon: id === 'balloonPop' ? 'balloon' : 'star',
      enabled: () => active === null,
      onUse: () => void startGame(id),
    };
    return ctx.interactions.add(target);
  });

  const offPhase = ctx.events.on('session:phase', (e) => {
    if (e.phase === 'playing' && e.previous === 'title') freeUsed.clear();
    if ((e.phase === 'ended' || e.phase === 'title') && active) exit();
  });

  if (ctx.testMode) {
    window.__rgCarnival = {
      info() {
        return {
          site: { ...site, y: siteY },
          booths: GAME_IDS.map((id) => {
            const s = boothWorld(id, 0, 0, STAND_Z);
            return { id, playable: games.has(id), stand: [s.x, s.y, s.z] as [number, number, number], yaw: site.yaw + Math.PI };
          }),
          active: active?.id ?? null,
          phase: active?.phase ?? null,
          scores: active ? [...active.round.scores] : [],
          result: active?.result ?? null,
          plush: plush.count,
          freeUsed: [...freeUsed],
        };
      },
      start(id) {
        const s = boothWorld(id, 0, 0, STAND_Z);
        if (!active) ctx.player.teleport(s, site.yaw + Math.PI);
        return startGame(id);
      },
      autopilot(on) {
        autopilot = on;
      },
      replay,
      exit,
      boothPoint(id, x, y, z) {
        const v = boothWorld(id, x, y, z);
        return [v.x, v.y, v.z];
      },
    };
  }

  const local = new THREE.Vector3();
  return {
    update(dt) {
      watchShadows(dt);
      if (ctx.session.state.phase === 'paused') return;
      local.copy(ctx.player.position);
      root.worldToLocal(local);
      const dist = Math.hypot(local.x, local.z);
      const near = dist < ACTIVE_RANGE;
      if (!near && !active) return;
      // Stream the friends' models in as the player walks up, so they're there at the first 3-2-1.
      if (!active && dist < 30) friends.prepare(ctx.player.characterId);
      keepers.update(dt, near ? { x: local.x, z: local.z } : null, active?.id ?? null);
      plush.update(dt);
      friends.update(dt);
      fx.update(dt);
      for (const [id, g] of games) if (!active || active.id !== id || active.phase !== 'play') g.game.idle(dt);
    },
    dispose() {
      exit();
      for (const r of removers) r();
      offPhase();
      for (const c of colliders) ctx.physics.removeCollider(c);
      for (const g of games.values()) {
        g.game.dispose();
        ctx.vision.remove(g.weak);
      }
      ctx.scene.remove(root);
      rowMesh.geometry.dispose();
      rowMat.dispose();
      signMesh.geometry.dispose();
      signMat.dispose();
      atlas.dispose();
      proxyGeo.dispose();
      keepers.dispose();
      plush.dispose();
      friends.dispose();
      fx.dispose();
      hud.dispose();
      if (window.__rgCarnival) delete window.__rgCarnival;
    },
  };
}
