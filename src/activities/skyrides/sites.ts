/**
 * The two sky-ride sites: the grass airstrip (runway, windsock, start sign) next to the balloon
 * field and the dragon's rocky roost on the ridge by the lighthouse. Each uses the world anchor
 * (`airstrip` / `dragonRoost`) when the main build has added it, else the spot picked here (flat,
 * clear of roads and other anchors; see docs/streams/sky-rides.md).
 */
import * as THREE from 'three';
import type { Anchor, GameContext } from '../../types';
import { finish, finishMaterial, mergeFinished, placed, rodBetween } from '../../core/vertex-finish';
import { iconHtml } from './skyHud';
import type { HudIcon } from './skyHud';

export interface Site {
  x: number;
  z: number;
  /** Ground height at the centre. */
  y: number;
  yaw: number;
  radius: number;
}

/** Fallback spots (world coordinates) when the anchors are not on main yet. */
export const SITE_DEFAULTS = {
  // A gentle grass slope south of the balloon field, running east towards the sea.
  airstrip: { x: 76, z: 106, yaw: Math.PI / 2, radius: 30 },
  // The flat ridge top west of the bridge, by the lighthouse, looking south over the island.
  dragonRoost: { x: -28, z: -127, yaw: Math.atan2(28, 127), radius: 7 },
} as const;

export const RUNWAY = { length: 58, width: 24 } as const;

export function siteFor(ctx: GameContext, name: 'airstrip' | 'dragonRoost'): Site {
  const anchors = ctx.world.anchors as unknown as Partial<Record<string, Anchor>>;
  const a = anchors[name];
  const d = SITE_DEFAULTS[name];
  const x = a ? a.position.x : d.x;
  const z = a ? a.position.z : d.z;
  return { x, z, y: ctx.world.heightAt(x, z), yaw: a ? a.yaw : d.yaw, radius: a ? a.radius : d.radius };
}

/** Local runway frame → world: `along` metres down the runway (0 = threshold), `side` to the right. */
export function runwayPoint(site: Site, along: number, side: number, out = new THREE.Vector3()): THREE.Vector3 {
  const fx = Math.sin(site.yaw);
  const fz = Math.cos(site.yaw);
  // Right of facing (fx, fz) = (-fz, fx).
  const x0 = site.x - fx * (RUNWAY.length / 2);
  const z0 = site.z - fz * (RUNWAY.length / 2);
  out.set(x0 + fx * along - fz * side, 0, z0 + fz * along + fx * side);
  return out;
}

