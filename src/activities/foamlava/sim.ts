/**
 * Foam Lava run simulation (pure, deterministic, no three.js): the hero's arcade platformer
 * physics on the course solids, tipping floats, wobbly planks, bounce bubbles, the rope swing,
 * the slip-and-slide chute, foam cannons, checkpoints, foam splashes and the finish.
 *
 * During a run the hero is driven through an ExternalController that feeds this sim; the visuals
 * read the dynamic state back. Everything is in the course frame (see layout.ts).
 */
import { PLAYER } from '../../config';
import { CANNON, CANNONS, CHECKPOINTS, CHUTE, FINISH_ID, FOAM_Y, LANE_B, LAPS, LIFT, PIT, PROPS, ROPE, ROUTE, RUN_BOUNDS, SOLIDS, START } from './layout';
import type { PropDef, SolidDef } from './layout';

export const RUN = {
  walk: PLAYER.walkSpeed,
  sprint: 8.5,
  accelGround: 42,
  accelAir: 16,
  /** Softer grip on soapy floats and planks. */
  accelSoapy: 24,
  jump: PLAYER.jumpSpeed,
  gravity: PLAYER.gravity,
  stepUp: 0.38,
  snapDown: 0.4,
  /** Feet may overhang an edge by this much and still stand. */
  foot: 0.22,
  radius: 0.32,
  height: 1.6,
  coyote: 0.12,
  buffer: 0.14,
  slideSpeed: 11,
  slideAccel: 16,
  slideSteer: 3.2,
  bubbleBounce: 9.2,
  splashTime: 1.15,
  /** Slope (dy/dx) a float or plank needs before it starts to slip you off. */
  slipStart: 0.12,
  /** Downhill carry speed per unit of slope beyond `slipStart`. */
  slipGain: 12,
  floatMaxTilt: 0.2,
  plankMaxRoll: 0.42,
  blockMaxTilt: 0.2,
} as const;

export interface SimInput {
  /** Wanted move direction in the course frame (length ≤ 1). */
  mx: number;
  mz: number;
  sprint: boolean;
  jumpPressed: boolean;
}

export const NO_INPUT: SimInput = { mx: 0, mz: 0, sprint: false, jumpPressed: false };

export type SimEvent =
  | { type: 'jump' }
  | { type: 'land'; speed: number; kind: SolidDef['kind'] }
  | { type: 'bounce'; id: string }
  | { type: 'slide' }
  | { type: 'slideEnd' }
  | { type: 'grab' }
  | { type: 'release'; early: boolean }
  | { type: 'puff'; cannon: number }
  | { type: 'puffHit'; cannon: number }
  /** Bumped into the friend (comic boing for both). */
  | { type: 'bump' }
  | { type: 'splash'; x: number; z: number }
  | { type: 'respawn'; cp: number }
  | { type: 'checkpoint'; cp: number }
  | { type: 'finish'; time: number }
  /** A lap is done: the bubble express floats you back to the start line. `lap` = laps done. */
  | { type: 'lap'; lap: number }
  /** The bubble set you down on the start deck. */
  | { type: 'liftEnd' };

export type SimMode = 'run' | 'swing' | 'slide' | 'splash' | 'lift' | 'done';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Per-solid moving state. */
export interface SolidState {
  /** Pushed down (m). */
  dip: number;
  dipV: number;
  /** Surface slope (dy/dx, dy/dz) from tipping or rolling. */
  tx: number;
  tz: number;
  tvx: number;
  tvz: number;
  /** Vertical bob (m, bubbles and floats). */
  bob: number;
  /** Seconds since someone stood on it (visual squash). */
  touched: number;
  /** Turntable floats (a surprise each run): turn rate (rad/s) and the current turn. */
  spin: number;
  angle: number;
}

export type RopeState = 'parked' | 'held' | 'return';

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

/** The friend's body radius (bump). */
export const FRIEND_RADIUS = 0.42;
const WALK_TOP = SOLIDS.find((s) => s.id === 'walk')?.top ?? 1;

