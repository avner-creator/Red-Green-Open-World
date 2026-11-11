/**
 * The extra super powers (rocket boots, bounce ball, giant, rainbow slide, bubble shield).
 *
 * `ExtraPowerMachine` is the pure rule set (unit-tested): it turns one frame of facts into actions.
 * `installExtraPowers(ctx)` plugs it into the player's SkillMachine (`setExtraPowerHook`) and turns
 * actions into motion through public PlayerApi hooks only (`launch`, `addMoveModifier`,
 * `setVisualStretch`) plus both-eye visuals: everything is light with a dark edge, so it reads by
 * brightness in the R-only and G-only channel. All of it is bouncy and harmless.
 */
import * as THREE from 'three';
import type { GameContext } from '../types';
import { getCharacter, type CharacterId } from './characters/catalog';
import { createSkillFx } from './skill-fx';
import { setExtraPowerHook, type SkillFrame } from './skills';
import { chosenPower, getPower, isNativePower, onPowerChosen, type ExtraPowerId } from './skills-powers';

export const EXTRA = {
  rocketBoots: { fuel: 1.1, accel: 42, maxUp: 8.5 },
  bounceBall: { time: 6, keep: 0.9, min: 6.5, max: 16, hop: 8 },
  giant: { time: 8, scale: 1.6, jump: 1.3, speed: 1.15 },
  rainbowSlide: { time: 2.5, speed: 1.9, friction: 0.35 },
  bubbleShield: { time: 6, bump: 7, hardLanding: -12, bumpGap: 0.5 },
} as const;

export type ExtraAction =
  | { kind: 'start'; id: ExtraPowerId }
  | { kind: 'end'; id: ExtraPowerId }
  /** Set the vertical speed (m/s), keeping horizontal motion. */
  | { kind: 'up'; vy: number }
  /** A comic boing (sound + squash). */
  | { kind: 'boing' }
  /** Rocket thrust this frame (visual trail). */
  | { kind: 'thrust' };

/** Extra facts the player frame does not carry. */
export interface ExtraFacts {
  /** Pushing into something that stops us (input on, nearly no horizontal speed). */
  blocked: boolean;
}

export class ExtraPowerMachine {
  cooldown = 0;
  /** Seconds left of the running power (0 = none). */
  left = 0;
  fuel: number = EXTRA.rocketBoots.fuel;
  private thrusting = false;
  private wasGrounded = true;
  private airVy = 0;
  private bumpGap = 0;

  constructor(public id: ExtraPowerId) {}

  get running(): boolean {
    return this.left > 0 || this.thrusting;
  }

  /** Stop whatever runs (hero swap, ride, session end). */
  reset(): ExtraAction[] {
    const out: ExtraAction[] = [];
    if (this.running) out.push({ kind: 'end', id: this.id });
    this.left = 0;
    this.thrusting = false;
    this.fuel = EXTRA.rocketBoots.fuel;
    return out;
  }

  setPower(id: ExtraPowerId): ExtraAction[] {
    const out = this.reset();
    this.id = id;
    this.cooldown = 0;
    return out;
  }

  frame(f: SkillFrame, facts: ExtraFacts = { blocked: false }): ExtraAction[] {
    const out: ExtraAction[] = [];
    const dt = f.dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.bumpGap = Math.max(0, this.bumpGap - dt);
    if (!f.canUse) {
      if (this.running) {
        out.push(...this.reset());
        this.cooldown = getPower(this.id).cooldown;
      }
      this.wasGrounded = f.grounded;
      return out;
    }
    const landed = f.grounded && !this.wasGrounded;
    if (!f.grounded) this.airVy = Math.min(this.airVy, f.vy);
    const landingVy = this.airVy;
    if (f.grounded) this.airVy = 0;
    this.wasGrounded = f.grounded;

    switch (this.id) {
      case 'rocketBoots': {
        const c = EXTRA.rocketBoots;
        if (f.grounded && this.cooldown <= 0 && !this.thrusting) this.fuel = c.fuel;
        if (f.held && this.fuel > 0 && this.cooldown <= 0) {
          if (!this.thrusting) out.push({ kind: 'start', id: 'rocketBoots' });
          this.thrusting = true;
          this.fuel = Math.max(0, this.fuel - dt);
          out.push({ kind: 'up', vy: Math.min(c.maxUp, Math.max(f.vy, 0) + c.accel * dt) }, { kind: 'thrust' });
          if (this.fuel <= 0) {
            this.thrusting = false;
            this.cooldown = getPower('rocketBoots').cooldown;
            out.push({ kind: 'end', id: 'rocketBoots' });
          }
        } else if (this.thrusting) {
          this.thrusting = false;
          out.push({ kind: 'end', id: 'rocketBoots' });
          if (this.fuel < c.fuel * 0.5) this.cooldown = getPower('rocketBoots').cooldown;
        }
        break;
      }
      case 'bounceBall': {
        const c = EXTRA.bounceBall;
        if (this.left > 0) {
          if (landed && landingVy < -2) {
            out.push({ kind: 'up', vy: Math.min(c.max, Math.max(c.min, -landingVy * c.keep)) }, { kind: 'boing' });
          } else if (f.pressed && f.grounded) {
            out.push({ kind: 'up', vy: c.hop }, { kind: 'boing' });
          }
        }
        this.timed(f, out, c.time, true);
        break;
      }
      case 'giant': {
        if (this.left > 0 && f.pressed) {
          // Press again: back to normal size.
          this.left = 0;
          this.cooldown = getPower('giant').cooldown;
          out.push({ kind: 'end', id: 'giant' });
          break;
        }
        this.timed(f, out, EXTRA.giant.time, true);
        break;
      }
      case 'rainbowSlide':
        this.timed(f, out, EXTRA.rainbowSlide.time, f.grounded);
        break;
      case 'bubbleShield': {
        const c = EXTRA.bubbleShield;
        if (this.left > 0) {
          if (landed && landingVy < c.hardLanding) {
            out.push({ kind: 'up', vy: Math.min(12, -landingVy * 0.6) }, { kind: 'boing' });
          } else if (facts.blocked && this.bumpGap <= 0 && f.grounded) {
            this.bumpGap = c.bumpGap;
            out.push({ kind: 'up', vy: c.bump }, { kind: 'boing' });
          }
        }
        this.timed(f, out, c.time, true);
        break;
      }
    }
    return out;
  }