function signTexture(icon: HudIcon, ring: string): THREE.Texture {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (!g) return tex;
  g.fillStyle = '#10142a';
  g.beginPath();
  g.arc(size / 2, size / 2, size * 0.48, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = size * 0.06;
  g.strokeStyle = ring;
  g.stroke();
  // Draw the HUD pictogram (SVG) onto the sign.
  const svg = iconHtml(icon).replace(/^<span class="ic"[^>]*>|<\/span>$/g, '');
  const styled = svg
    .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" ')
    .replace('aria-hidden="true">', 'aria-hidden="true"><style>*{fill:#ffd93b;stroke:#000;stroke-width:1.6;stroke-linejoin:round;paint-order:stroke fill}.k{fill:#000;stroke:none}.l{fill:none;stroke:#000;stroke-width:1.2}.o{fill:none;stroke:#000;stroke-width:5}.w{fill:none;stroke:#ffd93b;stroke-width:2.4}</style>');
  const img = new Image();
  img.onload = () => {
    g.drawImage(img, size * 0.19, size * 0.19, size * 0.62, size * 0.62);
    tex.needsUpdate = true;
  };
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(styled)}`;
  return tex;
}

/** A round pictogram sign on a post (both-eye). */
function buildSign(icon: HudIcon, x: number, y: number, z: number, yaw: number): { group: THREE.Group; dispose(): void } {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.rotation.y = yaw;
  const tex = typeof document !== 'undefined' ? signTexture(icon, '#ffffff') : new THREE.Texture();
  const faceMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  const faceGeo = new THREE.CircleGeometry(0.9, 28);
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.position.set(0, 2.6, 0.06);
  group.add(face);
  const back = new THREE.Mesh(faceGeo, faceMat);
  back.position.set(0, 2.6, -0.06);
  back.rotation.y = Math.PI;
  group.add(back);
  return {
    group,
    dispose() {
      group.removeFromParent();
      faceGeo.dispose();
      faceMat.dispose();
      tex.dispose();
    },
  };
}

export interface AirstripScene {
  readonly site: Site;
  update(dt: number, time: number): void;
  dispose(): void;
}

export function buildAirstrip(ctx: GameContext, site: Site): AirstripScene {
  const group = new THREE.Group();
  group.name = 'sky-airstrip';
  ctx.scene.add(group);

  // Runway: a mown grass strip draped over the terrain, with light/dark mowing bands, white
  // threshold bars and a dashed centreline (vertex colours, one draw).
  const nA = Math.round(RUNWAY.length);
  const nS = Math.round(RUNWAY.width);
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const light = new THREE.Color(0xa8d873);
  const dark = new THREE.Color(0x76b04e);
  const white = new THREE.Color(0xf6f4ea);
  const edge = new THREE.Color(0x3c5a2a);
  const p = new THREE.Vector3();
  for (let i = 0; i <= nA; i++) {
    for (let j = 0; j <= nS; j++) {
      const along = (i / nA) * RUNWAY.length;
      const side = (j / nS - 0.5) * RUNWAY.width;
      runwayPoint(site, along, side, p);
      const h = ctx.world.heightAt(p.x, p.z) + 0.06;
      pos.push(p.x, h, p.z);
      let c = Math.floor(along / 4) % 2 === 0 ? light : dark;
      const fromEnd = Math.min(along, RUNWAY.length - along);
      if (Math.abs(side) > RUNWAY.width / 2 - 0.6) c = edge;
      else if (fromEnd < 3 && fromEnd > 1 && Math.floor((side + RUNWAY.width / 2) / 2) % 2 === 0) c = white;
      else if (Math.abs(side) < 0.5 && Math.floor(along / 3) % 2 === 0 && fromEnd > 4) c = white;
      col.push(c.r, c.g, c.b);
    }
  }
  const row = nS + 1;
  for (let i = 0; i < nA; i++) {
    for (let j = 0; j < nS; j++) {
      const a = i * row + j;
      idx.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  const runGeo = new THREE.BufferGeometry();
  runGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  runGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  runGeo.setIndex(idx);
  runGeo.computeVertexNormals();
  // Make sure the faces point up whatever the winding.
  const nrm = runGeo.getAttribute('normal');
  if (nrm.getY(0) < 0) {
    for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
    runGeo.setIndex(idx);
    runGeo.computeVertexNormals();
  }
  const runMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const runway = new THREE.Mesh(runGeo, runMat);
  runway.receiveShadow = true;
  runway.name = 'sky-runway';
  group.add(runway);

  // Props: windsock pole, a start arch of bunting poles, chocks (one merged draw).
  const parts: THREE.BufferGeometry[] = [];
  const sockBase = runwayPoint(site, 8, -RUNWAY.width / 2 - 3, new THREE.Vector3());
  sockBase.y = ctx.world.heightAt(sockBase.x, sockBase.z);
  for (let k = 0; k < 5; k++) {
    parts.push(finish(placed(new THREE.CylinderGeometry(0.09, 0.1, 1.2, 8), sockBase.x, sockBase.y + 0.6 + k * 1.2, sockBase.z), { color: k % 2 ? 0x1d2a5c : 0xffffff, rough: 0.5, metal: 0.1 }));
  }
  // Corner markers: chunky striped cones along the runway edges.
  for (const along of [0, RUNWAY.length / 2, RUNWAY.length]) {
    for (const s of [-1, 1]) {
      const q = runwayPoint(site, along, s * (RUNWAY.width / 2 + 0.6), new THREE.Vector3());
      q.y = ctx.world.heightAt(q.x, q.z);
      parts.push(finish(placed(new THREE.ConeGeometry(0.42, 0.9, 10), q.x, q.y + 0.45, q.z), { color: 0xffffff, rough: 0.5, metal: 0 }));
      parts.push(finish(placed(new THREE.CylinderGeometry(0.3, 0.36, 0.22, 10), q.x, q.y + 0.42, q.z), { color: 0x1d2a5c, rough: 0.5, metal: 0 }));
    }
  }
  const signSpot = runwayPoint(site, 3, RUNWAY.width / 2 + 2.5, new THREE.Vector3());
  signSpot.y = ctx.world.heightAt(signSpot.x, signSpot.z);
  parts.push(finish(rodBetween(signSpot.clone(), signSpot.clone().setY(signSpot.y + 2.6), 0.08), { color: 0x2a2a36, rough: 0.6, metal: 0.2 }));
  const propsGeo = mergeFinished(parts);
  const propsMat = finishMaterial('skyrides-props');
  const props = new THREE.Mesh(propsGeo, propsMat);
  props.castShadow = true;
  props.receiveShadow = true;
  group.add(props);

  // Windsock (its own little mesh: it swings with the breeze).
  const sock = new THREE.Group();
  sock.position.set(sockBase.x, sockBase.y + 6, sockBase.z);
  const sockParts: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const g = new THREE.CylinderGeometry(0.42 - k * 0.07, 0.42 - (k + 1) * 0.07, 0.55, 12, 1, true);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, -0.3 - k * 0.55);
    sockParts.push(finish(g, { color: k % 2 ? 0xffffff : 0xff7a2a, rough: 0.7, metal: 0 }));
  }
  const sockGeo = mergeFinished(sockParts);
  const sockMat = finishMaterial('skyrides-sock', undefined, { side: THREE.DoubleSide });
  const sockMesh = new THREE.Mesh(sockGeo, sockMat);
  sock.add(sockMesh);
  group.add(sock);

  const sign = typeof document !== 'undefined' ? buildSign('plane', signSpot.x, signSpot.y, signSpot.z, site.yaw - Math.PI / 2) : null;
  if (sign) group.add(sign.group);

  return {
    site,
    update(_dt, time) {
      sock.rotation.y = 2.3 + Math.sin(time * 0.4) * 0.35;
      sockMesh.rotation.x = 0.25 + Math.sin(time * 2.3) * 0.08;
      sockMesh.rotation.z = Math.sin(time * 3.1) * 0.12;
    },
    dispose() {
      group.removeFromParent();
      runGeo.dispose();
      runMat.dispose();
      propsGeo.dispose();
      propsMat.dispose();
      sockGeo.dispose();
      sockMat.dispose();
      sign?.dispose();
    },
  };
}

export interface RoostScene {
  readonly site: Site;
  /** Top of the perch slab (where the dragon sits). */
  readonly perchY: number;
  /** Where the hero stands to feed the dragon (and lands after the ride). */
  readonly standSpot: THREE.Vector3;
  dispose(): void;
}

export const PERCH = { radius: 2.7, height: 1.3 } as const;

export function buildRoost(ctx: GameContext, site: Site): RoostScene {
  const group = new THREE.Group();
  group.name = 'sky-roost';
  ctx.scene.add(group);
  const parts: THREE.BufferGeometry[] = [];
  const g0 = site.y;
  // Rocky mound: lumpy boulders around a flat slab.
  let seed = 7;
  const rnd = (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + rnd() * 0.4;
    const r = PERCH.radius * (0.75 + rnd() * 0.25);
    const s = 0.8 + rnd() * 0.6;
    const geo = new THREE.DodecahedronGeometry(s, 0);
    geo.scale(1.2, 0.8 + rnd() * 0.5, 1.1);
    const x = site.x + Math.cos(a) * r;
    const z = site.z + Math.sin(a) * r;
    parts.push(finish(placed(geo, x, ctx.world.heightAt(x, z) + s * 0.35, z, rnd(), rnd() * 3, rnd()), { color: k % 3 === 0 ? 0x8d8a96 : 0xa7a3ae, rough: 0.9, metal: 0 }));
  }
  parts.push(finish(placed(new THREE.CylinderGeometry(PERCH.radius, PERCH.radius + 0.4, PERCH.height, 14), site.x, g0 + PERCH.height / 2, site.z), { color: 0x9a96a2, rough: 0.92, metal: 0 }));
  // A twiggy nest on the slab and a basket of treats in front.
  parts.push(finish(placed(new THREE.TorusGeometry(1.5, 0.32, 8, 22), site.x, g0 + PERCH.height + 0.1, site.z, Math.PI / 2, 0, 0), { color: 0x8a5a2b, rough: 0.95, metal: 0 }));
  const fx = Math.sin(site.yaw);
  const fz = Math.cos(site.yaw);
  const basket = new THREE.Vector3(site.x + fx * (PERCH.radius + 2.2) - fz * 1.6, 0, site.z + fz * (PERCH.radius + 2.2) + fx * 1.6);
  basket.y = ctx.world.heightAt(basket.x, basket.z);
  parts.push(finish(placed(new THREE.CylinderGeometry(0.5, 0.38, 0.5, 12), basket.x, basket.y + 0.25, basket.z), { color: 0xc98a3a, rough: 0.9, metal: 0 }));
  for (let k = 0; k < 5; k++) {
    const a = k * 1.3;
    parts.push(finish(placed(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 10), basket.x + Math.cos(a) * 0.2, basket.y + 0.55 + (k % 2) * 0.06, basket.z + Math.sin(a) * 0.2, 0.3 * Math.sin(a), 0, 0.3 * Math.cos(a)), { color: 0xffe2a0, rough: 0.8, metal: 0 }));
  }
  const geo = mergeFinished(parts);
  const mat = finishMaterial('skyrides-roost');
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  const collider = ctx.physics.addStaticCylinder(new THREE.Vector3(site.x, g0 + PERCH.height / 2, site.z), PERCH.height / 2, PERCH.radius);

  const signSpot = new THREE.Vector3(site.x + fx * (PERCH.radius + 2.2) + fz * 2.2, 0, site.z + fz * (PERCH.radius + 2.2) - fx * 2.2);
  signSpot.y = ctx.world.heightAt(signSpot.x, signSpot.z);
  const sign = typeof document !== 'undefined' ? buildSign('dragon', signSpot.x, signSpot.y, signSpot.z, site.yaw) : null;
  let postGeo: THREE.BufferGeometry | null = null;
  if (sign) {
    group.add(sign.group);
    postGeo = finish(rodBetween(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 2.6, 0), 0.08), { color: 0x2a2a36, rough: 0.6, metal: 0.2 });
    const post = new THREE.Mesh(postGeo, mat);
    sign.group.add(post);
  }

  const stand = new THREE.Vector3(site.x + fx * (PERCH.radius + 2.4), 0, site.z + fz * (PERCH.radius + 2.4));
  stand.y = ctx.world.heightAt(stand.x, stand.z);
  return {
    site,
    perchY: g0 + PERCH.height,
    standSpot: stand,
    dispose() {
      group.removeFromParent();
      geo.dispose();
      mat.dispose();
      postGeo?.dispose();
      sign?.dispose();
      ctx.physics.removeCollider(collider);
    },
  };
}
