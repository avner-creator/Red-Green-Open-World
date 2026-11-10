/**
 * Drives the inline loading screen in index.html (`#boot`): the progress bar follows the real boot
 * stages, then the screen reveals the title. The markup and CSS are inline in index.html so the
 * screen paints before any JavaScript arrives; this module only moves the bar and removes it.
 */
import { showFailure, type FailureKind, type FailureScreen } from './failure';
import { nextProgress, stageTarget, type BootStage } from './stages';

export interface BootLoader {
  /** Enter a boot stage: the bar jumps to its slice and creeps through it. */
  stage(id: BootStage): void;
  /** Current bar value 0..1 (what was last requested, not the animated position). */
  readonly progress: number;
  /** Fill the bar, fade the screen out and remove it. Resolves once `#boot` is gone. */
  done(): Promise<void>;
  /** Replace the loading screen with a wordless failure screen. */
  fail(kind: FailureKind): FailureScreen;
}

/** Time for the bar to fill to 100 % before the reveal, and the reveal fade itself. */
export const FILL_MS = 220;
export const REVEAL_MS = 450;

/**
 * `still`: stop the decorative loading-screen animations (test mode). Under the software renderer
 * the e2e suite uses, they compete with the first frame's shader compile for the CPU.
 */
export function createBootLoader(root: HTMLElement | null, opts: { still?: boolean } = {}): BootLoader {
  root?.classList.add('js'); // hides the no-JavaScript fallback retry link
  if (opts.still) root?.classList.add('still');
  const fill = root?.querySelector<HTMLElement>('#boot-fill') ?? null;
  let progress = 0;
  // Test mode: no pause on a full bar and a short fade (every e2e boot waits for the reveal).
  const fillMs = opts.still ? 0 : FILL_MS;
  const revealMs = opts.still ? 150 : REVEAL_MS;

  const show = (value: number, ms: number, ease = 'cubic-bezier(.25,.7,.35,1)'): void => {
    progress = nextProgress(progress, value);
    if (!root) return;
    root.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
    root.dataset.progress = progress.toFixed(3);
    if (fill) {
      fill.style.transition = `transform ${Math.max(0, ms)}ms ${ease}`;
      fill.style.transform = `scaleX(${progress.toFixed(4)})`;
    }
  };

  return {
    get progress() {
      return progress;
    },
    stage(id) {
      const t = stageTarget(id);
      if (root) root.dataset.stage = id;
      // Snap to the slice start (short), then the long creep is requested on the next frame.
      show(t.from, 160);
      const target = t.to;
      requestAnimationFrame(() => {
        if (progress >= target) return;
        show(target, t.ms, 'cubic-bezier(.15,.55,.3,1)');
      });
    },
    async done() {
      show(1, fillMs);
      if (!root) return;
      root.dataset.stage = 'done';
      if (fillMs) await new Promise((r) => setTimeout(r, fillMs));
      root.style.transitionDuration = `${revealMs}ms`;
      root.classList.add('out');
      await new Promise((r) => setTimeout(r, revealMs));
      root.remove();
    },
    fail(kind) {
      root?.remove();
      return showFailure(kind);
    },
  };
}
