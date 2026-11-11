/**
 * The player's friends for the bumper games: the other heroes from the character catalog, loaded
 * lazily the first time a game starts (nothing is loaded or drawn while the games are idle) and
 * shared by Bubble Ball and Dino Sumo. If a model fails to load, a simple procedural stand-in takes
 * its place so a round can always start.
 */
import * as THREE from 'three';
import { CHARACTERS } from '../../core/characters/catalog';
import type { CharacterDef, CharacterId } from '../../core/characters/catalog';
import { loadCharacter } from '../../core/characters/load';
import type { PlayerAnim } from '../../types';

export interface Friend {
  readonly id: CharacterId;
  readonly def: CharacterDef;
  /** Feet at the origin, facing +Z. Position/rotate this. */
  readonly object: THREE.Group;
  play(anim: PlayerAnim | 'emote', rate?: number): void;
  update(dt: number): void;
}

function standIn(def: CharacterDef): Friend {
  const object = new THREE.Group();
  const [light, dark] = def.cardColors;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 0.7, 4, 12), new THREE.MeshStandardMaterial({ color: light, roughness: 0.6 }));
  body.position.y = 0.75;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), new THREE.MeshStandardMaterial({ color: dark, roughness: 0.5 }));
  head.position.y = 1.4;
  object.add(body, head);
  let t = 0;
  let anim: PlayerAnim | 'emote' = 'idle';
  return {
    id: def.id,
    def,
    object,
    play(a) {
      anim = a;
    },
    update(dt) {
      t += dt;
      const bob = anim === 'run' || anim === 'walk' ? Math.abs(Math.sin(t * 10)) * 0.08 : anim === 'cheer' ? Math.abs(Math.sin(t * 6)) * 0.25 : 0;
      body.position.y = 0.75 + bob;
      head.position.y = 1.4 + bob;
    },
  };
}

export interface FriendPool {
  /** `count` friends that are not `exclude` (the player's hero), loading them if needed. */
  get(count: number, exclude: string): Promise<Friend[]>;
  /** Already loaded (no await): handy for tests. */
  readonly loaded: number;
  dispose(): void;
}

export function createFriendPool(): FriendPool {
  const cache = new Map<CharacterId, Promise<Friend>>();
  let loaded = 0;
  let disposed = false;

  const load = (def: CharacterDef): Promise<Friend> => {
    let p = cache.get(def.id);
    if (!p) {
      p = loadCharacter(def)
        .then((c): Friend => {
          // Friends only cast shadows through their game's shadow proxies.
          c.object.traverse((o) => {
            o.castShadow = false;
          });
          return { id: def.id, def, object: c.object, play: (a, rate) => c.play(a, rate), update: (dt) => c.update(dt) };
        })
        .catch((): Friend => standIn(def))
        .then((f) => {
          loaded++;
          return f;
        });
      cache.set(def.id, p);
    }
    return p;
  };

  return {
    get loaded() {
      return loaded;
    },
    async get(count, exclude) {
      const defs = CHARACTERS.filter((c) => c.id !== exclude).slice(0, count);
      const friends = await Promise.all(defs.map(load));
      if (disposed) return [];
      return friends;
    },
    dispose() {
      disposed = true;
      for (const p of cache.values()) {
        void p.then((f) => {
          f.object.removeFromParent();
          f.object.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) {
              m.geometry.dispose();
              const mats = Array.isArray(m.material) ? m.material : [m.material];
              for (const mat of mats) mat.dispose();
            }
          });
        });
      }
      cache.clear();
    },
  };
}

let shared: FriendPool | null = null;
let users = 0;

/** One pool for both games (friends load once). Call `release` from each game's dispose. */
export function acquireFriendPool(): FriendPool {
  users++;
  shared ??= createFriendPool();
  return shared;
}

export function releaseFriendPool(): void {
  users = Math.max(0, users - 1);
  if (users === 0 && shared) {
    shared.dispose();
    shared = null;
  }
}