/** Push a point (radius `r`) out of a box/cylinder footprint; kills the velocity into it. */
function pushOut(p: { x: number; z: number }, v: { x: number; z: number }, s: PropDef, r: number): void {
  if (s.shape === 'box') {
    const hx = (s.hx ?? 0) + r;
    const hz = (s.hz ?? 0) + r;
    const dx = p.x - s.x;
    const dz = p.z - s.z;
    if (Math.abs(dx) >= hx || Math.abs(dz) >= hz) return;
    if (hx - Math.abs(dx) < hz - Math.abs(dz)) {
      p.x = s.x + Math.sign(dx || 1) * hx;
      if (v.x * Math.sign(dx || 1) < 0) v.x = 0;
    } else {
      p.z = s.z + Math.sign(dz || 1) * hz;
      if (v.z * Math.sign(dz || 1) < 0) v.z = 0;
    }
    return;
  }
  const rr = (s.r ?? 0) + r;
  const dx = p.x - s.x;
  const dz = p.z - s.z;
  const d = Math.hypot(dx, dz);
  if (d >= rr) return;
  const nx = d > 1e-6 ? dx / d : 1;
  const nz = d > 1e-6 ? dz / d : 0;
  p.x = s.x + nx * rr;
  p.z = s.z + nz * rr;
  const vn = v.x * nx + v.z * nz;
  if (vn < 0) {
    v.x -= vn * nx;
    v.z -= vn * nz;
  }
}

function halfX(s: SolidDef): number {
  return s.shape === 'box' ? (s.hx ?? 0) : (s.r ?? 0);
}
function halfZ(s: SolidDef): number {
  return s.shape === 'box' ? (s.hz ?? 0) : (s.r ?? 0);
}

/** Lowest point of a solid's side (what the hero bumps into). Decks and bins stand on the ground. */
export function solidBottom(s: SolidDef): number {
  switch (s.kind) {
    case 'plank':
      return s.top - 0.25;
    case 'float':
    case 'stone':
    case 'tile':
      return FOAM_Y - 0.3;
    case 'bubble':
      return s.top - 1.5;
    default:
      return -1;
  }
}

/** Cannon phase helper: 'idle' | 'warn' | 'blast' and the 0..1 progress inside that state. */
export function cannonState(clock: number, offset: number): { state: 'idle' | 'warn' | 'blast'; t: number } {
  const ph = (((clock + offset) % CANNON.period) + CANNON.period) % CANNON.period;
  const blastAt = CANNON.period - CANNON.blast;
  const warnAt = blastAt - CANNON.warn;
  if (ph >= blastAt) return { state: 'blast', t: (ph - blastAt) / CANNON.blast };
  if (ph >= warnAt) return { state: 'warn', t: (ph - warnAt) / CANNON.warn };
  return { state: 'idle', t: ph / warnAt };
}

/** Rope end (where the hands hold) for a swing angle. */
export function ropeEnd(theta: number): Vec3 {
  return { x: ROPE.x + ROPE.length * Math.sin(theta), y: ROPE.y - ROPE.length * Math.cos(theta), z: ROPE.z };
}

export class CourseSim {
  readonly p: Vec3 = { x: 0, y: 0, z: 0 };
  readonly v: Vec3 = { x: 0, y: 0, z: 0 };
  yaw = 0;
  mode: SimMode = 'run';
  grounded = true;
  /** Index into SOLIDS of what the hero stands on (−1 = nothing / the ground). */
  ground = -1;
  /** Run clock (s), also drives the cannons so a run is deterministic. */
  time = 0;
  /** Highest checkpoint reached. */
  cp = 0;
  falls = 0;
  /** Laps finished (a round is `LAPS` laps). */
  lap = 0;
  /** Bubble express: seconds into the float back to the start, and where it started. */
  liftT = 0;
  private readonly liftFrom: Vec3 = { x: 0, y: 0, z: 0 };
  /** Seconds left of the bubble beard (set on a splash). */
  beard = 0;
  readonly solids: SolidState[] = SOLIDS.map(() => ({ dip: 0, dipV: 0, tx: 0, tz: 0, tvx: 0, tvz: 0, bob: 0, touched: 99, spin: 0, angle: 0 }));
  rope: { state: RopeState; theta: number; omega: number; t: number; from: number } = { state: 'parked', theta: ROPE.parked, omega: 0, t: 0, from: ROPE.parked };
  /** Free-running clock for idle motion (bobbing) and the cannons outside a run. */
  worldTime = 0;
  /** Is a run in progress (hero physics on)? Outside a run only the course moves. */
  running = false;
  /** Course-frame ground height outside the pit (terrain), default flat. */
  groundAt: (x: number, z: number) => number = () => 0;
  private coyote = 0;
  /** Feet height when last standing (crossing a small gap still allows the step up from there). */
  private lastGroundY = 0;
  private buffer = 0;
  private splashT = 0;
  private swingPassed = false;
  private readonly blasted: boolean[] = CANNONS.map(() => false);
  private readonly hitBy: boolean[] = CANNONS.map(() => false);
  private touchingFriend = false;
  /** Seconds left of a blower knock-back (the stick can't cancel the comic flight). */
  private knockT = 0;

