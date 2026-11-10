/**
 * A chunky bobbing arrow (both-eye: yellow with a black outline shell) that points at the item the
 * selected tile stands for, so the tile bar and the 3D counter are clearly linked.
 */
import * as THREE from 'three';
import type { Tile } from './logic';
import { JAR, LAYOUT } from './parlour';

export interface Cursor {
  readonly root: THREE.Group;
  /** Point at a tile's item (parlour-local `coneTop` for the "next" tile), or hide (null). */
  point(tile: Tile | null, coneTop: THREE.Vector3): void;
  update(dt: number): void;
  dispose(): void;
}

export function tileTarget(tile: Tile, coneTop: THREE.Vector3, out = new THREE.Vector3()): THREE.Vector3 {
  switch (tile.kind) {
    case 'cone':
      return out.copy(LAYOUT.coneRack(tile.id === 'waffle' ? 0 : tile.id === 'choco' ? 1 : 2)).add(new THREE.Vector3(0, 0.45, 0));
    case 'flavour':
      return out.copy(LAYOUT.tub(['vanilla', 'choc', 'berry', 'mint', 'blue'].indexOf(tile.id))).add(new THREE.Vector3(0, 0.22, 0));
    case 'sauce':
      return out.copy(LAYOUT.bottle(['fudge', 'strawberry', 'caramel'].indexOf(tile.id))).add(new THREE.Vector3(0, 0.48, 0));
    case 'topping':
      return out.copy(LAYOUT.bowl(['worms', 'popcorn', 'pickle', 'duck', 'sprinkles', 'marsh'].indexOf(tile.id))).add(new THREE.Vector3(0, 0.22, 0));
    case 'jar':
      // High above the lid, clear of anything that may float on top of it.
      return out.copy(LAYOUT.jar(tile.index)).add(new THREE.Vector3(0, JAR.height + 0.62, 0));
    case 'next':
      return out.copy(coneTop).add(new THREE.Vector3(0, 0.12, 0));
  }
}

export function createCursor(): Cursor {
  const root = new THREE.Group();
  root.name = 'Scoops.cursor';
  const arrow = new THREE.Group();
  const shape = new THREE.Group();
  const head = new THREE.ConeGeometry(0.1, 0.16, 12).rotateX(Math.PI).translate(0, 0.08, 0);
  const shaft = new THREE.CylinderGeometry(0.04, 0.04, 0.16, 10).translate(0, 0.24, 0);
  const fill = new THREE.MeshStandardMaterial({ color: 0xffd93b, roughness: 0.4, emissive: 0x403000 });
  const line = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
  for (const g of [head, shaft]) {
    shape.add(new THREE.Mesh(g, fill));
    const o = new THREE.Mesh(g, line);
    o.scale.setScalar(1.18);
    o.position.y = -0.012;
    shape.add(o);
  }
  arrow.add(shape);
  root.add(arrow);
  root.visible = false;
  const target = new THREE.Vector3();
  let time = 0;
  let snapped = false;

  return {
    root,
    point(tile, coneTop) {
      if (!tile) {
        root.visible = false;
        snapped = false;
        return;
      }
      tileTarget(tile, coneTop, target);
      if (!snapped) root.position.copy(target);
      snapped = true;
      root.visible = true;
    },
    update(dt) {
      if (!root.visible) return;
      time += dt;
      root.position.lerp(target, 1 - Math.exp(-16 * dt));
      arrow.position.y = Math.abs(Math.sin(time * 4)) * 0.07;
      shape.rotation.y += dt * 2.5;
    },
    dispose() {
      head.dispose();
      shaft.dispose();
      fill.dispose();
      line.dispose();
    },
  };
}
