/**
 * Constants shared by the compositor shader (GLSL, see `shaders.ts`) and its TypeScript mirror
 * (`math.ts`, used by unit tests). Change them here only; both sides read these values.
 */
export const COMPOSITE = {
  /** Minimum "pop" of a layer object (L = 0). The object moves this fraction toward black/white. */
  popMin: 0.6,
  /** Maximum "pop" of a layer object (L = 1). */
  popMax: 1.0,
  /** Background level (display sRGB) at which objects switch from "brighten" to "darken". */
  pivot: 0.5,
  /** Polarity uses the average of the local background and a small blurred neighbourhood. */
  polarityLocalWeight: 0.5,
  /** Radius (CSS-independent device pixels) of the 4-tap polarity blur. */
  polarityBlurPx: 6,
  /** Strong-eye contrast is scaled around this level (display sRGB). */
  contrastMid: 0.5,
} as const;

/** Rec. 709 luminance weights (linear light). */
export const LUMA = [0.2126, 0.7152, 0.0722] as const;

/**
 * Layer objects are depth-tested against the main scene's depth, pushed back a little so that
 * decals lying on the ground (secret paths) do not z-fight: bias = |viewZ| * rel + abs (metres).
 */
export const DEPTH_BIAS = { rel: 0.002, abs: 0.01 } as const;

/** MSAA samples of the layer targets (smooth mask edges). */
export const LAYER_SAMPLES = 4;

/** Calibration test pattern: background greys of the five columns (display sRGB). */
export const CALIBRATION_GREYS = [0, 0.25, 0.5, 0.75, 1] as const;
/** Fraction of the screen height (from the bottom) covered by the calibration control panel. */
export const CALIBRATION_PANEL = 0.38;