  /** Put the hero on the start line and reset the course for a new run. */
  reset(pos: { x: number; z: number }, yaw = 0): void {
    const s = SOLIDS[0];
    this.p.x = pos.x;
    this.p.z = pos.z;
    this.p.y = s.top;
    this.v.x = this.v.y = this.v.z = 0;
    this.yaw = yaw;
    this.mode = 'run';
    this.grounded = true;
    this.ground = 0;
    this.lastGroundY = s.top;
    this.time = 0;
    this.cp = 0;
    this.lap = 0;
    this.liftT = 0;
    this.falls = 0;
    this.beard = 0;
    this.coyote = 0;
    this.buffer = 0;
    this.knockT = 0;
    this.touchingFriend = false;
    this.splashT = 0;
    this.rope = { state: 'parked', theta: ROPE.parked, omega: 0, t: 0, from: ROPE.parked };
    for (let i = 0; i < this.blasted.length; i++) this.blasted[i] = this.hitBy[i] = false;
    for (const st of this.solids) {
      st.dip = st.dipV = st.tx = st.tz = st.tvx = st.tvz = 0;
      st.angle = 0;
      st.touched = 99;
    }
  }

  /**
   * This run's surprise: two of the pool floats become slow turntables (which ones and which way
   * change every run). `seed` picks them deterministically.
   */
  setSpinners(seed: number): number[] {
    const floats = SOLIDS.map((s, i) => (s.kind === 'float' ? i : -1)).filter((i) => i >= 0);
    for (const i of floats) {
      this.solids[i].spin = 0;
      this.solids[i].angle = 0;
    }
    const a = floats[Math.abs(seed) % floats.length];
    const b = floats[(Math.abs(seed) + 1 + (Math.abs(seed) % 2)) % floats.length];
    const dir = seed % 2 === 0 ? 1 : -1;
    this.solids[a].spin = 0.9 * dir;
    if (b !== a) this.solids[b].spin = -0.75 * dir;
    return [a, b];
  }

  /** Clock the cannons follow: the run clock in a run, else the world clock. */
  cannonClock(): number {
    return this.running ? this.time : this.worldTime;
  }

  /** Surface height of solid `i` under (x, z), or null when (x, z) is off it. */
  surface(i: number, x: number, z: number): number | null {
    const s = SOLIDS[i];
    const st = this.solids[i];
    const m = RUN.foot;
    const dx = x - s.x;
    const dz = z - s.z;
    if (s.shape === 'box') {
      if (Math.abs(dx) > (s.hx ?? 0) + m || Math.abs(dz) > (s.hz ?? 0) + m) return null;
    } else if (dx * dx + dz * dz > ((s.r ?? 0) + m) ** 2) return null;
    const hx = halfX(s);
    const hz = halfZ(s);
    const cx = clamp(dx, -hx, hx);
    const cz = clamp(dz, -hz, hz);
    return s.top - st.dip + st.bob + st.tx * cx + st.tz * cz + (s.slopeZ ?? 0) * cz;
  }

  /** Main-route progress 0..1 (for the HUD bar), gated by the checkpoint reached. */
  progress(): number {
    if (this.mode === 'done') return 1;
    if (this.mode === 'lift') return (this.lap + Math.min(1, this.liftT / LIFT.seconds) * 0.02) / LAPS;
    let total = 0;
    const lens: number[] = [];
    for (let i = 1; i < ROUTE.length; i++) {
      const a = ROUTE[i - 1];
      const b = ROUTE[i];
      const l = Math.hypot(b.x - a.x, b.z - a.z);
      lens.push(l);
      total += l;
    }
    let best = -1;
    let bestD = Infinity;
    let acc = 0;
    for (let i = 1; i < ROUTE.length; i++) {
      const a = ROUTE[i - 1];
      const b = ROUTE[i];
      const l = lens[i - 1];
      if (a.cp === this.cp) {
        const ux = b.x - a.x;
        const uz = b.z - a.z;
        const t = l > 0 ? clamp(((this.p.x - a.x) * ux + (this.p.z - a.z) * uz) / (l * l), 0, 1) : 0;
        const d = Math.hypot(a.x + ux * t - this.p.x, a.z + uz * t - this.p.z);
        if (d < bestD) {
          bestD = d;
          best = acc + l * t;
        }
      }
      acc += l;
    }
    return clamp((this.lap + clamp(best / total, 0, 0.99)) / LAPS, 0, 0.99);
  }

