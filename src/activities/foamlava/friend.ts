/**
 * The friend who races you: another hero from the catalog (never the one you play), loaded
 * lazily the first time a run starts, following the scripted, slightly clumsy ghost run in
 * scoring.ts. Lives in the course frame under the course root.
 */
import * as THREE from 'three';
import { CHARACTERS, getCharacter } from '../../core/characters/catalog';
import type { CharacterId } from '../../core/characters/catalog';
import { loadCharacter } from '../../core/characters/load';
import type { LoadedCharacter } from '../../core/characters/load';
import type { PlayerAnim } from '../../types';
import type { GhostPose } from './scoring';

export interface Friend {
  /** Pick (and load) a friend that isn't `playerId`. Resolves when it is ready (or failed). */
  prepare(playerId: string, runIndex: number): Promise<void>;
  readonly id: CharacterId | null;
  /** Card colour (light) for the HUD dot. */
  readonly color: string;
  setVisible(on: boolean): void;
  pose(p: GhostPose, dt: number): void;
  /** Wave/cheer while waiting. */
  idle(x: number, y: number, z: number, yaw: number, anim: PlayerAnim, dt: number): void;
  dispose(): void;
}

const ORDER: readonly CharacterId[] = ['frog', 'panda', 'bee', 'flamingo', 'rex', 'robot'];

export function createFriend(parent: THREE.Object3D): Friend {
  const cache = new Map<CharacterId, Promise<LoadedCharacter | null>>();
  let current: LoadedCharacter | null = null;
  let id: CharacterId | null = null;
  let visible = false;
  let anim: PlayerAnim | null = null;

  function play(a: PlayerAnim): void {
    if (!current || a === anim) return;
    anim = a;
    current.play(a, a === 'run' ? 1.1 : 1, 0.15, a === 'jump' || a === 'flop');
  }

  return {
    get id() {
      return id;
    },
    get color() {
      return id ? getCharacter(id).cardColors[0] : '#f4f4f4';
    },
    async prepare(playerId, runIndex) {
      const choices = ORDER.filter((c) => c !== playerId && CHARACTERS.some((d) => d.id === c));
      const want = choices[runIndex % choices.length];
      if (want === id && current) return;
      let p = cache.get(want);
      if (!p) {
        p = loadCharacter(getCharacter(want)).catch((err: unknown) => {
          console.warn('foamlava: friend failed to load', err);
          return null;
        });
        cache.set(want, p);
      }
      const loaded = await p;
      if (current) current.object.removeFromParent();
      current = loaded;
      id = loaded ? want : null;
      anim = null;
      if (current) {
        current.object.visible = visible;
        parent.add(current.object);
      }
    },
    setVisible(on) {
      visible = on;
      if (current) current.object.visible = on;
    },
    pose(p, dt) {
      if (!current) return;
      const o = current.object;
      o.position.set(p.x, p.y, p.z);
      o.rotation.set(p.anim === 'fall' ? 1.2 : 0, p.yaw, 0, 'YXZ');
      if (p.anim === 'fall') o.position.y += 0.35;
      play(p.anim === 'fall' ? 'fall' : p.anim);
      current.update(dt);
    },
    idle(x, y, z, yaw, a, dt) {
      if (!current) return;
      current.object.position.set(x, y, z);
      current.object.rotation.set(0, yaw, 0);
      play(a);
      current.update(dt);
    },
    dispose() {
      if (current) current.object.removeFromParent();
      current = null;
    },
  };
}
