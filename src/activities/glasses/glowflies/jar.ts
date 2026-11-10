/**
 * The both-eye glow jar on its stump plus the meadow patch's flowers: ONE merged mesh (one draw
 * call). The jar shows only a COUNT (lit beads, bottom up); a little "gulp" squash plays on each
 * catch. Nothing here ever moves towards a fly.
 *
 * Built in the mesh's own frame: the mesh sits at the site centre (ground height) with the site's
 * yaw, so geometry x/z are site-local metres and y is height above the centre's ground.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../../../vision/toolkit/rng';

export interface JarOptions {
  /** Jar position, site-local. */
  jar: { x: number; z: number };
  /** Spots (site-local) the flowers keep clear of. */
  avoid: readonly { x: number; z: number; r: number }[];
  patchRadius: number;
  notches: number;
  /** Ground height relative to the centre's ground, at site-local (x, z). */
  heightAt(x: number, z: number): number;
}

export interface JarMesh {
  readonly mesh: THREE.Mesh;
  /** Height of the jar's opening above the centre's ground. */
  readonly topY: number;
  setFill(n: number): void;
  gulp(): void;
  update(dt: number): void;
  dispose(): void;
}

const STUMP_H = 0.55;
const JAR_R = 0.42;
const JAR_H = 0.95;

type Part = { geo: THREE.BufferGeometry; color: THREE.ColorRepresentation; bead?: number; jar?: boolean; alpha?: number };

function paint(p: Part): THREE.BufferGeometry {
  const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const n = g.getAttribute('position').count;
  const c = new THREE.Color(p.color);
  const col = new Float32Array(n * 4);
  const bead = new Float32Array(n);
  const jar = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    col.set([c.r, c.g, c.b, p.alpha ?? 1], i * 4);
    bead[i] = p.bead ?? 0;
    jar[i] = p.jar ? 1 : 0;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  g.setAttribute('aBead', new THREE.BufferAttribute(bead, 1));
  g.setAttribute('aJar', new THREE.BufferAttribute(jar, 1));
  return g;
}