  /** Advance the moving parts (always, while the player is near). */
  stepWorld(dt: number, events: SimEvent[] = []): SimEvent[] {
    this.worldTime += dt;
    const wt = this.worldTime;
    for (let i = 0; i < SOLIDS.length; i++) {
      const s = SOLIDS[i];
      const st = this.solids[i];
      st.touched += dt;
      const on = this.running && this.grounded && this.ground === i && (this.mode === 'run' || this.mode === 'slide');
      if (s.kind === 'float' || s.kind === 'plank' || s.kind === 'block') {
        // Tilt toward where the hero stands; spring back when empty.
        let wantX: number;
        let wantZ = 0;
        if (on) {
          const ox = clamp((this.p.x - s.x) / halfX(s), -1, 1);
          const oz = clamp((this.p.z - s.z) / halfZ(s), -1, 1);
          if (s.kind === 'float') {
            wantX = -ox * RUN.floatMaxTilt;
            wantZ = -oz * RUN.floatMaxTilt;
          } else if (s.kind === 'block') {
            wantX = -ox * RUN.blockMaxTilt;
            wantZ = -oz * RUN.blockMaxTilt;
          } else wantX = -ox * RUN.plankMaxRoll;
          st.touched = 0;
        } else {
          wantX = 0.03 * Math.sin(wt * 1.3 + i * 1.7);
          wantZ = s.kind === 'float' ? 0.03 * Math.cos(wt * 1.1 + i) : 0;
        }
        const k = s.kind === 'float' ? 10 : s.kind === 'block' ? 40 : 22;
        st.tvx += ((wantX - st.tx) * k - st.tvx * 6) * dt;
        st.tvz += ((wantZ - st.tz) * k - st.tvz * 6) * dt;
        st.tx += st.tvx * dt;
        st.tz += st.tvz * dt;
        const dipWant = on ? (s.kind === 'float' ? 0.1 : s.kind === 'plank' ? 0.14 : 0.03) : 0;
        st.dipV += ((dipWant - st.dip) * 60 - st.dipV * 7) * dt;
        st.dip += st.dipV * dt;
        if (s.kind === 'float') {
          st.bob = 0.05 * Math.sin(wt * 1.9 + i * 2.3);
          if (st.spin !== 0) {
            const da = st.spin * dt;
            st.angle += da;
            // A turntable float carries you round with it.
            if (on) {
              const dx = this.p.x - s.x;
              const dz = this.p.z - s.z;
              const c = Math.cos(da);
              const sn = Math.sin(da);
              this.p.x = s.x + dx * c + dz * sn;
              this.p.z = s.z - dx * sn + dz * c;
              this.yaw += da;
            }
          }
        }
      } else if (s.kind === 'bubble') {
        st.bob = 0.12 * Math.sin(wt * 2.2 + i * 1.9);
        st.dipV += (-st.dip * 90 - st.dipV * 9) * dt;
        st.dip += st.dipV * dt;
      }
    }
    // Rope: parked sway, or easing back after a swing.
    const r = this.rope;
    if (r.state === 'parked') r.theta = ROPE.parked + 0.03 * Math.sin(wt * 1.6);
    else if (r.state === 'return') {
      r.t += dt;
      const k = Math.min(1, r.t / 1.6);
      const e = k * k * (3 - 2 * k);
      r.theta = r.from + (ROPE.parked - r.from) * e;
      if (k >= 1) r.state = 'parked';
    }
    // Cannons: report the start of each puff.
    const clock = this.cannonClock();
    for (let c = 0; c < CANNONS.length; c++) {
      const blast = cannonState(clock, CANNONS[c].offset).state === 'blast';
      if (blast && !this.blasted[c]) events.push({ type: 'puff', cannon: c });
      if (!blast) this.hitBy[c] = false;
      this.blasted[c] = blast;
    }
    return events;
  }

  /** One fixed step of a run: world + hero. Returns what happened. */
  step(dt: number, input: SimInput): SimEvent[] {
    const events: SimEvent[] = [];
    if (this.running && this.mode !== 'done') this.time += dt;
    this.stepWorld(dt, events);
    if (!this.running) return events;
    this.beard = Math.max(0, this.beard - dt);
    switch (this.mode) {
      case 'run':
        this.stepRun(dt, input, events);
        break;
      case 'swing':
        this.stepSwing(dt, input, events);
        break;
      case 'slide':
        this.stepSlide(dt, input, events);
        break;
      case 'splash':
        this.stepSplash(dt, events);
        break;
      case 'lift':
        this.stepLift(dt, events);
        break;
      case 'done':
        this.v.x = this.v.z = 0;
        break;
    }
    return events;
  }

