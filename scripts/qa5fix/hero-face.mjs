// Front and 3/4 close-ups of heroes from the character preview page (no viewport resize: the
// preview renderer keeps its first size). Usage: RG_PORT=4383 node scripts/qa5fix/hero-face.mjs <tag> id [id ...]
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
const port = Number(process.env.RG_PORT ?? 4383);
const [tag, ...ids] = process.argv.slice(2);
const out = `test-results/qa5fix/heroes-${tag}`;
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const id of ids) {
    const page = await browser.newPage({ viewport: { width: 520, height: 520 } });
    await page.goto(`http://localhost:${port}/tools/characters/preview.html?live=0&only=${id}${process.env.BACKLIT ? '&backlit=1' : ''}`);
    await page.waitForFunction(() => window.__preview?.ready === true, undefined, { timeout: 180000 });
    for (const [view, yaw] of [['front', 0], ['34', -0.65]]) {
      await page.evaluate(([i, y]) => {
        window.__preview.focus(i, y);
        window.__preview.pose('idle', 0.5);
      }, [id, yaw]);
      writeFileSync(`${out}/${id}-${view}.png`, await page.screenshot({ type: 'png' }));
    }
    await page.close();
    console.log('saved', id);
  }
} finally {
  await browser.close();
  await server.close();
}
