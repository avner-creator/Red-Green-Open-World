// Close-up hero portraits (front + 3/4) from the lineup preview, plus R-only / G-only splits.
// Usage (repo root): RG_PORT=4368 node tools/characters/shots-warm.mjs <tag> [id ...]
// Saves test-results/heroes-warm-<tag>/<id>-{front,34}{,-R,-G}.png and a lineup.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import { createServer } from 'vite';

const port = Number(process.env.RG_PORT ?? 4175);
const tag = process.argv[2] ?? 'now';
const only = process.argv.slice(3);
const out = `test-results/heroes-warm-${tag}`;
mkdirSync(out, { recursive: true });

function splitChannel(png, c) {
  const o = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    const v = png.data[i + c];
    o.data[i] = o.data[i + 1] = o.data[i + 2] = v;
    o.data[i + 3] = 255;
  }
  return PNG.sync.write(o);
}

const server = await createServer({ server: { port, strictPort: true }, logLevel: 'warn' });
await server.listen();
let browser;
try {
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 420 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const q = only.length ? `&only=${only.join(',')}` : '';
  await page.goto(`http://localhost:${port}/tools/characters/preview.html?live=0${q}`);
  await page.waitForFunction(() => window.__preview?.ready === true, undefined, { timeout: 180000 });
  const save = async (name, rgb = false) => {
    const buf = await page.screenshot({ type: 'png' });
    writeFileSync(`${out}/${name}.png`, buf);
    if (rgb) {
      const png = PNG.sync.read(buf);
      writeFileSync(`${out}/${name}-R.png`, splitChannel(png, 0));
      writeFileSync(`${out}/${name}-G.png`, splitChannel(png, 1));
    }
    console.log(`saved ${out}/${name}.png`);
  };
  const ids = await page.evaluate(() => Object.keys(window.__preview.measure()));
  await page.evaluate(() => {
    window.__preview.focus(null);
    window.__preview.pose('idle', 0.5);
  });
  await save('lineup', true);
  await page.setViewportSize({ width: 480, height: 480 });
  for (const id of ids) {
    for (const [view, yaw, rgb] of [['front', 0, false], ['34', -0.65, true]]) {
      await page.evaluate(([i, y]) => {
        window.__preview.focus(i, y);
        window.__preview.pose('idle', 0.5);
      }, [id, yaw]);
      await save(`${id}-${view}`, rgb);
    }
  }
  if (errors.length) {
    console.error('page errors:\n' + errors.join('\n'));
    process.exitCode = 1;
  }
} finally {
  await browser?.close();
  await server.close();
}