  private stepRun(dt: number, input: SimInput, events: SimEvent[]): void {
    const p = this.p;
    const v = this.v;
    const wasGrounded = this.grounded;
    const groundSolid = wasGrounded && this.ground >= 0 ? SOLIDS[this.ground] : null;
    const gs = groundSolid ? this.solids[this.ground] : null;

    // Horizontal: approach the wanted velocity (+ downhill slip on a tipped float or plank).
    const mag = Math.min(1, Math.hypot(input.mx, input.mz));
    const speed = input.sprint ? RUN.sprint : RUN.walk;
    let tx = mag > 0 ? (input.mx / Math.hypot(input.mx, input.mz)) * mag * speed : 0;
    let tz = mag > 0 ? (input.mz / Math.hypot(input.mx, input.mz)) * mag * speed : 0;
    let accel: number = wasGrounded ? RUN.accelGround : RUN.accelAir;
    this.knockT = Math.max(0, this.knockT - dt);
    if (this.knockT > 0) accel = 0;
    if (gs && groundSolid && (groundSolid.kind === 'float' || groundSolid.kind === 'plank' || groundSolid.kind === 'block')) {
      if (groundSolid.kind !== 'block') accel = RUN.accelSoapy;
      const slope = Math.hypot(gs.tx, gs.tz);
      if (slope > RUN.slipStart) {
        const k = ((slope - RUN.slipStart) * RUN.slipGain) / slope;
        tx -= gs.tx * k;
        tz -= gs.tz * k;
      }
    }
    const dvx = tx - v.x;
    const dvz = tz - v.z;
    const dl = Math.hypot(dvx, dvz);
    const maxDv = accel * dt;
    if (dl > maxDv) {
      v.x += (dvx / dl) * maxDv;
      v.z += (dvz / dl) * maxDv;
    } else {
      v.x = tx;
      v.z = tz;
    }

    // Jump (buffered, with coyote time).
    this.buffer = input.jumpPressed ? RUN.buffer : Math.max(0, this.buffer - dt);
    this.coyote = wasGrounded ? RUN.coyote : Math.max(0, this.coyote - dt);
    if (this.buffer > 0 && this.coyote > 0) {
      v.y = RUN.jump;
      this.grounded = false;
      this.ground = -1;
      this.buffer = 0;
      this.coyote = 0;
      events.push({ type: 'jump' });
    }
    if (!this.grounded || v.y > 0) v.y -= RUN.gravity * dt;

    const prevY = p.y;
    p.x += v.x * dt;
    p.y += v.y * dt;
    p.z += v.z * dt;

    // Just walked off an edge (coyote time): still allowed to step onto the next surface.
    const soft = (wasGrounded || this.coyote > 0) && v.y <= 0.01;
    const refY = soft ? Math.max(p.y, this.lastGroundY) : p.y;
    this.resolveSides(soft, Math.max(refY, prevY));
    this.confine();
    this.resolveProps();
    this.resolveGround(Math.max(prevY, soft ? this.lastGroundY : prevY), soft, events);
    if (this.grounded) this.lastGroundY = p.y;

    // Face where we go.
    if (Math.hypot(v.x, v.z) > 0.6) {
      const want = Math.atan2(v.x, v.z);
      let d = want - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 14);
    }

