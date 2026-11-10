/**
 * GLSL for the dichoptic compositor. Constants come from `constants.ts` (shared with the TS mirror
 * in `math.ts`, which the unit tests check).
 */
import { CALIBRATION_GREYS, CALIBRATION_PANEL, COMPOSITE, DEPTH_BIAS, LUMA } from './constants';

const f = (n: number): string => n.toFixed(6);

export const fullscreenVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;

/**
 * Copies the main scene's depth (stable composer depth texture) into the layer target's depth
 * buffer, pushed back a little (see DEPTH_BIAS). Writes no colour.
 */
export const depthCopyFragment = /* glsl */ `
uniform sampler2D tDepth;
uniform float cameraNear;
uniform float cameraFar;
varying vec2 vUv;
void main() {
  float d = texture2D(tDepth, vUv).r;
  if (d >= 1.0) { gl_FragDepth = 1.0; return; }
  float n = cameraNear;
  float fa = cameraFar;
  float viewZ = (n * fa) / ((fa - n) * d - fa);
  viewZ -= abs(viewZ) * ${f(DEPTH_BIAS.rel)} + ${f(DEPTH_BIAS.abs)};
  gl_FragDepth = clamp(((n + viewZ) * fa) / ((fa - n) * viewZ), 0.0, 1.0);
  gl_FragColor = vec4(0.0);
}
`;

/** Test/debug: a layer target's coverage (alpha) as grey, for an 8-bit readback. */
export const maskCopyFragment = /* glsl */ `
uniform sampler2D tLayer;
varying vec2 vUv;
void main() {
  gl_FragColor = vec4(vec3(clamp(texture2D(tLayer, vUv).a, 0.0, 1.0)), 1.0);
}
`;

const greys = CALIBRATION_GREYS.map(f);

