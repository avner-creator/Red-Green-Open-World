// Shared helpers for QA round 4 part C (scripts/qa4c/*.mjs). Not part of `npm run verify`.
// Boots `vite preview` on RG_PORT (default 4363), opens Chromium (SwiftShader) with an optional
// Playwright device descriptor, saves PNGs to test-results/qa4c/<dir>/.
// `shot(name, { channels: true })` also writes R-only and G-only grey copies.
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium, devices } from '@playwright/test';
import { PNG } from 'pngjs';
import { preview } from 'vite';

export function splitChannel(png, c) {
  const o = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    const v = png.data[i + c];
    o.data[i] = v;
    o.data[i + 1] = v;
    o.data[i + 2] = v;
    o.data[i + 3] = 255;
  }
  return PNG.sync.write(o);
}

export async function open(dirName, { query = '', width = 1280, height = 720, device = null, ctxOpts = {} } = {}) {
  const port = Number(process.env.RG_PORT ?? 4363);
  const out = `test-results/qa4c/${dirName}`;
  mkdirSync(out, { recursive: true });
  const server = await preview({ preview: { port, strictPort: true, open: false }, logLevel: 'warn' });
  const browser = await chromium.launch({
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio', '--autoplay-policy=no-user-gesture-required'],
  });
  const opts = device ? { ...devices[device], ...ctxOpts } : { viewport: { width, height }, deviceScaleFactor: 1, ...ctxOpts };
  const context = await browser.newContext(opts);
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`http://localhost:${port}/?test=1${query}`);
  await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 240000 });
  await page.waitForSelector('#boot', { state: 'detached', timeout: 30000 }).catch(() => {});
  const shot = async (name, opts2 = {}) => {
    const buf = await page.screenshot({ type: 'png', animations: 'disabled', caret: 'hide', scale: 'css', timeout: 150000 });
    writeFileSync(`${out}/${name}.png`, buf);
    if (opts2.channels) {
      const png = PNG.sync.read(buf);
      writeFileSync(`${out}/${name}.R.png`, splitChannel(png, 0));
      writeFileSync(`${out}/${name}.G.png`, splitChannel(png, 1));
    }
    return `${out}/${name}.png`;
  };
  const close = async () => {
    if (errors.length) console.log('ERRORS:', JSON.stringify(errors.slice(0, 20)));
    await browser.close();
    await new Promise((r) => server.httpServer.close(r));
  };
  const step = (n, render = true) => page.evaluate(([n, r]) => window.__rg.step(1 / 60, n, r), [n, render]);
  /** Bubble + Pip state snapshot. */
  const pip = () =>
    page.evaluate(() => {
      const b = document.querySelector('[data-testid="pip-bubble"]');
      const on = !!b && b.classList.contains('on');
      const r = b?.getBoundingClientRect();
      const B = window.__rgBuddy;
      return {
        on,
        cls: b?.className ?? '',
        id: b?.dataset.id ?? '',
        text: b?.dataset.text ?? '',
        shown: b?.querySelector('.say span:not(.hide)')?.textContent ?? '',
        act: b?.dataset.action ?? '',
        actHtml: b?.querySelector('.act')?.innerHTML.slice(0, 120) ?? '',
        rect: r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null,
        opacity: b ? getComputedStyle(b).opacity : null,
        fontPx: b ? getComputedStyle(b.querySelector('.say') ?? b).fontSize : null,
        dir: B?.director(),
        lead: B?.lead(),
        pos: window.__rg.state().playerPosition.map((v) => +v.toFixed(1)),
      };
    });
  return { page, context, shot, close, errors, out, step, pip };
}

/** CDP touch helper: hold the joystick at (x,y) dragged by (dx,dy); returns release(). */
export async function touchSession(page) {
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: p[2] ?? i })) });
  return {
    async tap(x, y) {
      await touch('touchStart', [[x, y, 9]]);
      await touch('touchEnd', []);
    },
    async stickHold(x, y, dx, dy) {
      await touch('touchStart', [[x, y, 1]]);
      for (let k = 1; k <= 4; k++) await touch('touchMove', [[x + (dx * k) / 4, y + (dy * k) / 4, 1]]);
    },
    async stickMove(x, y) {
      await touch('touchMove', [[x, y, 1]]);
    },
    async release() {
      await touch('touchEnd', []);
    },
    cdp,
  };
}

/** CDP screencast: saves every composited frame as JPEG named by epoch ms. Returns stop(). */
export async function screencast(page, dir, { maxFrames = 3000, filter = null } = {}) {
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  let n = 0;
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    try {
      await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId });
    } catch {
      /* closed */
    }
    const ms = Math.round(f.metadata.timestamp * 1000);
    if (n >= maxFrames || (filter && !filter(ms))) return;
    n++;
    const name = `${dir}/f${ms}.jpg`;
    writeFileSync(name, Buffer.from(f.data, 'base64'));
    frames.push(ms);
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1 });
  return {
    frames,
    async stop() {
      await cdp.send('Page.stopScreencast').catch(() => {});
    },
  };
}