export function buildJar(o: JarOptions): JarMesh {
  const parts: Part[] = [];
  const jx = o.jar.x;
  const jz = o.jar.z;
  const jy = o.heightAt(jx, jz);
  const base = jy + STUMP_H;

  // Beads first (drawn before the glass in the same draw call), piled bottom-up in rings of 4.
  for (let i = 0; i < o.notches; i++) {
    const layer = Math.floor(i / 4);
    const a = (i % 4) * (Math.PI / 2) + layer * 0.78;
    const r = 0.19;
    parts.push({ geo: new THREE.IcosahedronGeometry(0.105, 1).translate(jx + Math.cos(a) * r, base + 0.14 + layer * 0.2, jz + Math.sin(a) * r), color: 0x2a2f2a, bead: i + 1, jar: true });
  }
  // Stump (chunky wood with a pale cut top) — both lighter and darker than the grass.
  parts.push({ geo: new THREE.CylinderGeometry(0.55, 0.66, STUMP_H, 12).translate(jx, jy + STUMP_H / 2 - 0.05, jz), color: 0x6b4a2e });
  parts.push({ geo: new THREE.CylinderGeometry(0.53, 0.53, 0.04, 12).translate(jx, jy + STUMP_H - 0.03, jz), color: 0xe8d2a4 });
  // Jar: dark base, thick rims, glass walls (front faces only, see-through), lid and loop.
  parts.push({ geo: new THREE.CylinderGeometry(JAR_R + 0.03, JAR_R + 0.05, 0.08, 18).translate(jx, base + 0.04, jz), color: 0x23303a, jar: true });
  parts.push({ geo: new THREE.TorusGeometry(JAR_R + 0.02, 0.045, 6, 20).rotateX(Math.PI / 2).translate(jx, base + JAR_H, jz), color: 0x2d3a46, jar: true });
  parts.push({ geo: new THREE.CylinderGeometry(JAR_R - 0.06, JAR_R + 0.02, 0.12, 18).translate(jx, base + JAR_H + 0.08, jz), color: 0xc9933c, jar: true });
  parts.push({ geo: new THREE.TorusGeometry(0.13, 0.035, 6, 14).translate(jx, base + JAR_H + 0.26, jz), color: 0x2d3a46, jar: true });
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    parts.push({ geo: new THREE.BoxGeometry(0.05, JAR_H, 0.05).translate(jx + Math.cos(a) * (JAR_R + 0.01), base + JAR_H / 2, jz + Math.sin(a) * (JAR_R + 0.01)), color: 0x2d3a46, jar: true });
  }
  parts.push({ geo: new THREE.CylinderGeometry(JAR_R, JAR_R, JAR_H, 22, 1, true).translate(jx, base + JAR_H / 2, jz), color: 0xd8eef5, jar: true, alpha: 0.22 });

  // Meadow: tufts and flowers inside the patch (low: they never hide a fly at 0.8 m+).
  const rng = mulberry32(0x91f1e5);
  const petals = [0xffffff, 0xffe066, 0xff9ec7, 0xb9a6ff, 0xffffff];
  let placed = 0;
  for (let tries = 0; tries < 400 && placed < 34; tries++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * (o.patchRadius + 0.6);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (o.avoid.some((v) => Math.hypot(x - v.x, z - v.z) < v.r * 0.75)) continue;
    const y = o.heightAt(x, z);
    placed++;
    if (placed % 3 === 0) {
      parts.push({ geo: new THREE.ConeGeometry(0.12, 0.32, 5).translate(x, y + 0.13, z), color: 0x3f7d2c });
      continue;
    }
    const h = 0.18 + rng() * 0.18;
    parts.push({ geo: new THREE.CylinderGeometry(0.012, 0.016, h, 4).translate(x, y + h / 2, z), color: 0x3b6e2a });
    parts.push({ geo: new THREE.IcosahedronGeometry(0.065 + rng() * 0.03, 0).scale(1, 0.55, 1).translate(x, y + h, z), color: petals[placed % petals.length] });
    parts.push({ geo: new THREE.IcosahedronGeometry(0.03, 0).translate(x, y + h + 0.025, z), color: 0xffb11a });
  }

  const geo = mergeGeometries(parts.map(paint), false);
  for (const p of parts) p.geo.dispose();
  geo.computeBoundingSphere();

  const uniforms = { uFill: { value: 0 }, uSq: { value: new THREE.Vector2(1, 1) }, uJarBase: { value: new THREE.Vector3(jx, base, jz) } };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, transparent: true });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute float aBead;\nattribute float aJar;\nuniform float uFill;\nuniform vec2 uSq;\nuniform vec3 uJarBase;\nvarying float vLit;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvLit = (aBead > 0.5 && aBead < uFill + 0.5) ? 1.0 : 0.0;\nif (aJar > 0.5) { vec3 o = transformed - uJarBase; o.y *= uSq.y; o.xz *= uSq.x; transformed = uJarBase + o; }',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLit;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (vLit > 0.5) { diffuseColor.rgb = vec3(1.0, 0.93, 0.62); totalEmissiveRadiance += vec3(1.0, 0.9, 0.55) * 1.4; }');
  };
  mat.customProgramCacheKey = () => 'glasses-glowjar';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'glowflies-jar';
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  let gulpT = -1;
  return {
    mesh,
    topY: base + JAR_H,
    setFill(n) {
      uniforms.uFill.value = Math.max(0, Math.min(o.notches, n));
    },
    gulp() {
      gulpT = 0;
    },
    update(dt) {
      if (gulpT < 0) return;
      gulpT += dt;
      const k = gulpT / 0.55;
      if (k >= 1) {
        gulpT = -1;
        uniforms.uSq.value.set(1, 1);
        return;
      }
      const s = Math.sin(k * Math.PI * 2) * (1 - k) * 0.22;
      uniforms.uSq.value.set(1 + s, 1 - s);
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
