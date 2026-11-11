/**
 * Test-only spawner for toolkit blocks (`window.__rgVision.toolkit`, `?test=1` only). Places a
 * block in front of the current camera on a chosen layer, like `addTestObject`.
 */
import * as THREE from 'three';
import { VisionLayer } from '../../types';
import type { GameContext, VisionApi } from '../../types';
import type { Facing } from './common';
import { createDotPicturePair } from './dotPicture';
import { createGlyphSprite } from './glyphs';
import { createHalfSymbolPair } from './halfSymbols';
import type { HalfSymbol } from './halfSymbols';
import { createReticle, createRing, createTimingRing } from './rings';
import type { ShapeId } from './shapes';

export type ToolkitBlockKind = 'ring' | 'timingRing' | 'reticle' | 'glyph' | 'halfSymbol' | 'dotPicture';

export interface ToolkitSpawnOptions {
  block: ToolkitBlockKind;
  /** 'pair' (half symbols, dot pictures only): weak part on WeakOnly AND strong part on StrongOnly. */
  layer: 'weak' | 'strong' | 'pair';
  /** Metres in front of the camera. */
  distance: number;
  /** Camera-space offset (metres, +x right, +y up). */
  offsetX?: number;
  offsetY?: number;
  /** Overall size in metres (ring/reticle diameter, glyph height, symbol height, picture edge). Default 1. */
  size?: number;
  level?: number;
  opacity?: number;
  facing?: Facing;
  /** Ring: progress arc 0..1, dashes. */
  progress?: number;
  segments?: number;
  pulse?: number;
  /** Timing ring position 0..1. */
  t?: number;
  /** Glyph text. */
  text?: string;
  /** Half symbol and which half the weak eye gets. */
  symbol?: HalfSymbol;
  weakSide?: 'left' | 'right';
  /** Dot picture. */
  shape?: ShapeId;
  seed?: number;
  cells?: number;
}

export interface ToolkitSpawnResult {
  id: number;
  /** Approximate screen rectangle as fractions of the canvas, top-left origin: [x0, y0, x1, y1]. */
  rect: [number, number, number, number];
}

export interface ToolkitTestApi {
  spawn(opts: ToolkitSpawnOptions): ToolkitSpawnResult;
  /** Fade one block (or every block with id null). */
  setFade(id: number | null, fade: number): void;
  /** Advance every block's animation. */
  update(dt: number): void;
  /** Dot pictures: new shape/seed. Half symbols: new symbol. */
  setPicture(id: number, shape: ShapeId, seed: number): void;
  setSymbol(id: number, symbol: HalfSymbol): void;
  remove(id: number): void;
  removeAll(): void;
}

interface Entry {
  objects: THREE.Object3D[];
  setFade(f: number): void;
  update(dt: number): void;
  dispose(): void;
  setPicture?(shape: ShapeId, seed: number): void;
  setSymbol?(s: HalfSymbol): void;
}

export function createToolkitTestApi(ctx: Pick<GameContext, 'camera'>, vision: VisionApi): ToolkitTestApi {
  const entries = new Map<number, Entry>();
  let next = 1;
  const v = new THREE.Vector3();

  const remove = (id: number): void => {
    const e = entries.get(id);
    if (!e) return;
    for (const o of e.objects) vision.remove(o);
    e.dispose();
    entries.delete(id);
  };

  return {
    spawn(o) {
      const cam = ctx.camera;
      cam.updateMatrixWorld();
      const size = o.size ?? 1;
      const pos = new THREE.Vector3(o.offsetX ?? 0, o.offsetY ?? 0, -o.distance).applyMatrix4(cam.matrixWorld);
      const layer = o.layer === 'strong' ? VisionLayer.StrongOnly : VisionLayer.WeakOnly;
      const common = { level: o.level, opacity: o.opacity, facing: o.facing };
      let entry: Entry;
      let halfW = size / 2;
      const halfH = size / 2;
      const place = (obj: THREE.Object3D, l: VisionLayer): THREE.Object3D => {
        obj.position.copy(pos);
        obj.quaternion.copy(cam.quaternion);
        vision.add(obj, l);
        return obj;
      };
      const single = (b: { object: THREE.Object3D; setFade(f: number): void; update(dt: number): void; dispose(): void }): Entry => {
        if (o.layer === 'pair') throw new Error(`${o.block} has no pair`);
        return { objects: [place(b.object, layer)], setFade: b.setFade, update: b.update, dispose: b.dispose };
      };
      switch (o.block) {
        case 'ring': {
          const r = createRing({ ...common, radius: size * 0.44, thickness: size * 0.08, progress: o.progress, segments: o.segments, pulse: o.pulse });
          entry = single(r);
          break;
        }
        case 'timingRing': {
          const r = createTimingRing({ ...common, radius: size * 0.2, startRadius: size * 0.45, thickness: size * 0.05 });
          r.setT(o.t ?? 0.5);
          entry = single(r);
          break;
        }
        case 'reticle': {
          const r = createReticle({ ...common, radius: size * 0.26, thickness: size * 0.05, tickGap: size * 0.04, tickLength: size * 0.14, pulse: o.pulse });
          entry = single(r);
          break;
        }
        case 'glyph': {
          const g = createGlyphSprite({ ...common, text: o.text ?? '42', height: size * 0.78, maxChars: 16 });
          halfW = Math.max(halfW, g.width / 2);
          entry = single(g);
          break;
        }
        case 'halfSymbol':
        case 'dotPicture': {
          const pair =
            o.block === 'halfSymbol'
              ? createHalfSymbolPair({ ...common, symbol: o.symbol ?? { left: 'round', right: 'point' }, weakSide: o.weakSide, size })
              : createDotPicturePair({ ...common, shape: o.shape ?? 'star', seed: o.seed ?? 1, cells: o.cells, size });
          const objects: THREE.Object3D[] = [];
          if (o.layer !== 'strong') objects.push(place(pair.weak, VisionLayer.WeakOnly));
          if (o.layer !== 'weak') objects.push(place(pair.strong, VisionLayer.StrongOnly));
          entry = {
            objects,
            setFade: pair.setFade,
            update: pair.update,
            dispose: pair.dispose,
            setPicture: 'setPicture' in pair ? pair.setPicture : undefined,
            setSymbol: 'setSymbol' in pair ? pair.setSymbol : undefined,
          };
          break;
        }
      }
      const id = next++;
      entries.set(id, entry);
      // Screen rectangle of the camera-facing box around the block.
      let x0 = 1;
      let y0 = 1;
      let x1 = 0;
      let y1 = 0;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        v.set((o.offsetX ?? 0) + sx * halfW, (o.offsetY ?? 0) + sy * halfH, -o.distance).applyMatrix4(cam.matrixWorld).project(cam);
        const fx = (v.x + 1) / 2;
        const fy = (1 - v.y) / 2;
        x0 = Math.min(x0, fx);
        x1 = Math.max(x1, fx);
        y0 = Math.min(y0, fy);
        y1 = Math.max(y1, fy);
      }
      return { id, rect: [x0, y0, x1, y1] };
    },
    setFade(id, fade) {
      if (id === null) for (const e of entries.values()) e.setFade(fade);
      else entries.get(id)?.setFade(fade);
    },
    update(dt) {
      for (const e of entries.values()) e.update(dt);
    },
    setPicture(id, shape, seed) {
      entries.get(id)?.setPicture?.(shape, seed);
    },
    setSymbol(id, symbol) {
      entries.get(id)?.setSymbol?.(symbol);
    },
    remove,
    removeAll() {
      for (const id of [...entries.keys()]) remove(id);
    },
  };
}
