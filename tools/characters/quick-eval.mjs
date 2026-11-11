// Dev helper: evaluate a JS file in the lineup preview on a running dev server and print the result.
// Usage: RG_PORT=4373 node tools/characters/quick-eval.mjs <ids comma-separated> <file.js>
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const port = Number(process.env.RG_PORT ?? 4373);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 300, height: 200 } });
  page.on('pageerror', (e) => console.log('pageerror', String(e)));
  await page.goto(`http://localhost:${port}/tools/characters/preview.html?live=0&only=${process.argv[2]}`);
  await page.waitForFunction(() => window.__preview?.ready === true, undefined, { timeout: 180000 });
  console.log(JSON.stringify(await page.evaluate(readFileSync(process.argv[3], 'utf8'))));
} finally {
  await browser.close();
}
