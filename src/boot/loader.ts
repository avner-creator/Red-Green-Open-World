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

export function createBootLoader(root: HTMLElement | null): BootLoader {
  root?.classList.add('js'); // hides the no-JavaScript fallback retry link
  const fill = root?.querySelector<HTMLElement>('#boot-fill') ?? null;
  let progress = 0;

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
      show(1, FILL_MS);
      if (!root) return;
      root.dataset.stage = 'done';
      await new Promise((r) => setTimeout(r, FILL_MS));
      root.classList.add('out');
      await new Promise((r) => setTimeout(r, REVEAL_MS));
      root.remove();
    },
    fail(kind) {
      root?.remove();
      return showFailure(kind);
    },
  };
}
