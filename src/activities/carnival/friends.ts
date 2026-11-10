/**
 * Friends: two of the other heroes join each game as cheerful rivals. Loaded lazily the first time
 * a round starts (`loadCharacter`), cached, and only in the scene during a round.
 */
import * as THREE from 'three';
import type { PlayerAnim } from '../../types';
import { CHARACTERS } from '../../core/characters/catalog';
import type { CharacterDef } from '../../core/characters/catalog';
import { loadCharacter } from '../../core/characters/load';
import type { LoadedCharacter } from '../../core/characters/load';

/** The two friends for a player hero: the next two heroes in the catalog (stable, never the player). */
export function pickFriends(playerId: string, ids: readonly string[] = CHARACTERS.map((c) => c.id)): [string, string] {
  const i = Math.max(0, ids.indexOf(playerId));
  const others = [...ids.slice(i + 1), ...ids.slice(0, i)].filter((id) => id !== playerId);
  return [others[0] ?? ids[0], others[1] ?? ids[1] ?? ids[0]];
}

export interface Friend {
  readonly def: CharacterDef;
  readonly root: THREE.Group;
  loaded: LoadedCharacter | null;
  /** Seconds left on a one-shot action before going back to idle. */
  hold: number;
  anim: PlayerAnim | 'emote';
}

const cache = new Map<string, Promise<LoadedCharacter | null>>();

function load(def: CharacterDef): Promise<LoadedCharacter | null> {
  let p = cache.get(def.id);
  if (!p) {
    p = loadCharacter(def).catch((err: unknown) => {
      console.warn(`carnival: friend ${def.id} failed to load`, err);
      return null;
    });
    cache.set(def.id, p);
  }
  return p;
}

export class Friends {
  readonly list: Friend[] = [];
  private shown = false;

  constructor(private readonly parent: THREE.Object3D) {}

  /** Make sure the friends for this hero exist (models stream in; play goes on meanwhile). */
  prepare(playerId: string): Friend[] {
    const ids = pickFriends(playerId);
    if (this.list.length === 2 && this.list[0].def.id === ids[0] && this.list[1].def.id === ids[1]) return this.list;
    for (const f of this.list) this.parent.remove(f.root);
    this.list.length = 0;
    for (const id of ids) {
      const def = CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
      const f: Friend = { def, root: new THREE.Group(), loaded: null, hold: 0, anim: 'idle' };
      f.root.name = `carnival-friend-${def.id}`;
      f.root.visible = this.shown;
      this.parent.add(f.root);
      this.list.push(f);
      void load(def).then((c) => {
        if (!c || !this.list.includes(f)) return;
        f.loaded = c;
        f.root.add(c.object);
        c.play(f.anim);
      });
    }
    return this.list;
  }

  /** Is every friend model loaded? */
  get ready(): boolean {
    return this.list.length > 0 && this.list.every((f) => f.loaded !== null);
  }

  setVisible(on: boolean): void {
    this.shown = on;
    for (const f of this.list) f.root.visible = on;
  }

  /** Place friend `i` (parent frame) facing `yaw`. */
  place(i: number, x: number, y: number, z: number, yaw: number): void {
    const f = this.list[i];
    if (!f) return;
    f.root.position.set(x, y, z);
    f.root.rotation.set(0, yaw, 0);
  }

  /** Play an animation; with `hold` > 0 it returns to idle afterwards. */
  act(i: number, anim: PlayerAnim | 'emote', hold = 0): void {
    const f = this.list[i];
    if (!f) return;
    f.anim = anim;
    f.hold = hold;
    f.loaded?.play(anim, 1, 0.15, true);
  }

  update(dt: number): void {
    if (!this.shown) return;
    for (const f of this.list) {
      if (f.hold > 0) {
        f.hold -= dt;
        if (f.hold <= 0) {
          f.anim = 'idle';
          f.loaded?.play('idle');
        }
      }
      f.loaded?.update(dt);
    }
  }

  dispose(): void {
    for (const f of this.list) this.parent.remove(f.root);
    this.list.length = 0;
  }
}
