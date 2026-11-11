import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createWeave } from '../../src/activities/glasses/weave';
import { WEAVE_PARTS } from '../../src/activities/glasses/weave/parts';
import type { WeavePartDef } from '../../src/activities/glasses/weave/parts';
import type { WeaveEnv, WeavePart } from '../../src/activities/glasses/weave/types';
import { VisionLayer } from '../../src/types';
import type { GameContext, GameEvents, SessionPhase } from '../../src/types';

type Handler = (e: unknown) => void;

function fakeCtx() {
  const handlers = new Map<string, Set<Handler>>();
  const emitted: [string, unknown][] = [];
  const attached = new Map<THREE.Object3D, VisionLayer>();
  const state = { phase: 'title' as SessionPhase };
  const ctx = {
    testMode: false,
    session: { state },
    events: {
      on(type: string, fn: Handler) {
        if (!handlers.has(type)) handlers.set(type, new Set());
        handlers.get(type)!.add(fn);
        return () => handlers.get(type)!.delete(fn);
      },
      emit<K extends keyof GameEvents>(type: K, e: GameEvents[K]) {
        emitted.push([type, e]);
        for (const fn of handlers.get(type) ?? []) fn(e);
      },
    },
    vision: {
      add: (o: THREE.Object3D, l: VisionLayer) => void attached.set(o, l),
      remove: (o: THREE.Object3D) => void attached.delete(o),
    },
    audio: { play: () => {} },
  };
  const phase = (next: SessionPhase): void => {
    const previous = state.phase;
    state.phase = next;
    ctx.events.emit('session:phase', { phase: next, previous });
  };
  return { ctx: ctx as unknown as GameContext, emitted, attached, phase, handlers };
}

/** A recording part: counts calls and keeps its env for the test. */
function spyDefs(ids: string[]) {
  const log: string[] = [];
  const envs: Record<string, WeaveEnv> = {};
  const defs: WeavePartDef[] = ids.map((id) => ({
    id,
    kind: 'timeIt',
    create(env): WeavePart {
      envs[id] = env;
      return {
        id: env.id,
        kind: env.kind,
        reset: () => void log.push(`${id}:reset`),
        update: () => void log.push(`${id}:update`),
        dispose: () => void log.push(`${id}:dispose`),
        debug: () => ({ id }),
        force: (p) => void log.push(`${id}:force:${JSON.stringify(p)}`),
        drawObjects: () => env.tracked(),
      };
    },
  }));
  return { defs, log, envs };
}

const countDraws = (): number => 1;

describe('glasses weave registry', () => {
  it('has the six parts, unique ids, one folder each', () => {
    expect(WEAVE_PARTS.map((p) => p.id)).toEqual(['bounce', 'chute', 'hero', 'boost', 'fakes', 'shack']);
    expect(WEAVE_PARTS.map((p) => p.kind)).toEqual(['timeIt', 'timeIt', 'onHero', 'timeIt', 'tellApart', 'popOut']);
    const dir = join(__dirname, '../../src/activities/glasses/weave');
    const folders = readdirSync(dir).filter((f) => statSync(join(dir, f)).isDirectory()).sort();
    expect(folders).toEqual(WEAVE_PARTS.map((p) => p.id).sort());
  });

  it('the stub parts are valid and draw nothing', () => {
    const f = fakeCtx();
    const sys = createWeave(f.ctx, { countDraws });
    f.phase('playing');
    sys.update(1 / 60);
    expect(f.attached.size).toBe(0);
    sys.dispose?.();
    expect(f.handlers.get('session:phase')?.size ?? 0).toBe(0);
  });
});

describe('glasses weave lifecycle', () => {
  it('resets on session start and on title, updates only while playing, disposes', () => {
    const f = fakeCtx();
    const { defs, log } = spyDefs(['a', 'b']);
    const sys = createWeave(f.ctx, { countDraws, parts: defs });
    sys.update(0.1); // title
    expect(log).toEqual([]);
    f.phase('playing');
    expect(log).toEqual(['a:reset', 'b:reset']);
    sys.update(0.1);
    expect(log.slice(2)).toEqual(['a:update', 'b:update']);
    log.length = 0;
    f.phase('paused');
    sys.update(0.1);
    f.phase('playing'); // resume: no reset
    expect(log).toEqual([]);
    f.phase('ended');
    sys.update(0.1);
    expect(log).toEqual([]);
    f.phase('title');
    expect(log).toEqual(['a:reset', 'b:reset']);
    log.length = 0;
    sys.dispose?.();
    expect(log).toEqual(['a:dispose', 'b:dispose']);
    f.phase('playing');
    expect(log).toEqual(['a:dispose', 'b:dispose']);
  });

  it('env.add attaches and tracks, remove detaches, dispose detaches what is left', () => {
    const f = fakeCtx();
    const { defs, envs } = spyDefs(['a']);
    const sys = createWeave(f.ctx, { countDraws, parts: defs });
    const env = envs.a;
    const weak = env.add(new THREE.Object3D(), VisionLayer.WeakOnly);
    const strong = env.add(new THREE.Object3D(), VisionLayer.StrongOnly);
    expect(f.attached.get(weak)).toBe(VisionLayer.WeakOnly);
    expect(env.tracked()).toEqual([weak, strong]);
    env.remove(weak);
    env.remove(weak); // no-op
    expect(f.attached.has(weak)).toBe(false);
    expect(env.tracked()).toEqual([strong]);
    sys.dispose?.();
    expect(f.attached.size).toBe(0);
  });

  it('result emits glasses:result with the part id (kind override), rng is deterministic, challenge is identity', () => {
    const f = fakeCtx();
    const one = spyDefs(['chute']);
    createWeave(f.ctx, { countDraws, parts: one.defs });
    one.envs.chute.result(2, true);
    one.envs.chute.result(3, false, 'lineUp');
    expect(f.emitted.filter(([t]) => t === 'glasses:result').map(([, e]) => e)).toEqual([
      { mechanic: 'chute', kind: 'timeIt', tier: 2, hit: true },
      { mechanic: 'chute', kind: 'lineUp', tier: 3, hit: false },
    ]);
    const two = spyDefs(['chute']);
    createWeave(fakeCtx().ctx, { countDraws, parts: two.defs });
    const a = [one.envs.chute.rng(), one.envs.chute.rng()];
    const b = [two.envs.chute.rng(), two.envs.chute.rng()];
    expect(a).toEqual(b);
    expect(one.envs.chute.challenge().weakScale).toBe(1);
  });
});