    this.checkHazards(events);
    if (this.mode !== 'run') return;
    this.checkRope(events);
  }

  private resolveSides(grounded: boolean, refY: number): void {
    const p = this.p;
    const v = this.v;
    const r = RUN.radius;
    for (let i = 0; i < SOLIDS.length; i++) {
      const s = SOLIDS[i];
      const top = s.top - this.solids[i].dip + this.solids[i].bob + (s.slopeZ ? s.slopeZ * clamp(p.z - s.z, -halfZ(s), halfZ(s)) : 0);
      // Standing on it or above it: no side push.
      if (refY >= top - (grounded ? RUN.stepUp : 0.08)) continue;
      if (p.y + RUN.height < solidBottom(s)) continue;
      if (s.shape === 'box') {
        const hx = (s.hx ?? 0) + r;
        const hz = (s.hz ?? 0) + r;
        const dx = p.x - s.x;
        const dz = p.z - s.z;
        if (Math.abs(dx) >= hx || Math.abs(dz) >= hz) continue;
        const px = hx - Math.abs(dx);
        const pz = hz - Math.abs(dz);
        if (px < pz) {
          p.x = s.x + Math.sign(dx || 1) * hx;
          if (v.x * Math.sign(dx || 1) < 0) v.x = 0;
        } else {
          p.z = s.z + Math.sign(dz || 1) * hz;
          if (v.z * Math.sign(dz || 1) < 0) v.z = 0;
        }
      } else {
        const rr = (s.r ?? 0) + r;
        const dx = p.x - s.x;
        const dz = p.z - s.z;
        const d = Math.hypot(dx, dz);
        if (d >= rr) continue;
        const nx = d > 1e-6 ? dx / d : 1;
        const nz = d > 1e-6 ? dz / d : 0;
        p.x = s.x + nx * rr;
        p.z = s.z + nz * rr;
        const vn = v.x * nx + v.z * nz;
        if (vn < 0) {
          v.x -= vn * nx;
          v.z -= vn * nz;
        }
      }
    }
  }

  /** Push the hero out of the props (booth, arch, blowers, machine, posts, poles): solid, never stood on. */
  private resolveProps(): void {
    for (const s of PROPS) {
      if (this.p.y >= s.top || this.p.y + RUN.height < s.bottom) continue;
      pushOut(this.p, this.v, s, RUN.radius);
    }
  }

  /**
   * Keep a run on the course: inside the rim over the pit, and on the entrance strip in front of
   * it. (Before, running or jumping off a float could carry the hero over the rim onto the hill.)
   */
  private confine(): void {
    const p = this.p;
    const v = this.v;
    // A hair inside the rim: the body may lean over the tube, the feet stay over the pit.
    const r = 0.05;
    const x0 = PIT.x0 + r;
    const x1 = PIT.x1 - r;
    if (p.x > x1) {
      p.x = x1;
      if (v.x > 0) v.x = 0;
    } else if (p.x < x0) {
      p.x = x0;
      if (v.x < 0) v.x = 0;
    }
    if (p.z > PIT.z1 - r) {
      p.z = PIT.z1 - r;
      if (v.z > 0) v.z = 0;
    } else if (p.z < RUN_BOUNDS.z0) {
      p.z = RUN_BOUNDS.z0;
      if (v.z < 0) v.z = 0;
    }
  }

  /**
   * The friend is solid: a cylinder at its feet `(x, y, z)`. Walking into them pushes you out with a
   * little comic bounce; returns a `bump` event on first contact.
   */
  bumpFriend(x: number, y: number, z: number): SimEvent[] {
    const out: SimEvent[] = [];
    if (!this.running || (this.mode !== 'run' && this.mode !== 'slide')) {
      this.touchingFriend = false;
      return out;
    }
    const dx = this.p.x - x;
    const dz = this.p.z - z;
    const d = Math.hypot(dx, dz);
    const rr = FRIEND_RADIUS + RUN.radius;
    if (d >= rr || Math.abs(this.p.y - y) > 1.3) {
      this.touchingFriend = false;
      return out;
    }
    const nx = d > 1e-6 ? dx / d : 0;
    const nz = d > 1e-6 ? dz / d : -1;
    this.p.x = x + nx * rr;
    this.p.z = z + nz * rr;
    const vn = this.v.x * nx + this.v.z * nz;
    if (vn < 0) {
      this.v.x -= vn * nx;
      this.v.z -= vn * nz;
    }
    if (!this.touchingFriend) {
      // Boing: a little hop back.
      this.v.x += nx * 2.2;
      this.v.z += nz * 2.2;
      if (this.grounded && this.mode === 'run') {
        this.v.y = 2.6;
        this.grounded = false;
        this.ground = -1;
      }
      out.push({ type: 'bump' });
    }
    this.touchingFriend = true;
    return out;
  }

  /** Highest surface under the hero that it could stand on, including the ground outside the pit. */
  private support(maxY: number): { h: number; i: number } | null {
    let best: { h: number; i: number } | null = null;
    for (let i = 0; i < SOLIDS.length; i++) {
      const h = this.surface(i, this.p.x, this.p.z);
      if (h === null || h > maxY) continue;
      if (!best || h > best.h) best = { h, i };
    }
    if (!this.inPit(this.p.x, this.p.z)) {
      const g = this.groundAt(this.p.x, this.p.z);
      if (g <= maxY && (!best || g > best.h)) best = { h: g, i: -1 };
    }
    return best;
  }

  inPit(x: number, z: number): boolean {
    return x > PIT.x0 && x < PIT.x1 && z > PIT.z0 && z < PIT.z1;
  }

  private resolveGround(prevY: number, wasGrounded: boolean, events: SimEvent[]): void {
    const p = this.p;
    const v = this.v;
    const sup = this.support(Math.max(prevY, p.y) + (wasGrounded ? RUN.stepUp : 0.05));
    if (sup && wasGrounded && p.y - sup.h <= RUN.snapDown) {
      p.y = sup.h;
      v.y = 0;
      this.grounded = true;
      this.ground = sup.i;
    } else if (sup && !wasGrounded && v.y <= 0 && p.y <= sup.h) {
      const speed = -v.y;
      p.y = sup.h;
      v.y = 0;
      this.grounded = true;
      this.ground = sup.i;
      const s = sup.i >= 0 ? SOLIDS[sup.i] : null;
      if (s) {
        const st = this.solids[sup.i];
        st.dipV += Math.min(3, speed * 0.25);
        st.touched = 0;
      }
      events.push({ type: 'land', speed, kind: s ? s.kind : 'deck' });
    } else {
      this.grounded = false;
      this.ground = -1;
    }
    if (!this.grounded || this.ground < 0) return;
    const s = SOLIDS[this.ground];
    if (s.kind === 'bubble') {
      v.y = RUN.bubbleBounce;
      this.grounded = false;
      this.solids[this.ground].dipV += 3.5;
      events.push({ type: 'bounce', id: s.id });
      this.ground = -1;
      return;
    }
    if (s.kind === 'chute') {
      this.mode = 'slide';
      events.push({ type: 'slide' });
      return;
    }
    if (s.cp !== undefined && s.cp === this.cp + 1) {
      this.cp = s.cp;
      events.push({ type: 'checkpoint', cp: s.cp });
    }
    if (s.id === FINISH_ID && this.cp >= 3) {
      v.x = v.z = 0;
      if (this.lap + 1 < LAPS) {
        // Lap done: a big bubble scoops you up and floats you back to the start line.
        this.lap++;
        this.cp = 0;
        this.mode = 'lift';
        this.liftT = 0;
        this.liftFrom.x = p.x;
        this.liftFrom.y = p.y;
        this.liftFrom.z = p.z;
        this.grounded = false;
        this.ground = -1;
        events.push({ type: 'lap', lap: this.lap });
        return;
      }
      this.lap = LAPS;
      this.mode = 'done';
      events.push({ type: 'finish', time: this.time });
    }
  }

  private checkHazards(events: SimEvent[]): void {
    const p = this.p;
    // Foam cannons: a puff pushes you off the walkway (once per puff).
    if (this.mode === 'run') {
      const clock = this.cannonClock();
      for (let c = 0; c < CANNONS.length; c++) {
        const can = CANNONS[c];
        if (this.hitBy[c] || cannonState(clock, can.offset).state !== 'blast') continue;
        if (p.x < can.x || p.x > CANNON.reachX || Math.abs(p.z - can.z) > CANNON.halfZ || p.y > CANNON.maxY) continue;
        // The puff blows at knee height: jump and it passes under you.
        if (p.y > this.walkwayTop() + CANNON.dodge) continue;
        this.hitBy[c] = true;
        // Foam battle: a comic knock-back along the walkway (not into the foam), pulled to its middle.
        this.v.x = (LANE_B - p.x) * 3;
        this.v.y = CANNON.knockY;
        this.v.z = CANNON.knockZ;
        this.knockT = 0.5;
        this.grounded = false;
        this.ground = -1;
        events.push({ type: 'puffHit', cannon: c });
      }
    }
    if (!this.grounded && this.inPit(p.x, p.z) && p.y < FOAM_Y - 0.05) this.splash(events);
    else if (p.y < -4) this.splash(events);
  }

  /** Height of the blower walkway's top. */
  private walkwayTop(): number {
    return WALK_TOP;
  }

  private splash(events: SimEvent[]): void {
    this.mode = 'splash';
    this.splashT = 0;
    this.falls++;
    this.beard = 10;
    this.p.y = Math.max(this.p.y, FOAM_Y - 0.15);
    this.v.x *= 0.15;
    this.v.z *= 0.15;
    this.v.y = 0;
    this.grounded = false;
    this.ground = -1;
    events.push({ type: 'splash', x: this.p.x, z: this.p.z });
  }

  private stepLift(dt: number, events: SimEvent[]): void {
    this.liftT += dt;
    const k = Math.min(1, this.liftT / LIFT.seconds);
    const e = k * k * (3 - 2 * k);
    const to = { x: START.hero.x, y: SOLIDS[0].top, z: START.hero.z };
    this.p.x = this.liftFrom.x + (to.x - this.liftFrom.x) * e;
    this.p.z = this.liftFrom.z + (to.z - this.liftFrom.z) * e;
    this.p.y = this.liftFrom.y + (to.y - this.liftFrom.y) * e + LIFT.height * Math.sin(Math.PI * k) + 0.25 * Math.sin(this.liftT * 9) * Math.sin(Math.PI * k);
    this.v.x = this.v.y = this.v.z = 0;
    this.yaw = 0;
    if (k < 1) return;
    this.mode = 'run';
    this.grounded = true;
    this.ground = 0;
    this.lastGroundY = this.p.y;
    events.push({ type: 'liftEnd' });
  }

  private stepSplash(dt: number, events: SimEvent[]): void {
    this.splashT += dt;
    this.p.x += this.v.x * dt;
    this.p.z += this.v.z * dt;
    this.p.y = Math.max(FOAM_Y - 1.05, this.p.y - dt * 0.9);
    if (this.splashT < RUN.splashTime) return;
    this.respawn();
    events.push({ type: 'respawn', cp: this.cp });
  }

  /** Back to the last checkpoint (foam fall or the R key). */
  respawn(): void {
    const c = CHECKPOINTS[this.cp];
    this.p.x = c.x;
    this.p.y = c.y;
    this.p.z = c.z;
    this.v.x = this.v.y = this.v.z = 0;
    this.yaw = c.yaw;
    this.mode = 'run';
    this.grounded = true;
    this.ground = -1;
    for (let i = 0; i < SOLIDS.length; i++) if (this.surface(i, c.x, c.z) !== null) this.ground = i;
    if (this.rope.state === 'held') {
      this.rope.state = 'return';
      this.rope.t = 0;
      this.rope.from = this.rope.theta;
    }
  }

  private checkRope(events: SimEvent[]): void {
    const r = this.rope;
    if (r.state !== 'parked') return;
    const e = ropeEnd(r.theta);
    const d = Math.hypot(this.p.x - e.x, this.p.z - e.z);
    if (d > ROPE.grab || this.p.y > e.y || this.p.y < e.y - ROPE.hang - 0.9) return;
    r.state = 'held';
    r.omega = 0;
    this.mode = 'swing';
    this.swingPassed = false;
    this.grounded = false;
    this.ground = -1;
    this.placeOnRope();
    events.push({ type: 'grab' });
  }

  private placeOnRope(): void {
    const e = ropeEnd(this.rope.theta);
    this.p.x = e.x;
    this.p.y = e.y - ROPE.hang;
    this.p.z = e.z;
    this.yaw = -Math.PI / 2;
  }

  private stepSwing(dt: number, input: SimInput, events: SimEvent[]): void {
    const r = this.rope;
    const n = 4;
    const h = dt / n;
    for (let k = 0; k < n; k++) {
      r.omega += (-RUN.gravity / ROPE.length) * Math.sin(r.theta) * h;
      r.theta += r.omega * h;
    }
    if (r.theta < 0) this.swingPassed = true;
    this.placeOnRope();
    const early = input.jumpPressed && r.theta < ROPE.parked - 0.15;
    const atFar = this.swingPassed && r.omega >= 0;
    if (!early && !atFar) return;
    // Let go: keep the rope end's velocity (plus a little hop on an early jump).
    const L = ROPE.length;
    this.v.x = L * Math.cos(r.theta) * r.omega - (atFar ? 1.2 : 0);
    this.v.y = L * Math.sin(r.theta) * r.omega + (early ? 3 : 0);
    this.v.z = 0;
    this.mode = 'run';
    this.grounded = false;
    this.ground = -1;
    r.state = 'return';
    r.t = 0;
    r.from = r.theta;
    events.push({ type: 'release', early: early && !atFar });
  }

  private stepSlide(dt: number, input: SimInput, events: SimEvent[]): void {
    const p = this.p;
    const v = this.v;
    // Downhill is −z: speed up to the slide speed; steer sideways inside the chute walls.
    v.z = Math.max(-RUN.slideSpeed, v.z - RUN.slideAccel * dt);
    v.x = clamp(input.mx, -1, 1) * RUN.slideSteer;
    p.x = clamp(p.x + v.x * dt, CHUTE.x - CHUTE.hx + RUN.radius, CHUTE.x + CHUTE.hx - RUN.radius);
    p.z += v.z * dt;
    this.yaw = Math.PI;
    const ci = SOLIDS.findIndex((s) => s.kind === 'chute');
    const h = this.surface(ci, p.x, Math.max(p.z, CHUTE.z0));
    p.y = h ?? p.y;
    v.y = 0;
    if (p.z < CHUTE.z0 - RUN.foot - 0.01) {
      // Off the bottom: skid out onto the deck.
      this.mode = 'run';
      this.grounded = true;
      this.ground = -1;
      this.resolveGround(p.y, true, events);
      events.push({ type: 'slideEnd' });
    }
  }
}
