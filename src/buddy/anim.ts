/**
 * Procedural animation for Pip: gait (trot/gallop), sit, sniff, cower, dance, lick, belly-down
 * freefall, cling; plus secondary motion (ear springs, tail wag, blinks, pupils that follow a
 * target, eyebrows, panting tongue). Writes bone transforms of a `PipModel` every frame.
 */
import * as THREE from 'three';
import type { BoneName, PipModel } from './model';

export type Pose = 'stand' | 'sit' | 'sniff' | 'cower' | 'dance' | 'lick' | 'belly' | 'cling' | 'ride';
export type Face = 'happy' | 'excited' | 'curious' | 'worried' | 'proud' | 'silly';

export interface AnimInput {
  pose: Pose;
  /** Ground speed m/s (drives the gait). */
  speed: number;
  /** Turn rate rad/s (body leans into turns). */
  turn: number;
  /** World-space point Pip looks at (head + pupils), or null to look ahead. */
  look: THREE.Vector3 | null;
  /** Head tilt (curious idle), radians. */
  tilt: number;
  /** 0..1 tail wag energy. */
  wag: number;
  /** 0..1 wind on the ears (riding, falling). */
  wind: number;
  /** Bounce height offset (hops, trampoline), metres. */
  hop: number;
  face: Face;
  /** Mouth open / bark impulse 0..1. */
  bark: number;
  /** Panting tongue 0..1. */
  pant: number;
  goggles: boolean;
}

export function defaultInput(): AnimInput {
  return { pose: 'stand', speed: 0, turn: 0, look: null, tilt: 0, wag: 0.5, wind: 0, hop: 0, face: 'happy', bark: 0, pant: 0, goggles: false };
}

const POSES: Pose[] = ['sit', 'sniff', 'cower', 'dance', 'lick', 'belly', 'cling', 'ride'];

function damp(cur: number, target: number, rate: number, dt: number): number {
  return target + (cur - target) * Math.exp(-rate * dt);
}

class Spring {
  x = 0;
  v = 0;
  constructor(
    private k: number,
    private d: number,
  ) {}
  step(target: number, dt: number): number {
    const a = (target - this.x) * this.k - this.v * this.d;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
  kick(v: number): void {
    this.v += v;
  }
}

const tmpM = new THREE.Matrix4();
const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

export class PipAnimator {
  private t = 0;
  private gait = 0;
  private w: Record<Pose, number> = { stand: 1, sit: 0, sniff: 0, cower: 0, dance: 0, lick: 0, belly: 0, cling: 0, ride: 0 };
  private speedS = 0;
  private turnS = 0;
  private headYaw = 0;
  private headPitch = 0;
  private tiltS = 0;
  private wagS = 0.5;
  private windS = 0;
  private barkS = 0;
  private pantS = 0;
  private gog = 0;
  private blinkT = 2;
  private blink = 0;
  private squint = 0;
  private worry = 0;
  private lookX = 0;
  private lookY = 0;
  private earL = new Spring(70, 5);
  private earR = new Spring(70, 5);
  private earLx = new Spring(60, 5);
  private earRx = new Spring(60, 5);
  private seed = 0.37;
  private prevHop = 0;

  constructor(private readonly m: PipModel) {}

  /** Make the ears flop (landing, a sudden stop). */
  jolt(amount: number): void {
    this.earL.kick(amount * 6);
    this.earR.kick(-amount * 6);
    this.earLx.kick(-amount * 4);
    this.earRx.kick(-amount * 4);
  }

