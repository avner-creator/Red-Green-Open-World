// Renders every playable character in every animation and saves full, R-only and G-only
// screenshots to test-results/characters/. Also prints the measured bind-pose sizes.
// Usage: node scripts/shots-characters.mjs [animName ...]
// Runs the Vite dev server in-process and opens tools/characters/preview.html.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { PNG } from 'pngjs';
import { createServer } from 'vite';

const port = Number(process.env.RG_PORT ?? 4175);
const out = 'test-results/characters';
const wanted = process.argv.slice(2);
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 480 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`http://localhost:${port}/tools/characters/preview.html?live=0`);
  await page.waitForFunction(() => window.__preview?.ready === true, undefined, { timeout: 120000 });

  const save = async (name) => {
    const buf = await page.screenshot({ type: 'png' });
    const png = PNG.sync.read(buf);
    writeFileSync(`${out}/${name}-full.png`, buf);
    writeFileSync(`${out}/${name}-R.png`, splitChannel(png, 0));
    writeFileSync(`${out}/${name}-G.png`, splitChannel(png, 1));
    console.log(`saved ${out}/${name}-{full,R,G}.png`);
  };

  const sizes = await page.evaluate(() => window.__preview.measure());
  console.log('bind-pose sizes (m):', JSON.stringify(sizes, null, 1));
  writeFileSync(`${out}/sizes.json`, JSON.stringify(sizes, null, 2));

  // A moment in each clip that shows the pose well.
  const moments = { idle: 0.5, walk: 0.3, run: 0.2, jump: 0.35, fall: 0.3, flop: 0.6, dance: 0.6, wave: 0.5, cheer: 0.5, sit: 1.5, emote: 0.7 };
  for (const [anim, t] of Object.entries(moments)) {
    if (wanted.length && !wanted.includes(anim)) continue;
    await page.evaluate(([a, tt]) => window.__preview.pose(a, tt), [anim, t]);
    await save(`lineup-${anim}`);
  }
  if (!wanted.length || wanted.includes('anchors')) {
    await page.evaluate(() => {
      window.__preview.pose('idle', 0.5);
      window.__preview.showAnchors(true);
    });
    await save('lineup-anchors');
    await page.evaluate(() => window.__preview.showAnchors(false));
  }
  if (!wanted.length || wanted.includes('close')) {
    await page.setViewportSize({ width: 640, height: 640 });
    for (const id of Object.keys(sizes)) {
      await page.evaluate((i) => {
        window.__preview.focus(i);
        window.__preview.pose('idle', 0.5);
      }, id);
      await save(`close-${id}`);
    }
    // Outfit anchors (white = head, magenta = face, cyan = back), front and side.
    await page.evaluate(() => window.__preview.showAnchors(true));
    for (const id of Object.keys(sizes)) {
      for (const [view, yaw] of [['front', -0.35], ['side', -1.4]]) {
        await page.evaluate(([i, y]) => {
          window.__preview.focus(i, y);
          window.__preview.pose('idle', 0.5);
        }, [id, yaw]);
        const buf = await page.screenshot({ type: 'png' });
        writeFileSync(`${out}/anchors-${id}-${view}.png`, buf);
      }
    }
    await page.evaluate(() => window.__preview.showAnchors(false));
  }
  if (errors.length) {
    console.error('page errors:\n' + errors.join('\n'));
    process.exitCode = 1;
  }
} finally {
  await browser?.close();
  await server.close();
}
