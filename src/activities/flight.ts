/**
 * Shared "flight" runner for the trampoline, bounce pads and rocket pads.
 *
 * It owns the player as an ExternalController and flies exact ballistic arcs (PLAYER.gravity), so
 * pads always chain into each other, rockets always land on the net and big bounces always come
 * back to the mat, however the move keys are used. The move keys do air tricks instead of steering
 * (see tricks.ts); owners may add gentle steering through `hooks.steer`.
 */
import * as THREE from 'three';
import type { CameraApi, ExternalController, GameContext, InputState } from '../types';
import { stepVertical, timeToLand } from './ballistics';
import { trickStars } from './bounceLogic';
import { PlayerVisual } from './playerVisual';
import { TrickState } from './tricks';

export interface Arc {
  vx: number;
  vy: number;
  vz: number;
  /** Height at which the arc ends (mat, pad or net surface). */
  endY: number;
  /** Seconds the player is held (pressed into the surface) before the arc starts. */
  dwell?: number;
  /** How far the player sinks while held, metres. */
  dip?: number;
}

export interface ArrivalInfo {
  /** Live player position (already on `endY`). */
  pos: THREE.Vector3;
  /** Velocity at the moment of arrival. */
  vIn: { x: number; y: number; z: number };
  upright: boolean;
  rotations: number;
  arcTime: number;
  /** Peak height above `endY` reached during this arc. */
  apex: number;
}

export interface FlightHooks {
  /** Called when the arc comes down to its end. Return the next arc, 'handoff' after calling begin(), or null to finish. */
  onArrive(info: ArrivalInfo, flight: Flight): Arc | 'handoff' | null;
  /** Per-frame chance to steer (change `flight.vx` / `flight.vz`). */
  steer?(dt: number, input: Readonly<InputState>, flight: Flight): void;
  /** Camera override while flying. */
  camera?(flight: Flight): Parameters<CameraApi['setOverride']>[0];
  /** Progress 0..1 of the dwell (wind-up). */
  onDwell?(t01: number, dt: number, flight: Flight): void;
  /** The flight finished (cancelled = control was taken away). */
  onEnd?(cancelled: boolean): void;
}

const SPEED_LINES_CSS = `
.rg-speed-lines{position:absolute;inset:0;pointer-events:none;opacity:0;z-index:2;
background:repeating-conic-gradient(from 3deg at 50% 50%,rgba(255,255,255,0) 0deg 3.2deg,rgba(255,255,255,.85) 3.2deg 3.9deg,rgba(255,255,255,0) 3.9deg 9deg);
-webkit-mask-image:radial-gradient(ellipse at 50% 50%,transparent 42%,#000 92%);
mask-image:radial-gradient(ellipse at 50% 50%,transparent 42%,#000 92%);transition:opacity .08s linear}
`;

export class Flight {
  active = false;
  owner = '';
  vx = 0;
  vy = 0;
  vz = 0;
  endY = 0;
  arcTime = 0;
  /** Set by owners to flop after the flight ends (comic tumble, never a penalty). */
  flopAtEnd = false;
  readonly tricks = new TrickState();
  readonly visual: PlayerVisual;
  readonly controller: ExternalController;

  private hooks: FlightHooks | null = null;
  private dwellLeft = 0;
  private dwellTotal = 0;
  private dip = 0;
  private baseY = 0;
  private peakY = 0;
  private lastUpright = true;
  private cameraOwned = false;
  private lines: HTMLDivElement | null = null;
  private style: HTMLStyleElement | null = null;
  private lineOpacity = 0;

  constructor(private readonly ctx: GameContext) {
    this.visual = new PlayerVisual(ctx.player);
    this.controller = {
      update: (dt, input) => this.step(dt, input),
      onRelease: () => this.finish(true),
    };
  }

  /** Horizontal + vertical speed (m/s). */
  get speed(): number {
    return Math.hypot(this.vx, this.vy, this.vz);
  }

  /** Height above the arc's end surface. */
  get height(): number {
    return this.ctx.player.position.y - this.endY;
  }

  /** Start flying `arc` from the player's current position (or continue as a new owner). */
  begin(owner: string, arc: Arc, hooks: FlightHooks): void {
    const player = this.ctx.player;
    this.owner = owner;
    this.hooks = hooks;
    this.setArc(arc);
    this.flopAtEnd = false;
    this.lastUpright = true;
    if (!this.active) {
      this.active = true;
      player.setExternalController(this.controller);
      // setExternalController may have refused (another system owns the player): stay inactive.
      if (player.mode !== 'external') this.active = false;
    }
  }

  /** Give the player back (no flop). */
  stop(): void {
    if (!this.active) return;
    this.ctx.player.setExternalController(null);
    this.finish(true);
  }

  private setArc(arc: Arc): void {
    const p = this.ctx.player.position;
    this.vx = arc.vx;
    this.vy = arc.vy;
    this.vz = arc.vz;
    this.endY = arc.endY;
    this.arcTime = 0;
    this.dwellTotal = this.dwellLeft = arc.dwell ?? 0;
    this.dip = arc.dip ?? 0;
    this.baseY = p.y;
    this.peakY = p.y;
    this.tricks.reset();
  }