  update(rawDt: number, inp: AnimInput): void {
    // The first real frame can report a slightly negative dt; springs and dampers need dt > 0.
    const dt = Math.min(0.1, Math.max(0, rawDt));
    if (dt <= 0) return;
    this.t += dt;
    const t = this.t;
    const b = this.m.bones;
    const r = this.m.rest;

    // Pose weights fade (0.2 s).
    for (const p of POSES) this.w[p] = damp(this.w[p], inp.pose === p ? 1 : 0, 10, dt);
    const w = this.w;
    const sit = w.sit + w.ride * 0.9;
    this.speedS = damp(this.speedS, inp.speed, 8, dt);
    this.turnS = damp(this.turnS, inp.turn, 6, dt);
    this.tiltS = damp(this.tiltS, inp.tilt, 5, dt);
    this.wagS = damp(this.wagS, inp.wag, 4, dt);
    this.windS = damp(this.windS, inp.wind, 5, dt);
    this.barkS = Math.max(inp.bark, damp(this.barkS, 0, 9, dt));
    this.pantS = damp(this.pantS, inp.pant, 4, dt);
    this.gog = damp(this.gog, inp.goggles ? 1 : 0, 8, dt);
    const happy = inp.face === 'happy' || inp.face === 'excited' || inp.face === 'proud' || inp.face === 'silly';
    this.squint = damp(this.squint, inp.face === 'excited' || inp.face === 'proud' ? 1 : 0, 6, dt);
    this.worry = damp(this.worry, inp.face === 'worried' || w.cower > 0.5 ? 1 : 0, 6, dt);

    // Gait: trot below 4 m/s, gallop above.
    const moving = Math.min(1, this.speedS / 1.2) * (1 - sit) * (1 - w.belly) * (1 - w.cling);
    const run = Math.min(1, Math.max(0, (this.speedS - 4) / 3));
    const stride = 0.34 + run * 0.4;
    this.gait += dt * (this.speedS / stride) * Math.PI;
    const g = this.gait;
    const amp = moving * (0.55 + run * 0.35);
    const trot = (o: number): number => Math.sin(g + o);
    const legSwing = {
      legFL: (trot(0) * (1 - run) + trot(0) * run) * amp,
      legFR: (trot(Math.PI) * (1 - run) + trot(0.5) * run) * amp,
      legBL: (trot(Math.PI) * (1 - run) + trot(Math.PI) * run) * amp,
      legBR: (trot(0) * (1 - run) + trot(Math.PI + 0.5) * run) * amp,
    };
    const bob = Math.abs(Math.sin(g)) * 0.018 * moving * (1 + run);

    // ---- body ----
    const breathe = Math.sin(t * (2.2 + this.pantS * 6)) * (0.004 + this.pantS * 0.004);
    let bodyY = r.body.y + bob + breathe - sit * 0.055 - w.cower * 0.06 - w.sniff * 0.015 + w.dance * 0.06;
    let bodyPitch = -sit * 0.62 - w.dance * 1.05 + w.sniff * 0.12 + w.belly * 0.0 + run * moving * Math.sin(g * 1) * 0.08;
    let bodyRoll = -this.turnS * 0.06 * moving;
    if (w.dance > 0.01) bodyRoll += Math.sin(t * 9) * 0.18 * w.dance;
    if (w.lick > 0.01) bodyPitch += 0.15 * w.lick;
    bodyY -= w.belly * 0.0;
    b.body.position.set(r.body.x, bodyY + inp.hop, r.body.z - sit * 0.03);
    b.body.rotation.set(bodyPitch, 0, bodyRoll);
    if (w.belly > 0.01) {
      // Belly-down skydive: whole body flat, nose forward, slight wobble.
      b.body.rotation.x = bodyPitch * (1 - w.belly) + w.belly * (Math.PI / 2 - 0.25 + Math.sin(t * 3) * 0.05);
      b.body.rotation.z = bodyRoll + w.belly * Math.sin(t * 2.3) * 0.12;
      b.body.position.y = bodyY + inp.hop + w.belly * 0.05;
    }
    if (w.cling > 0.01) b.body.rotation.x = bodyPitch * (1 - w.cling) - w.cling * 0.2;

    // ---- head: look target, tilt, sniff, lick ----
    let yawT = 0;
    let pitchT = 0;
    if (inp.look) {
      b.head.updateMatrixWorld();
      tmpM.copy(b.head.matrixWorld).invert();
      tmpV.copy(inp.look).applyMatrix4(tmpM);
      // Undo current head rotation to get a stable target in the parent frame.
      tmpQ.setFromEuler(b.head.rotation);
      tmpV.applyQuaternion(tmpQ);
      yawT = Math.atan2(tmpV.x, Math.max(0.05, tmpV.z));
      pitchT = -Math.atan2(tmpV.y - 0.1, Math.hypot(tmpV.x, tmpV.z));
      yawT = Math.max(-0.9, Math.min(0.9, yawT));
      pitchT = Math.max(-0.5, Math.min(0.45, pitchT));
    }
    yawT *= 1 - w.belly * 0.7;
    this.headYaw = damp(this.headYaw, yawT, 7, dt);
    this.headPitch = damp(this.headPitch, pitchT, 7, dt);
    const sniffNod = w.sniff * (0.55 + Math.sin(t * 13) * 0.06);
    const lickNod = w.lick * (0.35 + Math.sin(t * 16) * 0.12);
    const barkNod = -this.barkS * 0.25;
    const walkNod = Math.sin(g * 2) * 0.04 * moving;
    b.head.rotation.set(
      this.headPitch * (1 - w.sniff) + sit * 0.55 + w.dance * 0.9 + sniffNod + lickNod + barkNod + walkNod - w.belly * 1.0 + w.cower * 0.35,
      this.headYaw * (1 - w.sniff * 0.6) + w.sniff * Math.sin(t * 1.7) * 0.35,
      this.tiltS + (w.sniff > 0.1 ? Math.sin(t * 2.9) * 0.08 : 0),
    );
    b.head.position.copy(r.head);

    // ---- legs ----
    const legs = ['legFL', 'legFR', 'legBL', 'legBR'] as const;
    for (const leg of legs) {
      const front = leg === 'legFL' || leg === 'legFR';
      const left = leg === 'legFL' || leg === 'legBL';
      const s = left ? 1 : -1;
      let x = legSwing[leg];
      let z = 0;
      if (front) {
        x += sit * 0.62; // stay vertical while the body sits up
        x += w.dance * (0.4 + Math.sin(t * 9 + (left ? 0 : Math.PI)) * 0.5) - w.dance * 1.6;
        x += -w.cower * 2.3; // paws over the eyes (peek!)
        z += w.cower * -0.3 * s;
        x += w.belly * (-1.3 + Math.sin(t * 10 + (left ? 0 : Math.PI)) * 0.6);
        z += w.belly * 0.5 * s;
        x += w.cling * -1.4;
      } else {
        x += -sit * 1.15 + w.dance * 0.9;
        x += w.belly * (1.2 + Math.sin(t * 10 + (left ? Math.PI : 0)) * 0.5);
        z += w.belly * 0.45 * s;
        x += w.cling * 0.6;
      }
      b[leg].rotation.set(x, 0, z);
      b[leg].position.copy(r[leg]);
    }

    // ---- tail ----
    const wagRate = 9 + this.wagS * 9;
    const wagAmp = (0.15 + this.wagS * 0.75) * (1 - w.cower * 0.8);
    const tailUp = -0.25 - this.wagS * 0.25 + w.cower * 1.1 + w.belly * 0.6;
    b.tail1.rotation.set(tailUp, Math.sin(t * wagRate) * wagAmp, 0);
    b.tail2.rotation.set(-0.2 + w.cower * 0.3, Math.sin(t * wagRate - 0.9) * wagAmp * 0.9, 0);

    // ---- ears: springs driven by bob, turn and wind ----
    const perk = happy ? 0.12 : 0;
    const earBack = w.cower * 0.9 + this.windS * 1.25 + w.belly * 0.6;
    const flutter = this.windS * Math.sin(t * 23) * 0.35;
    const bounce = (inp.hop - this.prevHop) / Math.max(dt, 1e-3);
    this.prevHop = inp.hop;
    const kick = -bounce * 0.05 + (Math.sin(g * 2) * 0.12 * moving);
    const eLz = this.earL.step(perk + this.turnS * 0.08 + kick + flutter, dt);
    const eRz = this.earR.step(-perk + this.turnS * 0.08 - kick - flutter, dt);
    const eLx = this.earLx.step(earBack + kick * 0.6 + this.barkS * 0.2, dt);
    const eRx = this.earRx.step(earBack + kick * 0.6 + this.barkS * 0.2, dt);
    b.earL.rotation.set(eLx, 0, eLz + w.dance * Math.sin(t * 9) * 0.3);
    b.earR.rotation.set(eRx, 0, eRz - w.dance * Math.sin(t * 9) * 0.3);

    // ---- eyes: blink, squint, pupils ----
    this.blinkT -= dt;
    if (this.blinkT <= 0) {
      this.blink = 1;
      this.seed = (this.seed * 9301 + 49297) % 233280;
      this.blinkT = 2.2 + (this.seed / 233280) * 3;
    }
    this.blink = Math.max(0, this.blink - dt * 7);
    const lid = Math.sin(this.blink * Math.PI);
    const open = Math.max(0.08, 1 - lid * 0.92 - this.squint * 0.4 + this.worry * 0.12 - w.belly * 0.05);
    for (const eye of ['eyeL', 'eyeR'] as const) {
      b[eye].scale.set(1 + this.worry * 0.08, open, 1);
      b[eye].position.copy(r[eye]);
    }
    // Pupils: towards the look target in head space (small, clamped).
    let px = 0;
    let py = 0;
    if (inp.look) {
      b.head.updateMatrixWorld(true);
      tmpM.copy(b.head.matrixWorld).invert();
      tmpV.copy(inp.look).applyMatrix4(tmpM);
      const len = Math.max(0.1, tmpV.length());
      px = Math.max(-1, Math.min(1, (tmpV.x / len) * 2.2));
      py = Math.max(-1, Math.min(1, ((tmpV.y - 0.1) / len) * 2.2));
    }
    this.lookX = damp(this.lookX, px, 14, dt);
    this.lookY = damp(this.lookY, py, 14, dt);
    for (const pup of ['pupilL', 'pupilR'] as const) {
      const rp = r[pup];
      b[pup].position.set(rp.x + this.lookX * 0.011, rp.y + this.lookY * 0.009, rp.z);
      const big = 1 + this.worry * 0.12 + this.squint * 0.04;
      b[pup].scale.set(big, big, 1);
    }

    // ---- brows ----
    const browUp = 0.006 * (happy ? 1 : 0) + this.worry * 0.01 + (inp.face === 'curious' ? 0.008 : 0);
    const setBrow = (name: BoneName, s: number): void => {
      const rb = r[name];
      b[name].position.set(rb.x, rb.y + browUp, rb.z);
      const curious = inp.face === 'curious' && s > 0 ? 0.25 : 0;
      b[name].rotation.set(0, 0, s * (this.worry * 0.42 - this.squint * 0.15) + curious);
    };
    setBrow('browL', 1);
    setBrow('browR', -1);

    // ---- tongue + goggles ----
    const tongue = Math.max(this.pantS, w.lick, this.barkS * 0.6, w.dance * 0.7);
    const tScale = tongue < 0.02 ? 0.001 : tongue;
    b.tongue.scale.set(tScale, tScale, tScale * (1 + Math.sin(t * 14) * 0.1 * this.pantS));
    b.tongue.rotation.set(0.25 * tongue + w.lick * Math.sin(t * 16) * 0.3, 0, 0);
    b.tongue.position.copy(r.tongue);
    const gs = this.gog < 0.02 ? 0.0001 : this.gog;
    b.goggles.scale.setScalar(gs);
    b.goggles.position.copy(r.goggles);
  }
}
