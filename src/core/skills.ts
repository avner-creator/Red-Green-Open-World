/**
 * Character skill state machine (pure: no three.js, no physics). The player feeds it one frame of
 * facts (input, grounded, air time, vertical speed) and applies the motion for its `phase`.
 *
 * Rules (all forgiving and non-violent):
 * - Skills work only while walking on foot (`canUse`); anything else cancels a running skill.
 * - doubleJump: once per air time, in the air. Jump or skill key.
 * - glide: in the air, hold to glide (slow fall), up to `maxTime` s per air time.
 * - dash: ground or air (once per air time), 7 m along the facing direction, 1.5 s cooldown.
 * - superBounce: ground only; hold to crouch-charge, release to spring up to 9 m.
 * - groundPound: in the air; a short hang, then a slam straight down until landing.
 */
import type { SkillId } from '../types';

export const SKILL = {
  doubleJump: {
    /** Upward speed of the second jump (m/s): ≈ 1.5 m extra height with PLAYER.gravity 22. */
    speed: 8.2,
    /** Floaty version (flamingo): a little faster and lighter gravity while rising. */
    floatySpeed: 8.6,
    floatyGravity: 0.68,
    /** Seconds of the spin (and of the floaty gravity). */
    spinTime: 0.5,
    /** Must be this long in the air (s) so a ground jump press is never a double jump. */
    minAir: 0.1,
    cooldown: 0.2,
  },
  glide: {
    fallSpeed: 2.5,
    maxTime: 4,
    minAir: 0.12,
    cooldown: 0.25,
  },
  dash: {
    distance: 7,
    duration: 0.22,
    cooldown: 1.5,
  },
  superBounce: {
    height: 9,
    minHeight: 7,
    /** Full charge after this many seconds of holding. */
    charge: 0.42,
    /** Shortest crouch before the spring (a tap still crouches visibly). */
    minCharge: 0.16,
    /** Holding longer than this springs anyway. */
    maxHold: 1.6,
    cooldown: 0.8,
    boost: 1.25,
  },
  groundPound: {
    minAir: 0.08,
    hang: 0.16,
    speed: 30,
    cooldown: 0.5,
    radius: 6.5,
  },
  /** How long an unused bounce boost survives a landing that started no bounce (s). */
  boostGrace: 0.35,
} as const;

export type SkillPhase = 'idle' | 'spin' | 'glide' | 'dash' | 'charge' | 'hang' | 'slam';

export interface SkillFrame {
  dt: number;
  pressed: boolean;
  held: boolean;
  /** Jump pressed this frame (doubleJump also listens to the jump key in the air). */
  jumpPressed: boolean;
  grounded: boolean;
  /** Seconds since leaving the ground (0 on the ground). */
  airTime: number;
  /** Vertical speed, m/s. */
  vy: number;
  /** Walk mode, on foot, no ride: skills allowed. */
  canUse: boolean;
}

/** What happened this frame (the player turns it into motion and effects). */
export type SkillEvent =
  | { kind: 'fire'; id: SkillId; value: number }
  | { kind: 'charge' }
  | { kind: 'end'; id: SkillId };

/** Spring speed for a super-bounce charged for `t` seconds. */
export function springSpeed(t: number, gravity: number): number {
  const c = SKILL.superBounce;
  const k = Math.min(1, Math.max(0, t / c.charge));
  const h = c.minHeight + (c.height - c.minHeight) * k;
  return Math.sqrt(2 * gravity * h);
}

/**
 * An extra super power (skills-extra.ts) that takes the skill button instead of the classic skill.
 * While `active()` the SkillMachine stays idle and forwards its frames.
 */
export interface ExtraPowerHook {
  active(): boolean;
  frame(f: SkillFrame): void;
  /** Seconds until the power can be used again (shown on the HUD skill icon). */
  readonly cooldown: number;
}

let extraHook: ExtraPowerHook | null = null;

/** Install (or clear) the extra-power hook. */
export function setExtraPowerHook(h: ExtraPowerHook | null): void {
  extraHook = h;
}

export class SkillMachine {
  phase: SkillPhase = 'idle';
  /** Seconds in the current phase. */
  t = 0;
  cooldown = 0;
  /** The once-per-air-time skill was used. */
  usedInAir = false;
  glideLeft: number = SKILL.glide.maxTime;
  bounceBoost = 1;
  /** Counts down after a landing; the boost expires at 0. */
  private boostTimer = Infinity;
  floaty = false;

  constructor(
    public id: SkillId,
    private readonly gravity = 22,
  ) {}

  setSkill(id: SkillId, floaty = false): void {
    this.cancel();
    this.id = id;
    this.floaty = floaty;
    this.cooldown = 0;
    this.bounceBoost = 1;
  }

  get ready(): boolean {
    return this.cooldown <= 0 && (this.phase === 'idle' || this.phase === 'spin');
  }

  get active(): boolean {
    return this.phase !== 'idle';
  }

  /** Stop whatever runs (mode change, respawn). Returns the id if something was cut short. */
  cancel(): SkillId | null {
    const was = this.phase;
    this.phase = 'idle';
    this.t = 0;
    return was === 'idle' ? null : this.id;
  }