  private step(dt: number, input: Readonly<InputState>): boolean {
    const hooks = this.hooks;
    if (!this.active || !hooks) return false;
    const player = this.ctx.player;
    const p = player.position;

    if (this.dwellLeft > 0) {
      this.dwellLeft = Math.max(0, this.dwellLeft - dt);
      const t = this.dwellTotal > 0 ? 1 - this.dwellLeft / this.dwellTotal : 1;
      hooks.onDwell?.(t, dt, this);
      p.y = this.baseY - this.dip * Math.sin(Math.PI * Math.min(1, t));
      player.setAnimation('idle');
      if (this.dwellLeft > 0) return true;
      p.y = this.baseY;
      this.peakY = p.y;
    }

    hooks.steer?.(dt, input, this);
    const prevVy = this.vy;
    const s = stepVertical(p.y, this.vy, dt, this.endY);
    p.x += this.vx * s.used;
    p.z += this.vz * s.used;
    p.y = s.y;
    this.vy = s.vy;
    this.arcTime += s.used;
    this.peakY = Math.max(this.peakY, p.y);
    const h = Math.hypot(this.vx, this.vz);
    if (h > 3) player.yaw = Math.atan2(this.vx, this.vz);

    if (prevVy > 0 && this.vy <= 0 && this.peakY - this.endY >= 18) {
      this.ctx.audio.play('whoosh', { volume: Math.min(1, (this.peakY - this.endY) / 45), pitch: 0.9 });
    }

    const toLand = s.arrived ? 0 : timeToLand(p.y, this.vy, this.endY);
    for (const e of this.tricks.update(dt, input.moveX, input.moveY, this.arcTime, toLand)) {
      this.ctx.events.emit('stunt', { kind: 'bigAir', value: e.count, stars: trickStars(e.total) });
    }
    player.setAnimation(this.vy > 0 ? 'jump' : 'fall');

    if (!s.arrived) return true;

    // Arrived on the end surface.
    this.lastUpright = this.tricks.upright;
    const rotations = this.tricks.rotations;
    if (rotations > 0 && this.lastUpright) {
      // Stuck the landing.
      this.ctx.events.emit('stunt', { kind: 'bigAir', value: rotations, stars: 1 });
      this.ctx.events.emit('ui:toast', { icon: 'star' });
    }
    const info: ArrivalInfo = {
      pos: p,
      vIn: { x: this.vx, y: this.vy, z: this.vz },
      upright: this.lastUpright,
      rotations,
      arcTime: this.arcTime,
      apex: this.peakY - this.endY,
    };
    const next = hooks.onArrive(info, this);
    if (next === 'handoff') return this.active;
    if (next) {
      this.setArc(next);
      return true;
    }
    if (!this.lastUpright) this.flopAtEnd = true;
    this.finish(false);
    return false;
  }

  private finish(cancelled: boolean): void {
    const hooks = this.hooks;
    if (!hooks && !this.active) return;
    this.active = false;
    this.hooks = null;
    this.tricks.reset();
    this.visual.clear();
    if (cancelled) this.flopAtEnd = false;
    hooks?.onEnd?.(cancelled);
  }

  /** Per-frame work that must run AFTER the core controller (avatar visuals, camera, speed lines). */
  update(dt: number): void {
    const ctx = this.ctx;
    const hooks = this.hooks;
    if (this.active && hooks) {
      this.visual.setTrick(this.tricks.pitch, this.tricks.yaw);
      const cam = hooks.camera?.(this) ?? null;
      if (cam) {
        ctx.cameraRig.setOverride(cam);
        this.cameraOwned = true;
      }
    } else {
      if (this.hooks !== null) this.finish(false);
      this.visual.clear();
      if (this.cameraOwned) {
        ctx.cameraRig.setOverride(null);
        this.cameraOwned = false;
      }
      if (this.flopAtEnd && ctx.player.mode === 'walk') {
        this.flopAtEnd = false;
        ctx.player.flop();
      } else if (ctx.player.mode !== 'external') {
        this.flopAtEnd = false;
      }
    }
    this.visual.update(dt);
    this.updateLines(dt);
  }

  private ensureLines(): HTMLDivElement | null {
    if (this.lines) return this.lines;
    if (typeof document === 'undefined') return null;
    this.style = document.createElement('style');
    this.style.textContent = SPEED_LINES_CSS;
    document.head.appendChild(this.style);
    this.lines = document.createElement('div');
    this.lines.className = 'rg-speed-lines';
    this.ctx.uiRoot.appendChild(this.lines);
    return this.lines;
  }

  private updateLines(dt: number): void {
    const target = this.active && this.dwellLeft <= 0 ? Math.max(0, Math.min(0.75, (this.speed - 24) / 26)) : 0;
    this.lineOpacity += (target - this.lineOpacity) * Math.min(1, dt * 10);
    if (this.lineOpacity < 0.01 && !this.lines) return;
    const el = this.ensureLines();
    if (el) el.style.opacity = this.lineOpacity < 0.01 ? '0' : this.lineOpacity.toFixed(2);
  }

  dispose(): void {
    this.stop();
    if (this.cameraOwned) this.ctx.cameraRig.setOverride(null);
    this.lines?.remove();
    this.style?.remove();
    this.lines = null;
    this.style = null;
  }
}

const flights = new WeakMap<GameContext, Flight>();

/** The one Flight per game context (shared by every thrill so they can hand the player on). */
export function getFlight(ctx: GameContext): Flight {
  let f = flights.get(ctx);
  if (!f) {
    f = new Flight(ctx);
    flights.set(ctx, f);
  }
  return f;
}
