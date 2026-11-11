/**
 * The dichoptic compositor: always the LAST pass. Renders the WeakOnly / StrongOnly layer scenes
 * into their own MSAA targets (depth-tested against a copy of the main scene's depth), then writes
 * the final display-referred frame to the canvas:
 *   out[weak]   = C[weak]   + clamp(f(Lw, C[weak])   − C[weak],   ±limit) · Mw · strength
 *   out[strong] = contrast( C[strong] + clamp(f(Ls, C[strong]) − C[strong], ±limit) · Ms · strength )
 *   out.b       = C.b
 * where strength_w = strength · weakMul and strength_s = strength · strongMul (per-layer fade and
 * Auto challenge; both 1 = calibrated, see `effectiveUniforms` in math.ts).
 */
import * as THREE from 'three';
import { Pass } from 'postprocessing';
import { LAYER_SAMPLES } from './constants';
import { compositeFragment, depthCopyFragment, fullscreenVertex, maskCopyFragment } from './shaders';
import type { EffectiveUniforms } from './math';
import type { ChannelAssignment, EyeSettings } from '../types';

/** Test/debug view: show one layer's coverage mask as grey instead of the game frame. */
export type DebugView = 'off' | 'weak' | 'strong';

export interface LayerCoverage {
  /** Pixels with any coverage. */
  pixels: number;
  /** Bounding box in canvas pixels, origin top-left (null when empty). */
  bbox: { x0: number; y0: number; x1: number; y1: number } | null;
}

export class DichopticPass extends Pass {
  readonly weakScene = new THREE.Scene();
  readonly strongScene = new THREE.Scene();
  /** Calibration test pattern instead of the game frame. */
  calibration = false;

  private readonly viewCamera: THREE.PerspectiveCamera;
  private readonly weakTarget: THREE.WebGLRenderTarget;
  private readonly strongTarget: THREE.WebGLRenderTarget;
  private readonly material: THREE.ShaderMaterial;
  private readonly depthMaterial: THREE.ShaderMaterial;
  private readonly depthScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private depthTexture: THREE.Texture | null = null;
  private readonly clearColor = new THREE.Color();

