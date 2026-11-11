// Dev helper: cold boot the built game, press Play, report phase, errors and a screenshot.
// Usage: npm run build && RG_PORT=4368 node tools/characters/debug-play.mjs
import { writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const port = Number(process.env.RG_PORT ?? 4175);
const server = await preview({ preview: { port, strictPort: true, open: false }, logLevel: 'warn' });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', (e) => console.log('pageerror', String(e), e.stack));
  page.on('console', (m) => m.type() !== 'debug' && console.log('console', m.type(), m.text()));
  await page.goto(`http://localhost:${port}/?test=1&freeze=1${process.env.Q ?? ""}`);
  await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 180000 });
  await page.evaluate(() => window.__rg.freeze(true));
  await page.click('[data-testid="play"]');
  await page.evaluate(() => window.__rg.step(1 / 60, 1, false));
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(300);
    console.log(
      'heap MB',
      await page.evaluate(() => {
        const m = performance.memory;
        return m ? Math.round(m.usedJSHeapSize / 1e6) : -1;
      }),
    );
  }
  const go = page.locator('[data-testid="csel-go"]');
  console.log('go visible', await go.isVisible(), 'phase', await page.evaluate(() => window.__rg.state().phase));
  if (await go.isVisible()) {
    await go.click();
    await page.evaluate(() => window.__rg.step(1 / 60, 1, false));
  }
  console.log('phase', await page.evaluate(() => window.__rg.state().phase));
  writeFileSync('test-results/debug-play.png', await page.screenshot());
} finally {
  await browser.close();
  await server.close();
}