export const compositeFragment = /* glsl */ `
uniform sampler2D inputBuffer;
uniform sampler2D tWeak;
uniform sampler2D tStrong;
uniform float weakOn;
uniform float strongOn;
uniform float weakIsR;
uniform float strength;
uniform float limit;
uniform float contrast;
uniform float weakMul;   // per-layer fade × Auto challenge (1 = calibrated)
uniform float strongMul; // per-layer fade (1 = calibrated)
uniform float mode; // 0 = game frame, 1 = calibration pattern, 2/3 = weak/strong mask (test debug view)
uniform vec2 resolution;
varying vec2 vUv;

const vec3 LUMA = vec3(${f(LUMA[0])}, ${f(LUMA[1])}, ${f(LUMA[2])});

float toSrgb(float c) {
  c = clamp(c, 0.0, 1.0);
  return c <= 0.0031308 ? c * 12.92 : 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}
vec3 toSrgb3(vec3 c) { return vec3(toSrgb(c.r), toSrgb(c.g), toSrgb(c.b)); }

// Mirror of layerTarget/compositeLayer in math.ts.
float layerTarget(float L, float bg, float pivotBg) {
  float a = ${f(COMPOSITE.popMin)} + ${f(COMPOSITE.popMax - COMPOSITE.popMin)} * clamp(L, 0.0, 1.0);
  return pivotBg < ${f(COMPOSITE.pivot)} ? bg + (1.0 - bg) * a : bg * (1.0 - a);
}
float compositeLayer(float bg, float L, float m, float pivotBg, float mul) {
  float delta = clamp(layerTarget(L, bg, pivotBg) - bg, -limit, limit);
  return bg + delta * clamp(m, 0.0, 1.0) * (clamp(strength, 0.0, 1.0) * mul);
}
float polarityBg(float bg, float blurred) {
  return bg * ${f(COMPOSITE.polarityLocalWeight)} + blurred * ${f(1 - COMPOSITE.polarityLocalWeight)};
}

// Layer target holds premultiplied linear colour + coverage. Returns (L in display sRGB, M).
vec2 layerSample(sampler2D t) {
  vec4 s = texture2D(t, vUv);
  float m = clamp(s.a, 0.0, 1.0);
  float lum = dot(max(s.rgb, vec3(0.0)), LUMA) / max(s.a, 1e-4);
  return vec2(toSrgb(lum), m);
}

float pickChannel(vec3 c, float isR) { return isR > 0.5 ? c.r : c.g; }

float blurredChannel(float isR) {
  vec2 px = ${f(COMPOSITE.polarityBlurPx)} / resolution;
  float s = 0.0;
  s += pickChannel(toSrgb3(texture2D(inputBuffer, vUv + vec2(px.x, 0.0)).rgb), isR);
  s += pickChannel(toSrgb3(texture2D(inputBuffer, vUv - vec2(px.x, 0.0)).rgb), isR);
  s += pickChannel(toSrgb3(texture2D(inputBuffer, vUv + vec2(0.0, px.y)).rgb), isR);
  s += pickChannel(toSrgb3(texture2D(inputBuffer, vUv - vec2(0.0, px.y)).rgb), isR);
  return s * 0.25;
}

// ── Calibration test pattern: same maths, procedural inputs ──
const float GREYS[5] = float[5](${greys.join(', ')});
const float PANEL = ${f(CALIBRATION_PANEL)};

float discCoverage(vec2 p, vec2 c, float r) { return clamp(r - length(p - c) + 0.5, 0.0, 1.0); }
float boxCoverage(vec2 p, vec2 c, float h) {
  vec2 d = abs(p - c) - vec2(h * 0.75);
  float dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - h * 0.25;
  return clamp(0.5 - dist, 0.0, 1.0);
}

// Returns background grey; writes weak (L,M) and strong (L,M).
float calibrationPattern(out vec2 weakLM, out vec2 strongLM) {
  vec2 p = vUv * resolution;
  weakLM = vec2(0.0);
  strongLM = vec2(0.0);
  float top = resolution.y;
  float bottom = resolution.y * PANEL;
  if (p.y < bottom) return 0.08;
  float colW = resolution.x / 5.0;
  int col = int(clamp(floor(p.x / colW), 0.0, 4.0));
  float bg = GREYS[col];
  float rowH = (top - bottom) * 0.5;
  float r = min(colW, rowH) * 0.26;
  vec2 cW = vec2((float(col) + 0.5) * colW, bottom + rowH * 1.42);
  vec2 cS = vec2((float(col) + 0.5) * colW, bottom + rowH * 0.42);
  // Weak-eye ring with a bright core: a "gem" shape.
  float ring = discCoverage(p, cW, r) * (1.0 - discCoverage(p, cW, r * 0.62)) + discCoverage(p, cW, r * 0.34);
  weakLM = vec2(1.0, clamp(ring, 0.0, 1.0));
  strongLM = vec2(1.0, boxCoverage(p, cS, r * 0.9));
  return bg;
}

void main() {
  vec3 c;
  vec2 w;
  vec2 s;
  float blurW;
  float blurS;
  if (mode > 0.5 && mode < 1.5) {
    float g = calibrationPattern(w, s);
    c = vec3(g);
    blurW = g;
    blurS = g;
  } else {
    c = toSrgb3(texture2D(inputBuffer, vUv).rgb);
    w = weakOn > 0.5 ? layerSample(tWeak) : vec2(0.0);
    s = strongOn > 0.5 ? layerSample(tStrong) : vec2(0.0);
    blurW = w.y > 0.0 ? blurredChannel(weakIsR) : 0.0;
    blurS = s.y > 0.0 ? blurredChannel(1.0 - weakIsR) : 0.0;
  }
  if (mode > 1.5) {
    gl_FragColor = vec4(vec3(mode > 2.5 ? s.y : w.y), 1.0);
    return;
  }
  float bgW = pickChannel(c, weakIsR);
  float bgS = pickChannel(c, 1.0 - weakIsR);
  // Weak channel: only the weak layer. Strong channel: only the strong layer + contrast.
  float outW = clamp(compositeLayer(bgW, w.x, w.y, polarityBg(bgW, blurW), weakMul), 0.0, 1.0);
  float sMix = compositeLayer(bgS, s.x, s.y, polarityBg(bgS, blurS), strongMul);
  float outS = clamp(${f(COMPOSITE.contrastMid)} + (sMix - ${f(COMPOSITE.contrastMid)}) * contrast, 0.0, 1.0);
  vec3 o = vec3(weakIsR > 0.5 ? outW : outS, weakIsR > 0.5 ? outS : outW, c.b);
  gl_FragColor = vec4(o, 1.0);
}
`;
