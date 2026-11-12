/**
 * QA7 m6: the island map board reads at 640x360 from spawn. 8–10 big badges, none overlapping,
 * all on the face, each ≥ 20 px tall from the default spawn camera (the camera rig's own numbers:
 * 5.5 m arm at the base pitch behind the hero's pivot), none centred where a hero standing in
 * front hides the board, the "you are here" dot clear of every badge.
 *
 * QA8 m6: this test said 23–27 px while QA saw ~15 px and the top row under the compass bar. The
 * camera maths here matches the live camera (the e2e measures 22.9–26.8 px for the same badges):
 * QA's 15 px was the white picture inside the dark badge disc (~60 % of it), and the "y ≥ 55" HUD
 * line was wrong: the compass bar ends at ~56 px and the camera's eye (~3.5 m) projects to ~55 px,
 * so the top row, 3.5 m up, sat on the horizon under the bar from any distance. Now the face top
 * is 3.04 m (≥ 62 px), and tests/e2e/ui-wayfinding.spec.ts checks the real screen: the live spawn
 * camera, the real HUD boxes, and the hero standing in front.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CAMERA } from '../../src/config';
import { CAM } from '../../src/core/tuning';
import { ANCHORS } from '../../src/world/layout';
import { buildTerrain, sampleHeight } from '../../src/world/terrain';
import { MAP_BADGE, MAP_BOARD, MAP_FACE, MAP_HERO_ZONE, MAP_ICONS, MAP_RING, boardLayout } from '../../src/world/fill/mapboard';

const terrain = buildTerrain();
const h = (x: number, z: number): number => sampleHeight(terrain, x, z);

describe('map board (QA7 m6)', () => {
  const lay = boardLayout(MAP_BOARD.x, MAP_BOARD.z);

  it('shows 8–10 main attractions as big badges, apart, on the face, out of the hero zone', () => {
    expect(MAP_ICONS.length).toBeGreaterThanOrEqual(8);
    expect(MAP_ICONS.length).toBeLessThanOrEqual(10);
    for (const a of lay.icons) {
      expect(Math.abs(a.u) + MAP_RING, a.anchor).toBeLessThanOrEqual(MAP_FACE.w / 2 + 1e-6);
      expect(Math.abs(a.v) + MAP_RING, a.anchor).toBeLessThanOrEqual(MAP_FACE.h / 2 + 1e-6);
      expect(Math.abs(a.u) >= MAP_HERO_ZONE.halfW - 1e-6 || a.v >= MAP_HERO_ZONE.top - 1e-6, a.anchor).toBe(true);
      // The "you are here" dot stays clear.
      expect(Math.hypot(a.u - lay.here.u, a.v - lay.here.v), a.anchor).toBeGreaterThan(MAP_RING + 0.2);
    }
    for (let i = 0; i < lay.icons.length; i++) {
      for (let j = i + 1; j < lay.icons.length; j++) {
        const a = lay.icons[i];
        const b = lay.icons[j];
        // Badges never overlap (their cream rims may touch).
        expect(Math.hypot(a.u - b.u, a.v - b.v), `${a.anchor} / ${b.anchor}`).toBeGreaterThanOrEqual(MAP_BADGE + 0.019);
      }
    }
  });

  it('each badge is at least 20 px tall at 640x360 from the spawn camera, below the compass bar', () => {
    const sp = ANCHORS.spawn;
    const fwd = new THREE.Vector3(Math.sin(sp.yaw), 0, Math.cos(sp.yaw));
    const pivot = new THREE.Vector3(sp.x, h(sp.x, sp.z) + CAM.pivotHeight, sp.z);
    const pitch = Math.atan2(CAMERA.height, CAMERA.distance);
    const cam = new THREE.PerspectiveCamera(CAMERA.fov, 640 / 360, 0.1, 500);
    cam.position.copy(pivot).addScaledVector(fwd, -Math.cos(pitch) * CAMERA.distance);
    cam.position.y += Math.sin(pitch) * CAMERA.distance;
    cam.lookAt(pivot);
    cam.updateMatrixWorld(true);
    const ground = h(MAP_BOARD.x, MAP_BOARD.z);
    const rgt = new THREE.Vector3(Math.cos(lay.yaw), 0, -Math.sin(lay.yaw));
    const at = (u: number, v: number): THREE.Vector3 =>
      new THREE.Vector3(MAP_BOARD.x, ground + lay.yc + v, MAP_BOARD.z).addScaledVector(rgt, u);
    const px = (p: THREE.Vector3): THREE.Vector2 => {
      const n = p.clone().project(cam);
      return new THREE.Vector2(((n.x + 1) / 2) * 640, ((1 - n.y) / 2) * 360);
    };
    const sizes: string[] = [];
    for (const a of lay.icons) {
      const top = px(at(a.u, a.v + MAP_BADGE / 2));
      const bottom = px(at(a.u, a.v - MAP_BADGE / 2));
      const tall = bottom.y - top.y;
      sizes.push(`${a.anchor} ${tall.toFixed(1)}`);
      if (process.env.MB_LOG) console.log(sizes.at(-1));
      expect(tall, sizes.join(', ')).toBeGreaterThanOrEqual(20);
      // On screen, its rim below the HUD's compass bar (bottom ≈ 56 px at 640x360, with a margin).
      const rim = px(at(a.u, a.v + MAP_RING + 0.04));
      expect(rim.y, a.anchor).toBeGreaterThanOrEqual(62);
    }
  });
});
