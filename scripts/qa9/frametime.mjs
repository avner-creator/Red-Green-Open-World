// QA7: average real-time frame time (SwiftShader) at spawn after PLAY, 960x540 and 640x360, quality=low.
// Usage: RG_PORT=4398 node scripts/qa9/frametime.mjs
import { open } from './lib.mjs';

for (const [w, h] of [[960, 540], [640, 360]]) {
  const { page, close } = await open(`ft-${w}`, { query: '&quality=low', width: w, height: h });
  try {
    await page.getByTestId('play').click();
    await page.waitForTimeout(20000);
    const r = await page.evaluate(async () => {
      const f0 = window.__rg.frames; const t0 = performance.now();
      await new Promise((res) => setTimeout(res, 15000));
      const n = window.__rg.frames - f0; const dt = performance.now() - t0;
      return { frames: n, msPerFrame: +(dt / Math.max(1, n)).toFixed(1) };
    });
    console.log(w, h, JSON.stringify(r));
  } finally {
    await close();
  }
}
