/**
 * Shadow proxies: low-poly stand-ins that only the shadow map draws, so detailed hero meshes can
 * skip the shadow pass (castShadow = false) and the shadow pass stays a few cheap draws.
 *
 * A proxy lives on SHADOW_PROXY_LAYER only. The main camera never enables that layer; three's
 * shadow map uses the shadow camera's layers as soon as they hold any layer besides 0, so the
 * sun's shadow camera gets layer 0 + this layer (`enableShadowProxies`).
 */
import * as THREE from 'three';

export const SHADOW_PROXY_LAYER = 7;

let proxyMaterial: THREE.MeshBasicMaterial | null = null;

/** Shared material for proxies (never drawn in a colour pass; the shadow pass only reads `side`). */
export function shadowProxyMaterial(): THREE.MeshBasicMaterial {
  if (!proxyMaterial) proxyMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  return proxyMaterial;
}

/** Turn a mesh into a shadow-only proxy (layer, flags, shared material). Returns the mesh. */
export function asShadowProxy<T extends THREE.Mesh>(mesh: T): T {
  mesh.layers.set(SHADOW_PROXY_LAYER);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  mesh.material = shadowProxyMaterial();
  mesh.name = mesh.name || 'shadow-proxy';
  return mesh;
}

/** A shadow-only mesh for `geometry`. */
export function shadowProxy(geometry: THREE.BufferGeometry, name = 'shadow-proxy'): THREE.Mesh {
  const m = asShadowProxy(new THREE.Mesh(geometry));
  m.name = name;
  return m;
}

/**
 * Let every shadow-casting light in `scene` draw proxies. Idempotent and cheap after the first
 * success per light; returns true once at least one shadow-casting light was found.
 */
export function enableShadowProxies(scene: THREE.Object3D): boolean {
  let found = false;
  scene.traverse((o) => {
    const light = o as THREE.DirectionalLight;
    if (!light.isLight || !light.castShadow || !light.shadow) return;
    light.shadow.camera.layers.enable(0);
    light.shadow.camera.layers.enable(SHADOW_PROXY_LAYER);
    found = true;
  });
  return found;
}

/** Calls `enableShadowProxies` until it finds a light (lights may be added after the caller). */
export function shadowProxyWatcher(scene: THREE.Object3D): (dt: number) => void {
  let done = enableShadowProxies(scene);
  let wait = 1;
  return (dt) => {
    if (done) return;
    wait -= dt;
    if (wait > 0) return;
    wait = 1;
    done = enableShadowProxies(scene);
  };
}
