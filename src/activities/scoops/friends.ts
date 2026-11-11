/**
 * Two friends (other heroes from the character catalog) hang out on the parlour terrace, queue up
 * at the counter when the player starts building, and react to the cone: wave, cheer at a tall
 * stack, laugh (cheer + hop) at a topple, dance when it is eaten. The friend whose recipe card was
 * matched gets an identical cone and chomps along. Loaded lazily when the player comes near; not
 * updated when the player is far away.
 */
import * as THREE from 'three';
import type { PlayerAnim } from '../../types';
import { CHARACTER_IDS, getCharacter } from '../../core/characters/catalog';
import type { CharacterId } from '../../core/characters/catalog';
import { loadCharacter } from '../../core/characters/load';
import { asShadowProxy } from '../../core/shadow-proxy';
import type { LoadedCharacter } from '../../core/characters/load';
import { ConeView } from './coneView';
import type { ConeState } from './coneView';
import { LAYOUT } from './parlour';

export type FriendReaction = 'wave' | 'cheer' | 'laugh' | 'dance';

interface Friend {
  id: CharacterId;
  char: LoadedCharacter | null;
  root: THREE.Group;
  pos: THREE.Vector3;
  yaw: number;
  target: THREE.Vector3;
  anim: PlayerAnim;
  /** Seconds left of a reaction pose. */
  react: number;
  reactAnim: PlayerAnim;
  hop: number;
  cone: ConeView | null;
}

export interface Friends {
  /** Ids of the two friends (character catalog). */
  readonly ids: readonly CharacterId[];
  /** Card colour (light) of friend `i` for the recipe card. */
  color(i: number): string;
  setQueue(on: boolean): void;
  react(kind: FriendReaction, who?: number): void;
  /** Give friend `i` a copy of the cone (null takes it away). */
  giveCone(i: number, state: ConeState | null): void;
  /** Friend `i` eats their copy: 0..1. */
  setEaten(i: number, f: number): void;
  /** `local` = the player's position in the parlour frame; `near` = player within update range. */
  update(dt: number, local: THREE.Vector3, near: boolean): void;
  readonly loaded: boolean;
  dispose(): void;
}

const PREFERRED: readonly CharacterId[] = ['panda', 'frog', 'bee', 'flamingo', 'robot', 'rex'];

export function pickFriends(playerId: string): CharacterId[] {
  const out: CharacterId[] = [];
  for (const id of PREFERRED) if (id !== playerId && CHARACTER_IDS.includes(id) && out.length < 2) out.push(id);
  return out;
}

const angleDelta = (a: number, b: number): number => Math.atan2(Math.sin(b - a), Math.cos(b - a));