  /** Start on press (when allowed and off cooldown), count down, end with a cooldown. */
  private timed(f: SkillFrame, out: ExtraAction[], time: number, allowed: boolean): void {
    if (this.left > 0) {
      this.left -= f.dt;
      if (this.left <= 0) {
        this.left = 0;
        this.cooldown = getPower(this.id).cooldown;
        out.push({ kind: 'end', id: this.id });
      }
      return;
    }
    if (f.pressed && allowed && this.cooldown <= 0) {
      this.left = time;
      out.push({ kind: 'start', id: this.id });
    }
  }
}

/** Rainbow ribbon: flat tiles left behind, bands alternate light/dark so it reads in R and G alone. */
const RAINBOW = ['#ff6b6b', '#ffb84d', '#fff27a', '#7be08a', '#6fc3ff', '#b58cff'];
const BAND_LIGHT = [1, 0.55, 1, 0.55, 1, 0.55];

let installed: (() => void) | null = null;

/** Wire the extra powers into the player (idempotent; returns an uninstaller). */
export function installExtraPowers(ctx: GameContext): () => void {
  if (installed) return installed;
  const machine = new ExtraPowerMachine('rocketBoots');
  const fx = createSkillFx(ctx.scene, ctx.player.object);
  const v = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let mods: (() => void)[] = [];
  let giantK = 1;
  let giantOn = false;
  let stretch = 0;
  let slideOn = false;
  let current: ExtraPowerId | null = null;

  // Bubble: a light shell with a darker rim (Fresnel-ish via a back-face shell).
  const bubble = new THREE.Group();
  bubble.name = 'power-bubble';
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(1.05, 28, 18),
    new THREE.MeshStandardMaterial({ color: 0xf4fbff, transparent: true, opacity: 0.28, roughness: 0.1, depthWrite: false }),
  );
  const rim = new THREE.Mesh(
    new THREE.SphereGeometry(1.1, 28, 18),
    new THREE.MeshBasicMaterial({ color: 0x2c3a4a, transparent: true, opacity: 0.35, side: THREE.BackSide, depthWrite: false }),
  );
  bubble.add(rim, shell);
  bubble.position.y = 0.9;
  bubble.visible = false;
  ctx.player.object.add(bubble);

  // Rainbow ribbon tiles.
  const TILES = 48;
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.04, 0.5), new THREE.MeshStandardMaterial({ roughness: 0.6 }), TILES);
  tiles.name = 'power-rainbow';
  tiles.frustumCulled = false;
  const col = new THREE.Color();
  for (let i = 0; i < TILES; i++) {
    col.set(RAINBOW[i % RAINBOW.length] as string).multiplyScalar(BAND_LIGHT[i % BAND_LIGHT.length] as number);
    tiles.setColorAt(i, col);
  }
  tiles.count = 0;
  ctx.scene.add(tiles);
  const tileLife: number[] = [];
  const tilePos: THREE.Vector3[] = [];
  let tileNext = 0;
  let tileTimer = 0;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();

  const heroPower = (): ExtraPowerId | null => {
    try {
      const p = chosenPower(getCharacter(ctx.player.characterId as CharacterId));
      return isNativePower(p) ? null : p;
    } catch {
      return null;
    }
  };

  const apply = (acts: readonly ExtraAction[]): void => {
    for (const a of acts) {
      switch (a.kind) {
        case 'up':
          v.set(ctx.player.velocity.x, a.vy, ctx.player.velocity.z);
          ctx.player.launch(v);
          break;
        case 'boing':
          stretch = 0.35;
          ctx.audio.play('boing', { volume: 0.7, pitch: 1.1 + Math.random() * 0.2 });
          break;
        case 'thrust':
          tmp.copy(ctx.player.position);
          fx.sparkle(tmp, 2, 1.2, 0.7);
          break;
        case 'start':
          ctx.events.emit('player:skill', { id: ctx.player.skill.id });
          if (a.id === 'rocketBoots') ctx.audio.play('whoosh', { volume: 0.6, pitch: 1.3 });
          else ctx.audio.play('star', { volume: 0.6, pitch: 1.2 });
          tmp.copy(ctx.player.position).setY(ctx.player.position.y + 0.9);
          fx.sparkle(tmp, 14, 2.6, 1);
          if (a.id === 'giant') {
            giantOn = true;
            mods.push(ctx.player.addMoveModifier({ jump: EXTRA.giant.jump, speed: EXTRA.giant.speed }));
          } else if (a.id === 'rainbowSlide') {
            slideOn = true;
            mods.push(ctx.player.addMoveModifier({ speed: EXTRA.rainbowSlide.speed, friction: EXTRA.rainbowSlide.friction }));
          } else if (a.id === 'bubbleShield') {
            bubble.visible = true;
            mods.push(ctx.player.addMoveModifier({ jump: 1.15 }));
          } else if (a.id === 'bounceBall') {
            stretch = 0.3;
          }
          break;
        case 'end':
          for (const off of mods) off();
          mods = [];
          giantOn = false;
          slideOn = false;
          bubble.visible = false;
          ctx.player.setVisualStretch(0);
          break;
      }
    }
  };

  const hook = {
    active: () => heroPower() !== null,
    get cooldown() {
      return machine.cooldown;
    },
    frame(f: SkillFrame) {
      const want = heroPower();
      if (want && want !== current) {
        apply(machine.setPower(want));
        current = want;
      }
      const s = ctx.input.state;
      const pushing = Math.hypot(s.moveX, s.moveY) > 0.6;
      const hs = Math.hypot(ctx.player.velocity.x, ctx.player.velocity.z);
      apply(machine.frame(f, { blocked: pushing && hs < 0.6 }));

      // Visual layers.
      const dt = f.dt;
      giantK += ((giantOn ? EXTRA.giant.scale : 1) - giantK) * (1 - Math.exp(-dt * 6));
      ctx.player.object.scale.setScalar(giantK);
      bubble.scale.setScalar(1 + 0.04 * Math.sin(performance.now() / 160));
      if (stretch > 0.001 || slideOn) {
        stretch *= Math.exp(-dt * 6);
        const wob = stretch * Math.cos(performance.now() / 45);
        ctx.player.setVisualStretch(slideOn ? -0.18 + wob : wob);
      }
      tileTimer -= dt;
      if (slideOn && f.grounded && tileTimer <= 0) {
        tileTimer = 0.06;
        const i = tileNext % TILES;
        tileNext++;
        tilePos[i] = (tilePos[i] ?? new THREE.Vector3()).copy(ctx.player.position).setY(ctx.player.position.y + 0.03);
        tileLife[i] = 1.6;
        tiles.count = Math.min(TILES, Math.max(tiles.count, i + 1));
      }
      for (let i = 0; i < tiles.count; i++) {
        const life = (tileLife[i] = Math.max(0, (tileLife[i] ?? 0) - dt));
        const k = Math.min(1, life / 0.5);
        sc.set(k, 1, k);
        m.compose(tilePos[i] ?? tmp, q, sc);
        tiles.setMatrixAt(i, m);
      }
      tiles.instanceMatrix.needsUpdate = true;
      fx.update(dt);
    },
  };
  setExtraPowerHook(hook);

  const hardReset = (): void => {
    apply(machine.reset());
    giantK = 1;
    ctx.player.object.scale.setScalar(1);
  };
  const offs = [
    ctx.events.on('player:character', hardReset),
    ctx.events.on('session:phase', hardReset),
    onPowerChosen(() => {
      hardReset();
      current = null;
      // Re-apply the hero so the player's classic skill follows the new pick.
      void ctx.player.setCharacter(ctx.player.characterId);
    }),
  ];
  installed = () => {
    setExtraPowerHook(null);
    for (const off of offs) off();
    apply(machine.reset());
    bubble.removeFromParent();
    tiles.removeFromParent();
    fx.dispose();
    installed = null;
  };
  return installed;
}
