/**
 * The glasses weave: Phase 2 parts that add a small weak-eye (or both-eyes-together) layer to
 * attractions that already exist. This module creates the parts from the registry (`./parts.ts`)
 * with a `WeaveEnv` each (contract: `./types.ts`), resets them when a session starts or the game
 * returns to the title, updates them only while the session is `playing`, disposes them, and in
 * test mode adds `window.__rgGlasses.weave`. Created by `createGlasses` (`../index.ts`); it has no
 * `register.ts` of its own. Hooks and designs per part: `./README.md`.
 */
import type * as THREE from 'three';
import type { GameContext, GameSystem, VisionLayer } from '../../../types';
import { hashString, seededRng } from '../idle';
import { pay, result } from '../rewards';
import { IDENTITY_CHALLENGE } from '../types';
import { WEAVE_PARTS } from './parts';
import type { WeavePartDef } from './parts';
import type { WeaveEnv, WeavePart } from './types';

export type { WeaveEnv, WeavePart } from './types';

/** `window.__rgGlasses.weave` (test mode only). */
export interface WeaveTestApi {
  ids(): string[];
  debug(id: string): Record<string, unknown>;
  force(id: string, params: Record<string, unknown>): void;
  reset(id: string): void;
  /** Draw calls of the part's visible objects. */
  draws(id: string): number;
}

export interface WeaveOptions {
  /** Draw-call counter for one object tree (the framework's `countDraws`). */
  countDraws(root: THREE.Object3D): number;
  /** The part registry (tests pass their own). */
  parts?: readonly WeavePartDef[];
}

interface Entry {
  def: WeavePartDef;
  part: WeavePart;
  objects: Map<THREE.Object3D, VisionLayer>;
}

export function createWeave(ctx: GameContext, opts: WeaveOptions): GameSystem {
  const entries: Entry[] = (opts.parts ?? WEAVE_PARTS).map((def) => {
    const objects = new Map<THREE.Object3D, VisionLayer>();
    const env: WeaveEnv = {
      ctx,
      id: def.id,
      kind: def.kind,
      rng: seededRng(hashString(`weave:${def.id}`)),
      pay: (gems) => {
        pay(ctx, gems);
      },
      result: (tier, hit, kind) => result(ctx.events, def.id, kind ?? def.kind, tier, hit),
      challenge: () => ctx.vision.challenge?.() ?? IDENTITY_CHALLENGE,
      add(object, layer) {
        if (objects.has(object)) env.remove(object);
        objects.set(object, layer);
        ctx.vision.add(object, layer);
        return object;
      },
      remove(object) {
        if (!objects.delete(object)) return;
        ctx.vision.remove(object);
      },
      tracked: () => [...objects.keys()],
    };
    return { def, part: def.create(env), objects };
  });

  const byId = (id: string): Entry => {
    const e = entries.find((x) => x.def.id === id);
    if (!e) throw new Error(`glasses weave: unknown part ${id}`);
    return e;
  };

  const offPhase = ctx.events.on('session:phase', (ev) => {
    if ((ev.phase === 'playing' && ev.previous === 'title') || ev.phase === 'title') {
      for (const e of entries) e.part.reset();
    }
  });

  if (ctx.testMode && typeof window !== 'undefined' && window.__rgGlasses) {
    window.__rgGlasses.weave = {
      ids: () => entries.map((e) => e.def.id),
      debug: (id) => byId(id).part.debug(),
      force: (id, params) => byId(id).part.force?.(params),
      reset: (id) => byId(id).part.reset(),
      draws(id) {
        let n = 0;
        for (const o of byId(id).part.drawObjects()) n += opts.countDraws(o);
        return n;
      },
    };
  }

  return {
    update(dt) {
      if (ctx.session.state.phase !== 'playing') return;
      for (const e of entries) e.part.update(dt);
    },
    dispose() {
      offPhase();
      for (const e of entries) {
        e.part.dispose();
        for (const o of e.objects.keys()) ctx.vision.remove(o);
        e.objects.clear();
      }
      entries.length = 0;
      if (ctx.testMode && typeof window !== 'undefined' && window.__rgGlasses) delete window.__rgGlasses.weave;
    },
  };
}