  constructor(camera: THREE.PerspectiveCamera) {
    super('DichopticPass');
    this.viewCamera = camera;
    this.needsDepthTexture = true;
    this.needsSwap = false;
    const targetOpts = {
      type: THREE.HalfFloatType,
      depthBuffer: true,
      stencilBuffer: false,
      samples: LAYER_SAMPLES,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      generateMipmaps: false,
    };
    this.weakTarget = new THREE.WebGLRenderTarget(1, 1, targetOpts);
    this.strongTarget = new THREE.WebGLRenderTarget(1, 1, targetOpts);
    this.weakTarget.texture.name = 'Vision.WeakLayer';
    this.strongTarget.texture.name = 'Vision.StrongLayer';

    this.material = new THREE.ShaderMaterial({
      name: 'DichopticComposite',
      uniforms: {
        inputBuffer: { value: null },
        tWeak: { value: this.weakTarget.texture },
        tStrong: { value: this.strongTarget.texture },
        weakOn: { value: 0 },
        strongOn: { value: 0 },
        weakIsR: { value: 1 },
        strength: { value: 1 },
        limit: { value: 1 },
        contrast: { value: 1 },
        weakMul: { value: 1 },
        strongMul: { value: 1 },
        mode: { value: 0 },
        resolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: fullscreenVertex,
      fragmentShader: compositeFragment,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.fullscreenMaterial = this.material;

    this.depthMaterial = new THREE.ShaderMaterial({
      name: 'VisionDepthCopy',
      uniforms: { tDepth: { value: null }, cameraNear: { value: 0.1 }, cameraFar: { value: 1000 } },
      vertexShader: fullscreenVertex,
      fragmentShader: depthCopyFragment,
      depthTest: true,
      depthFunc: THREE.AlwaysDepth,
      depthWrite: true,
      colorWrite: false,
      toneMapped: false,
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const depthQuad = new THREE.Mesh(tri, this.depthMaterial);
    depthQuad.frustumCulled = false;
    this.depthScene.add(depthQuad);

    for (const scene of [this.weakScene, this.strongScene]) {
      // Own simple lighting so Standard/Lambert materials also give sensible luminance.
      scene.add(new THREE.HemisphereLight(0xffffff, 0x808080, 1.6));
      const sun = new THREE.DirectionalLight(0xffffff, 1.4);
      sun.position.set(0.4, 1, 0.3);
      scene.add(sun);
    }
  }

  /** Push eye settings into the shader. */
  setEye(eye: EyeSettings, ch: ChannelAssignment): void {
    const u = this.material.uniforms;
    u.weakIsR.value = ch.weak === 'r' ? 1 : 0;
    u.strength.value = eye.weakStrength;
    u.limit.value = eye.crosstalkLimit;
    u.contrast.value = eye.strongContrast;
  }

  /** Which layers have something to draw this frame (others are skipped entirely). */
  layersActive = { weak: false, strong: false };
  /** Which layer targets hold this frame's layer render (for `readCoverage`). */
  readonly layersRendered = { weak: false, strong: false };
  /** Test/debug only (reached through `window.__rgChallenge`). */
  debugView: DebugView = 'off';

  /** Per-frame runtime uniforms (fade × Auto challenge); identity = the calibrated settings. */
  setRuntime(u: Pick<EffectiveUniforms, 'contrast' | 'weakMul' | 'strongMul'>): void {
    const un = this.material.uniforms;
    un.contrast.value = u.contrast;
    un.weakMul.value = u.weakMul;
    un.strongMul.value = u.strongMul;
  }

  /** The numbers the compositor shader is using right now. */
  effective(): EffectiveUniforms {
    const u = this.material.uniforms;
    return {
      strength: u.strength.value as number,
      limit: u.limit.value as number,
      contrast: u.contrast.value as number,
      weakMul: u.weakMul.value as number,
      strongMul: u.strongMul.value as number,
    };
  }

  override setDepthTexture(depthTexture: THREE.Texture): void {
    this.depthTexture = depthTexture;
    this.depthMaterial.uniforms.tDepth.value = depthTexture;
  }

  override getDepthTexture(): THREE.Texture {
    // The base class also returns null when unset; its typing just doesn't say so.
    return this.depthTexture as THREE.Texture;
  }

  override setSize(width: number, height: number): void {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.weakTarget.setSize(w, h);
    this.strongTarget.setSize(w, h);
    this.material.uniforms.resolution.value.set(w, h);
  }

  private renderLayer(renderer: THREE.WebGLRenderer, scene: THREE.Scene, target: THREE.WebGLRenderTarget): void {
    renderer.setRenderTarget(target);
    renderer.clear(true, true, false);
    if (this.depthTexture) {
      const cam = this.viewCamera;
      this.depthMaterial.uniforms.cameraNear.value = cam.near;
      this.depthMaterial.uniforms.cameraFar.value = cam.far;
      renderer.render(this.depthScene, this.quadCamera);
    }
    renderer.render(scene, this.viewCamera);
  }

  override render(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget | null, outputBuffer: THREE.WebGLRenderTarget | null = null): void {
    const u = this.material.uniforms;
    if (this.calibration) {
      u.mode.value = 1;
      u.weakOn.value = 0;
      u.strongOn.value = 0;
    } else {
      u.mode.value = this.debugView === 'weak' ? 2 : this.debugView === 'strong' ? 3 : 0;
      const { weak, strong } = this.layersActive;
      this.layersRendered.weak = weak;
      this.layersRendered.strong = strong;
      if (weak || strong) {
        const prevAlpha = renderer.getClearAlpha();
        renderer.getClearColor(this.clearColor);
        renderer.setClearColor(0x000000, 0);
        if (weak) this.renderLayer(renderer, this.weakScene, this.weakTarget);
        if (strong) this.renderLayer(renderer, this.strongScene, this.strongTarget);
        renderer.setClearColor(this.clearColor, prevAlpha);
      }
      u.weakOn.value = weak ? 1 : 0;
      u.strongOn.value = strong ? 1 : 0;
      u.inputBuffer.value = inputBuffer ? inputBuffer.texture : null;
    }
    // Normally last (to the canvas); if something is appended after us, write the output buffer.
    this.needsSwap = !this.renderToScreen;
    renderer.setRenderTarget(this.renderToScreen ? null : outputBuffer);
    renderer.render(this.scene, this.camera);
  }

  /** Render only the calibration pattern straight to the canvas (no game frame needed). */
  renderPattern(renderer: THREE.WebGLRenderer): void {
    const prev = this.calibration;
    this.calibration = true;
    this.render(renderer, null);
    this.calibration = prev;
  }

  /**
   * Coverage of a layer's mask from the last render. The layer targets are MSAA half-float; the
   * resolved texture's alpha is drawn into a plain 8-bit target that can always be read back.
   */
  readCoverage(renderer: THREE.WebGLRenderer, layer: 'weak' | 'strong'): LayerCoverage {
    if (!this.layersRendered[layer]) return { pixels: 0, bbox: null };
    const src = layer === 'weak' ? this.weakTarget : this.strongTarget;
    const w = src.width;
    const h = src.height;
    if (!this.maskTarget) {
      this.maskTarget = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false, type: THREE.UnsignedByteType });
      this.maskMaterial = new THREE.ShaderMaterial({
        name: 'VisionMaskCopy',
        uniforms: { tLayer: { value: null } },
        vertexShader: fullscreenVertex,
        fragmentShader: maskCopyFragment,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      });
      const tri = new THREE.BufferGeometry();
      tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
      const quad = new THREE.Mesh(tri, this.maskMaterial);
      quad.frustumCulled = false;
      this.maskScene.add(quad);
    }
    const mat = this.maskMaterial as THREE.ShaderMaterial;
    this.maskTarget.setSize(w, h);
    mat.uniforms.tLayer.value = src.texture;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.maskTarget);
    renderer.render(this.maskScene, this.quadCamera);
    const buf = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(this.maskTarget, 0, 0, w, h, buf);
    renderer.setRenderTarget(prev);
    let pixels = 0;
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (buf[(y * w + x) * 4] === 0) continue;
        pixels++;
        const ty = h - 1 - y; // readPixels rows start at the bottom
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (ty < y0) y0 = ty;
        if (ty > y1) y1 = ty;
      }
    }
    return { pixels, bbox: pixels > 0 ? { x0, y0, x1, y1 } : null };
  }

  private maskTarget: THREE.WebGLRenderTarget | null = null;
  private maskMaterial: THREE.ShaderMaterial | null = null;
  private readonly maskScene = new THREE.Scene();

  override dispose(): void {
    this.maskTarget?.dispose();
    this.maskMaterial?.dispose();
    this.weakTarget.dispose();
    this.strongTarget.dispose();
    this.material.dispose();
    this.depthMaterial.dispose();
  }
}