  /** An external controller (trampoline, pad, ride) took over: the boost was used. */
  consumeBoost(): void {
    this.bounceBoost = 1;
    this.boostTimer = Infinity;
  }

  /** The player touched the ground. Returns 'pound' when a slam landed. */
  land(): 'pound' | null {
    this.usedInAir = false;
    this.glideLeft = SKILL.glide.maxTime;
    let out: 'pound' | null = null;
    if (this.phase === 'slam' || this.phase === 'hang') {
      out = 'pound';
      this.phase = 'idle';
      this.t = 0;
      this.cooldown = SKILL.groundPound.cooldown;
      this.bounceBoost = Infinity;
    } else if (this.phase === 'glide' || this.phase === 'spin') {
      this.phase = 'idle';
      this.t = 0;
    }
    if (this.bounceBoost !== 1) this.boostTimer = SKILL.boostGrace;
    return out;
  }

  update(f: SkillFrame): SkillEvent | null {
    const dt = f.dt;
    if (extraHook?.active()) {
      const was = this.cancel();
      extraHook.frame(f);
      this.cooldown = extraHook.cooldown;
      return was === 'glide' ? { kind: 'end', id: was } : null;
    }
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.boostTimer !== Infinity) {
      this.boostTimer -= dt;
      if (this.boostTimer <= 0) this.consumeBoost();
    }
    if (!f.canUse) {
      const id = this.cancel();
      return id && id === 'glide' ? { kind: 'end', id } : null;
    }
    if (f.grounded) {
      this.usedInAir = false;
      this.glideLeft = SKILL.glide.maxTime;
    }
    this.t += dt;
    const air = !f.grounded;
    switch (this.id) {
      case 'doubleJump': {
        const c = SKILL.doubleJump;
        if (this.phase === 'spin' && this.t >= c.spinTime) this.phase = 'idle';
        if ((f.pressed || f.jumpPressed) && air && f.airTime >= c.minAir && !this.usedInAir && this.cooldown <= 0) {
          this.usedInAir = true;
          this.cooldown = c.cooldown;
          this.phase = 'spin';
          this.t = 0;
          return { kind: 'fire', id: 'doubleJump', value: this.floaty ? c.floatySpeed : c.speed };
        }
        return null;
      }
      case 'glide': {
        const c = SKILL.glide;
        if (this.phase === 'glide') {
          this.glideLeft -= dt;
          if (!f.held || f.grounded || this.glideLeft <= 0) {
            this.phase = 'idle';
            this.t = 0;
            this.cooldown = c.cooldown;
            return { kind: 'end', id: 'glide' };
          }
          return null;
        }
        // Press in the air, or keep holding from before the fall started.
        const want = f.pressed || (f.held && f.vy < 0 && !this.usedInAir);
        if (want && air && f.airTime >= c.minAir && this.glideLeft > 0.05 && this.cooldown <= 0) {
          this.usedInAir = true;
          this.phase = 'glide';
          this.t = 0;
          return { kind: 'fire', id: 'glide', value: SKILL.glide.fallSpeed };
        }
        return null;
      }
      case 'dash': {
        const c = SKILL.dash;
        if (this.phase === 'dash') {
          if (this.t >= c.duration) {
            this.phase = 'idle';
            this.t = 0;
            return { kind: 'end', id: 'dash' };
          }
          return null;
        }
        if (f.pressed && this.cooldown <= 0 && (f.grounded || !this.usedInAir)) {
          if (air) this.usedInAir = true;
          this.phase = 'dash';
          this.t = 0;
          this.cooldown = c.cooldown;
          return { kind: 'fire', id: 'dash', value: c.distance / c.duration };
        }
        return null;
      }
      case 'superBounce': {
        const c = SKILL.superBounce;
        if (this.phase === 'charge') {
          if (air) {
            // Walked off an edge while crouching: no spring.
            this.phase = 'idle';
            this.t = 0;
            return { kind: 'end', id: 'superBounce' };
          }
          const release = (!f.held && this.t >= c.minCharge) || this.t >= c.maxHold;
          if (release) {
            const v = springSpeed(this.t, this.gravity);
            this.phase = 'idle';
            this.t = 0;
            this.cooldown = c.cooldown;
            this.bounceBoost = c.boost;
            this.boostTimer = Infinity;
            return { kind: 'fire', id: 'superBounce', value: v };
          }
          return null;
        }
        if (f.pressed && f.grounded && this.cooldown <= 0) {
          this.phase = 'charge';
          this.t = 0;
          return { kind: 'charge' };
        }
        return null;
      }
      case 'groundPound': {
        const c = SKILL.groundPound;
        if (this.phase === 'hang') {
          if (this.t >= c.hang) {
            this.phase = 'slam';
            this.t = 0;
          }
          return null;
        }
        if (this.phase === 'slam') return null;
        if (f.pressed && air && f.airTime >= c.minAir && this.cooldown <= 0) {
          this.phase = 'hang';
          this.t = 0;
          return { kind: 'fire', id: 'groundPound', value: c.speed };
        }
        return null;
      }
    }
  }
}
