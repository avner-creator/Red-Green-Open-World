/** Browser-side boot helpers: WebGL 2 check, paint yields, tab visibility and lost GPU context. */

/** True when this browser can create a WebGL 2 context (checked on a throwaway canvas). */
export function hasWebGL2(): boolean {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

/**
 * Let the browser paint (so the loading bar moves) before the next long synchronous step. Works in
 * a background tab too, where `requestAnimationFrame` never fires and timers are throttled.
 */
export function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    let doneOnce = false;
    const done = (): void => {
      if (doneOnce) return;
      doneOnce = true;
      channel.port1.close();
      resolve();
    };
    channel.port1.onmessage = done;
    if (document.hidden) {
      channel.port2.postMessage(0);
      return;
    }
    // After the next animation frame the paint follows; a message then runs right after it.
    requestAnimationFrame(() => channel.port2.postMessage(0));
    // Guard: the tab may be hidden while we wait for that frame.
    setTimeout(done, 120);
  });
}

/** Resolves when the tab is visible (immediately if it already is). */
export function whenVisible(): Promise<void> {
  if (!document.hidden) return Promise.resolve();
  return new Promise((resolve) => {
    const on = (): void => {
      if (document.hidden) return;
      document.removeEventListener('visibilitychange', on);
      resolve();
    };
    document.addEventListener('visibilitychange', on);
  });
}

/** Calls `onHidden`/`onVisible` when the tab goes to the background and comes back. */
export function watchVisibility(handlers: { onHidden(): void; onVisible(): void }): () => void {
  let hidden = document.hidden;
  const on = (): void => {
    if (document.hidden === hidden) return;
    hidden = document.hidden;
    if (hidden) handlers.onHidden();
    else handlers.onVisible();
  };
  document.addEventListener('visibilitychange', on);
  return () => document.removeEventListener('visibilitychange', on);
}

/**
 * Lost / restored WebGL context. three.js already calls `preventDefault()` on loss (which allows a
 * restore) and rebuilds its GPU state on restore; this only tells the game to stop drawing and to
 * show / hide the wordless "picture is coming back" screen.
 */
export function watchContextLoss(canvas: HTMLCanvasElement, handlers: { onLost(): void; onRestored(): void }): () => void {
  const lost = (e: Event): void => {
    e.preventDefault();
    handlers.onLost();
  };
  const restored = (): void => handlers.onRestored();
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  return () => {
    canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('webglcontextrestored', restored);
  };
}

