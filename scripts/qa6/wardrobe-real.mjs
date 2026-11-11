// QA6 A: wardrobe tile pictures in the real game (no ?test=1). Click PLAY, wait, press I, wait in real time,
// count tiles with an <img>, screenshot. Usage: RG_PORT=4392 node scripts/qa6/wardrobe-real.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const port = Number(process.env.RG_PORT ?? 4392);
const out = 'test-results/qa6/wardrobe-real';
mkdirSync(out, { recursive: true });
const server = await preview({ preview: { port, strictPort: true, open: false }, logLevel: 'warn' });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
try {
  await page.goto(`http://localhost:${port}/?quality=low`);
  await page.getByTestId('play').waitFor({ timeout: 240000 });
  await page.waitForTimeout(3000);
  writeFileSync(`${out}/00-title.png`, await page.screenshot());
  // Title dressing room, if any
  const count = () => page.evaluate(() => {
    const tiles = [...document.querySelectorAll('[class*=wardrobe] button, [data-testid^="wardrobe"] button, [class*=tile]')];
    return { tiles: tiles.length, imgs: tiles.filter((t) => t.querySelector('img')).length, svgs: tiles.filter((t) => t.querySelector('svg')).length };
  });
  await page.getByTestId('play').click();
  await page.waitForTimeout(8000);
  writeFileSync(`${out}/01-playing.png`, await page.screenshot());
  await page.keyboard.press('KeyI');
  for (const s of [2, 6, 12, 20]) {
    await page.waitForTimeout(s * 1000 - (s === 2 ? 0 : 0));
    console.log('t', s, JSON.stringify(await count()));
    writeFileSync(`${out}/02-wardrobe-${s}s.png`, await page.screenshot());
  }
} finally {
  console.log('errors', JSON.stringify(errors.slice(0, 5)));
  await browser.close();
  server.httpServer.close();
}
