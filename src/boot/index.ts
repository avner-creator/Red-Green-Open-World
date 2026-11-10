/** Stream I: loading screen, boot stages, failure screens, tab visibility and lost-context handling. */
export { createBootLoader, type BootLoader } from './loader';
export { showContextLost, showFailure, type FailureKind, type FailureScreen } from './failure';
export { hasWebGL2, nextPaint, watchContextLoss, watchVisibility, whenVisible } from './runtime';
export type { BootStage } from './stages';
