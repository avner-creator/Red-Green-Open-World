import { writeFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';

/**
 * Screenshots taken only for humans to look at (menus, wearables) are slow on SwiftShader
 * (6-11 s each), so they are opt-in: `RG_SHOTS=1` (npm run shots:ui). Functional assertions
 * always run.
 */
export const SHOTS = process.env.RG_SHOTS === '1';

/**
 * Load the game in test mode and wait until it has rendered a frame. Collects console errors.
 * Boots at Low quality (no shadow map: ~2x faster frames on SwiftShader) unless `query` names a
 * `quality=`; tests that judge the look of the lit world pass `&quality=medium`.
 */
export async function boot(page: Page, query = ''): Promise<{ consoleErrors: string[] }> {
  if (!query.includes('quality=')) query += '&quality=low';
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.goto(`/?test=1${query}`);
  await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 90_000 });
  // The boot overlay fades out (~0.5 s) and is then removed; never screenshot it half-faded.
  await page.waitForSelector('#boot', { state: 'detached', timeout: 10_000 });
  return { consoleErrors };
}

/** Screenshot the page (canvas + DOM, CSS animations stopped) and decode it. */
export async function shot(page: Page, path?: string): Promise<PNG> {
  const buf = await page.screenshot({ path, type: 'png', animations: 'disabled', caret: 'hide' });
  return PNG.sync.read(buf);
}

/**
 * Read back only the WebGL canvas (what the dichoptic compositor wrote), without the DOM HUD on
 * top. Test mode sets `preserveDrawingBuffer`, so this is the last rendered frame. Use this for
 * channel-exact assertions: DOM menus/HUD animate independently of the frozen game loop.
 */
export async function canvasShot(page: Page, path?: string): Promise<PNG> {
  const url = await page.evaluate(() => (document.getElementById('game') as HTMLCanvasElement).toDataURL('image/png'));
  const buf = Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  if (path) writeFileSync(path, buf);
  return PNG.sync.read(buf);
}

/** Per-channel statistics of the absolute difference between two same-size images. */
export function channelDiff(a: PNG, b: PNG): { r: number; g: number; b: number; maxR: number; maxG: number; maxB: number } {
  if (a.width !== b.width || a.height !== b.height) throw new Error('size mismatch');
  const count = [0, 0, 0];
  const max = [0, 0, 0];
  for (let i = 0; i < a.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const d = Math.abs(a.data[i + c] - b.data[i + c]);
      if (d > 2) count[c]++;
      if (d > max[c]) max[c] = d;
    }
  }
  return { r: count[0], g: count[1], b: count[2], maxR: max[0], maxG: max[1], maxB: max[2] };
}

/** Standard deviation of luminance: > ~5 means "not a blank frame". */
export function lumaStdDev(img: PNG): number {
  let sum = 0;
  let sum2 = 0;
  const n = img.width * img.height;
  for (let i = 0; i < img.data.length; i += 4) {
    const l = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
    sum += l;
    sum2 += l * l;
  }
  const mean = sum / n;
  return Math.sqrt(Math.max(0, sum2 / n - mean * mean));
}

/**
 * Title -> character select -> playing: Play, then Go (the remembered or default hero). Pass
 * `tap: true` on touch pages.
 */
export async function startGame(page: Page, tap = false): Promise<void> {
  const play = page.getByTestId('play');
  if (tap) await play.tap();
  else await play.click();
  const go = page.getByTestId('csel-go');
  await go.waitFor({ state: 'visible' });
  if (tap) await go.tap();
  else await go.click();
}
