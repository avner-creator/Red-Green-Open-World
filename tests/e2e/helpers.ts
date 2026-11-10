import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';

/** Load the game in test mode and wait until it has rendered a frame. Collects console errors. */
export async function boot(page: Page, query = ''): Promise<{ consoleErrors: string[] }> {
  const consoleErrors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  await page.goto(`/?test=1${query}`);
  await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 90_000 });
  return { consoleErrors };
}

/** Screenshot the page and decode it. */
export async function shot(page: Page, path?: string): Promise<PNG> {
  const buf = await page.screenshot({ path, type: 'png' });
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
