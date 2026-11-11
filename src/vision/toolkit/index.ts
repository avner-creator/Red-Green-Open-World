/**
 * Vision toolkit: reusable building blocks on the weak-eye / strong-eye layers. Factories build a
 * `THREE.Object3D` plus a small controller; the caller registers the object with
 * `ctx.vision.add(obj, VisionLayer.WeakOnly | VisionLayer.StrongOnly)`. See README.md.
 */
export type { Facing, LayerBlock } from './common';
export { createRing, createTimingRing, createReticle, timingWindow, timingRadius, TIMING_DEFAULTS } from './rings';
export type { RingOptions, RingBlock, TimingRingOptions, TimingRingBlock, ReticleOptions, ReticleBlock, TimingGrade, TimingResult, TimingWindowOptions } from './rings';
export { createGlyphSprite, glyphAtlas, layoutGlyphs, resolveGlyph, GLYPH, GLYPHS } from './glyphs';
export type { GlyphSpriteOptions, GlyphSpriteBlock } from './glyphs';
export {
  createHalfSymbol,
  createHalfSymbolPair,
  createFullSymbolMesh,
  createFullSymbolTexture,
  pickCandidates,
  randomSymbol,
  sameSymbol,
  symbolOutline,
  HALF_SHAPES,
  FULL_SYMBOL_STYLE,
} from './halfSymbols';
export type { HalfShape, HalfSymbol, HalfSymbolBlock, HalfSymbolOptions, HalfSymbolPair, HalfSymbolPairOptions, CandidateSet } from './halfSymbols';
export { createDotPicturePair, generateDotPicture, strongPattern, DOT_BOARD_GREY, DOT_CELLS } from './dotPicture';
export type { DotPattern, DotPictureOptions, DotPicturePair } from './dotPicture';
export { SHAPE_IDS, shapeContains, rasterizeShape } from './shapes';
export type { ShapeId } from './shapes';
export { TIERS, withChallenge, toTier, MIN_SIZE_SCALE } from './tiers';
export type { TierPreset } from './tiers';
export { createFader, fadeValue } from './fade';
export type { Fader, FaderOptions } from './fade';
export { mulberry32, shuffle } from './rng';
export type { Rng } from './rng';
