/**
 * The wordless pictogram board of a glasses-play site (both eyes, main scene): a chunky two-post
 * wooden sign with a row of 2–3 pictogram panels and a round "magic glasses" badge on top so kids
 * spot the site from far away. Everything is one merged mesh with one material (the shared atlas),
 * so a board costs ONE draw call. Static colliders keep the player out of the posts and panel.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GameContext } from '../../types';
import { BOARD } from './constants';
import { glassesPictoUv, swatchUv } from './pictos';
import type { GlassesPicto, Swatch } from './pictos';

type UvRect = [number, number, number, number];

/** Map every UV of `geo` into `rect` (in place). */
function remapUv(geo: THREE.BufferGeometry, rect: UvRect): THREE.BufferGeometry {
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, rect[0] + uv.getX(i) * rect[2], rect[1] + uv.getY(i) * rect[3]);
  return geo;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number, s: Swatch): THREE.BufferGeometry {
  return remapUv(new THREE.BoxGeometry(w, h, d).translate(x, y, z), swatchUv(s));
}

function quad(size: number, x: number, y: number, z: number, picto: GlassesPicto, back = false): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(size, size);
  if (back) g.rotateY(Math.PI);
  return remapUv(g.translate(x, y, z), glassesPictoUv(picto));
}

/** Panel width for `n` pictograms. */
export const panelWidth = (n: number): number => n * BOARD.cell + (n + 1) * BOARD.gap + 0.1;

/** Board geometry in local space (feet at the origin, facing +Z). */
export function buildBoardGeometry(pictos: readonly GlassesPicto[]): THREE.BufferGeometry {
  const n = Math.max(1, Math.min(3, pictos.length));
  const w = panelWidth(n);
  const ph = BOARD.cell + 2 * BOARD.gap + 0.1;
  const postX = w / 2 - 0.25;
  const parts: THREE.BufferGeometry[] = [
    // Posts with a dark foot.
    box(BOARD.post, BOARD.postHeight, BOARD.post, -postX, BOARD.postHeight / 2, -0.12, 'wood'),
    box(BOARD.post, BOARD.postHeight, BOARD.post, postX, BOARD.postHeight / 2, -0.12, 'wood'),
    box(BOARD.post + 0.14, 0.3, BOARD.post + 0.14, -postX, 0.15, -0.12, 'woodDark'),
    box(BOARD.post + 0.14, 0.3, BOARD.post + 0.14, postX, 0.15, -0.12, 'woodDark'),
    // Panel: wooden frame, dark face board, roof cap.
    box(w + 0.16, ph + 0.16, BOARD.panelDepth, 0, BOARD.panelY, 0, 'wood'),
    box(w - 0.04, ph - 0.04, 0.04, 0, BOARD.panelY, BOARD.panelDepth / 2 + 0.01, 'ink'),
    box(w + 0.42, 0.12, 0.5, 0, BOARD.panelY + ph / 2 + 0.16, 0, 'woodDark'),
    // Topper stem.
    box(0.16, BOARD.topperY - BOARD.panelY - ph / 2, 0.16, 0, (BOARD.topperY + BOARD.panelY + ph / 2) / 2 - 0.2, 0, 'woodDark'),
  ];
  const zFace = BOARD.panelDepth / 2 + 0.035;
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * (BOARD.cell + BOARD.gap);
    parts.push(quad(BOARD.cell, x, BOARD.panelY, zFace, pictos[i]));
  }
  // Badge on both sides of the stem.
  parts.push(quad(BOARD.topperSize, 0, BOARD.topperY, 0.1, 'magic'));
  parts.push(quad(BOARD.topperSize, 0, BOARD.topperY, -0.1, 'magic', true));
  const merged = mergeGeometries(parts.map((p) => p.toNonIndexed()), false);
  for (const p of parts) p.dispose();
  if (!merged) throw new Error('board geometry merge failed');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/** One shared material for every board (atlas + a little self-light so it reads at dusk). */
export function createBoardMaterial(atlas: THREE.Texture): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: atlas,
    emissive: new THREE.Color(1, 1, 1),
    emissiveMap: atlas,
    emissiveIntensity: 0.32,
    roughness: 0.75,
    metalness: 0,
    alphaTest: 0.5,
    side: THREE.FrontSide,
  });
}

export interface Board {
  readonly mesh: THREE.Mesh;
  setPictos(pictos: readonly GlassesPicto[]): void;
  dispose(): void;
}

export function createBoard(
  ctx: Pick<GameContext, 'scene' | 'physics'>,
  material: THREE.Material,
  at: { x: number; y: number; z: number; yaw: number },
  pictos: readonly GlassesPicto[],
): Board {
  const mesh = new THREE.Mesh(buildBoardGeometry(pictos), material);
  mesh.name = 'glasses:board';
  mesh.position.set(at.x, at.y - 0.05, at.z);
  mesh.rotation.y = at.yaw;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.updateMatrixWorld(true);
  ctx.scene.add(mesh);

  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), at.yaw);
  const colliders: { handle: number }[] = [];
  const addBox = (lx: number, ly: number, lz: number, hx: number, hy: number, hz: number): void => {
    const c = new THREE.Vector3(lx, ly, lz).applyQuaternion(q).add(mesh.position);
    colliders.push({ handle: ctx.physics.addStaticBox(c, new THREE.Vector3(hx, hy, hz), q).handle });
  };
  const n = Math.max(1, Math.min(3, pictos.length));
  const w = panelWidth(n);
  const postX = w / 2 - 0.25;
  addBox(-postX, BOARD.postHeight / 2, -0.12, BOARD.post / 2 + 0.04, BOARD.postHeight / 2, BOARD.post / 2 + 0.04);
  addBox(postX, BOARD.postHeight / 2, -0.12, BOARD.post / 2 + 0.04, BOARD.postHeight / 2, BOARD.post / 2 + 0.04);
  addBox(0, BOARD.panelY, 0, w / 2 + 0.1, (BOARD.cell + 2 * BOARD.gap) / 2 + 0.1, BOARD.panelDepth / 2 + 0.05);

  return {
    mesh,
    setPictos(next) {
      const old = mesh.geometry;
      mesh.geometry = buildBoardGeometry(next);
      old.dispose();
    },
    dispose() {
      ctx.scene.remove(mesh);
      mesh.geometry.dispose();
      for (const h of colliders) {
        const c = ctx.physics.world.getCollider(h.handle);
        if (c) ctx.physics.removeCollider(c);
      }
    },
  };
}
