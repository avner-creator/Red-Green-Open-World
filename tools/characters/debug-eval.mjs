// Dev helper: open the lineup preview for some heroes and print what an expression evaluates to.
// Usage: RG_PORT=4368 node tools/characters/debug-eval.mjs frog "<js expression using window.__preview>"
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const port = Number(process.env.RG_PORT ?? 4175);
const server = await createServer({ server: { port, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
  page.on('pageerror', (e) => console.log('pageerror', String(e)));
  page.on('console', (m) => console.log('console', m.type(), m.text()));
  await page.goto(`http://localhost:${port}/tools/characters/preview.html?live=0&only=${process.argv[2]}`);
  await page.waitForFunction(() => window.__preview?.ready === true, undefined, { timeout: 180000 });
  console.log(JSON.stringify(await page.evaluate(process.argv[3]), null, 1));
} finally {
  await browser.close();
  await server.close();
}