export function createFriends(parent: THREE.Object3D, playerId: string): Friends {
  const ids = pickFriends(playerId);
  const friends: Friend[] = ids.map((id, i) => {
    const root = new THREE.Group();
    root.name = `Scoops.friend.${id}`;
    const pos = LAYOUT.hangout[i].clone();
    root.position.copy(pos);
    parent.add(root);
    return { id, char: null, root, pos, yaw: Math.PI, target: pos.clone(), anim: 'idle', react: 0, reactAnim: 'idle', hop: 0, cone: null };
  });
  const proxyGeo = new THREE.CapsuleGeometry(0.3, 0.8, 2, 8);
  let queue = false;
  let loading = false;
  let loaded = false;
  let disposed = false;
  let time = 0;

  /** Models that finished loading, waiting for the next update() to be attached. */
  const arrived: Array<[Friend, LoadedCharacter]> = [];
  const attachArrived = (): void => {
    for (const [f, c] of arrived) {
      f.char = c;
      // The detailed model skips the shadow pass; a capsule stand-in casts the shadow.
      c.object.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = false;
      });
      f.root.add(c.object, asShadowProxy(new THREE.Mesh(proxyGeo)).translateY(0.75));
      c.play(f.anim);
    }
    arrived.length = 0;
    loaded = friends.every((x) => x.char);
  };

  const load = (): void => {
    if (loading) return;
    loading = true;
    for (const f of friends) {
      loadCharacter(getCharacter(f.id))
        .then((c) => {
          // Attached on the next update(), not here: a model landing from a promise between two
          // renders would change a frozen (test) frame that no simulation step advanced.
          if (!disposed) arrived.push([f, c]);
        })
        .catch((err: unknown) => console.warn('scoops: friend failed to load', err));
    }
  };

  const play = (f: Friend, a: PlayerAnim, restart = false): void => {
    if (f.anim === a && !restart) return;
    f.anim = a;
    f.char?.play(a, 1, 0.2, restart);
  };

  return {
    ids,
    color(i) {
      return ids[i] ? getCharacter(ids[i]).cardColors[0] : '#ffffff';
    },
    get loaded() {
      return loaded;
    },
    setQueue(on) {
      queue = on;
      friends.forEach((f, i) => f.target.copy(on ? LAYOUT.queue[i] : LAYOUT.hangout[i]));
    },
    react(kind, who) {
      friends.forEach((f, i) => {
        if (who !== undefined && who !== i) return;
        // Stagger so the two don't move in lock-step.
        const delay = i * 0.12;
        f.react = (kind === 'dance' ? 3.2 : kind === 'wave' ? 1.6 : 1.3) + delay;
        f.reactAnim = kind === 'dance' ? 'dance' : kind === 'wave' ? 'wave' : 'cheer';
        f.hop = kind === 'laugh' || kind === 'cheer' ? 1 + delay : 0;
        play(f, f.reactAnim, true);
      });
    },
    giveCone(i, state) {
      const f = friends[i];
      if (!f) return;
      if (!state) {
        f.cone?.dispose();
        f.cone?.root.removeFromParent();
        f.cone = null;
        return;
      }
      if (!f.cone) {
        f.cone = new ConeView(f.root, () => 0, 0.75);
        f.cone.root.position.set(0.28, 1.05, 0.32);
        f.root.add(f.cone.root);
      }
      f.cone.set(state);
    },
    setEaten(i, k) {
      const f = friends[i];
      if (!f?.cone) return;
      f.cone.setEaten(k);
      // Lift the cone toward the mouth while eating.
      f.cone.root.position.set(0.28 - 0.22 * Math.min(1, k * 3), 1.05 + 0.2 * Math.min(1, k * 3), 0.32);
    },
    update(dt, local, near) {
      if (arrived.length) attachArrived();
      if (!near) {
        for (const f of friends) f.root.visible = local.lengthSq() < 90 * 90;
        return;
      }
      load();
      time += dt;
      friends.forEach((f, i) => {
        f.root.visible = true;
        const to = new THREE.Vector3().subVectors(f.target, f.pos);
        to.y = 0;
        const d = to.length();
        let wantYaw: number;
        if (d > 0.08) {
          const step = Math.min(d, 1.7 * dt);
          f.pos.addScaledVector(to.normalize(), step);
          wantYaw = Math.atan2(to.x, to.z);
          if (f.react <= 0) play(f, 'walk');
        } else {
          // Face the hero (behind the counter while building, else wherever they are).
          const look = queue ? LAYOUT.chef : local;
          wantYaw = Math.atan2(look.x - f.pos.x, look.z - f.pos.z);
          if (f.react <= 0) play(f, 'idle');
        }
        f.yaw += angleDelta(f.yaw, wantYaw) * (1 - Math.exp(-6 * dt));
        if (f.react > 0) {
          f.react -= dt;
          if (f.react <= 0) play(f, d > 0.08 ? 'walk' : 'idle');
        }
        let y = 0;
        if (f.hop > 0) {
          f.hop = Math.max(0, f.hop - dt);
          y = Math.abs(Math.sin(f.hop * Math.PI * 3)) * 0.22 * f.hop;
        }
        f.root.position.set(f.pos.x, f.pos.y + y + Math.sin(time * 2 + i) * 0.004, f.pos.z);
        f.root.rotation.y = f.yaw;
        f.char?.update(dt);
        f.cone?.update(dt);
      });
    },
    dispose() {
      disposed = true;
      proxyGeo.dispose();
      for (const f of friends) {
        f.cone?.dispose();
        f.root.removeFromParent();
        f.char?.mixer.stopAllAction();
      }
    },
  };
}
