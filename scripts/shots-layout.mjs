// HUD and menu layout check with everything on (wallet, combo, mission cards, compass, skill chip,
// "?", timer, prompt, toasts, touch controls) at 640x360, 667x375 touch and 1920x1080. Saves
// screenshots to test-results/layout/ and prints every overlap between HUD elements and every
// element that sticks out of the viewport. Exit code 1 if any are found.
// Usage: npm run build && RG_PORT=4291 node scripts/shots-layout.mjs [640x360|667x375t|1920x1080 ...]
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const port = Number(process.env.RG_PORT ?? 4174);
const out = 'test-results/layout';
mkdirSync(out, { recursive: true });
const all = [
  { name: '640x360', width: 640, height: 360, touch: false },
  { name: '667x375t', width: 667, height: 375, touch: true },
  { name: '1920x1080', width: 1920, height: 1080, touch: false },
];
const want = process.argv.slice(2);
const sizes = want.length ? all.filter((s) => want.includes(s.name)) : all;

/** HUD pieces that must not overlap each other (selectors; missing ones are skipped). */
const HUD = {
  wallet: '[data-testid="wallet"]',
  combo: '[data-testid="combo"]',
  missions: '[data-testid="missions"]',
  compass: '[data-testid="compass"]',
  skill: '[data-testid="skill-chip"]',
  help: '[data-testid="help"]',
  timer: '[data-testid="timer"]',
  prompt: '[data-testid="prompt"]',
  toasts: '[data-testid="toast"]',
  modeStrip: '[data-testid="mode-strip"]',
  stars: '[data-testid="stars"]',
  tStick: '[data-testid="touch-stick"]',
  tJump: '[data-testid="touch-jump"]',
  tUse: '[data-testid="touch-use"]',
  tSprint: '[data-testid="touch-sprint"]',
  tFlop: '[data-testid="touch-flop"]',
  tPause: '[data-testid="touch-pause"]',
  tSkill: '[data-testid="touch-skill"]',
  tEmote: '[data-testid="touch-emote"]',
};

async function rects(page, map) {
  return page.evaluate((map) => {
    const r = {};
    for (const [k, sel] of Object.entries(map)) {
      for (const [i, el] of [...document.querySelectorAll(sel)].entries()) {
        const s = window.getComputedStyle(el);
        const b = el.getBoundingClientRect();
        if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05 || b.width < 2 || b.height < 2) continue;
        r[i ? `${k}${i}` : k] = { x: b.left, y: b.top, w: b.width, h: b.height };
      }
    }
    return r;
  }, map);
}

function problems(r, vw, vh, allow = []) {
  const out = [];
  const keys = Object.keys(r);
  for (const k of keys) {
    const a = r[k];
    if (a.x < -1 || a.y < -1 || a.x + a.w > vw + 1 || a.y + a.h > vh + 1) out.push(`${k} outside the view (${a.x | 0},${a.y | 0} ${a.w | 0}x${a.h | 0})`);
  }
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = r[keys[i]];
      const b = r[keys[j]];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      const pair = `${keys[i]}+${keys[j]}`;
      if (ox > 1 && oy > 1 && !allow.some((p) => pair.includes(p))) out.push(`${pair} overlap ${ox | 0}x${oy | 0}`);
    }
  }
  return out;
}

const server = await preview({ preview: { port, strictPort: true, open: false }, logLevel: 'warn' });
let browser;
let bad = 0;
try {
  browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
  for (const s of sizes) {
    const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: 1, hasTouch: s.touch, isMobile: s.touch });
    await page.goto(`http://localhost:${port}/?test=1&quality=low`);
    await page.waitForFunction(() => window.__rg?.ready === true, undefined, { timeout: 180000 });
    await page.waitForSelector('#boot', { state: 'detached', timeout: 10000 });
    await page.evaluate(() => window.__rg.freeze(true));
    const save = async (name) => {
      await page.waitForTimeout(900);
      writeFileSync(`${out}/${name}-${s.name}.png`, await page.screenshot({ type: 'png', timeout: 180000 }));
    };
    const report = (what, list) => {
      for (const p of list) console.log(`  [${s.name}] ${what}: ${p}`);
      bad += list.length;
    };
    await save('title');
    await page.evaluate(() => {
      const rg = window.__rg;
      rg.ctx.profile.earn(37, 'test');
      rg.start();
      rg.step(1 / 60, 5);
      if (rg.ctx.input.state.device !== 'touch' && window.matchMedia('(pointer: coarse)').matches) rg.ctx.input.state.device = 'touch';
      // Everything on: two quick gems (combo), a prompt, a toast, a stunt.
      const p = rg.ctx.player.position.clone();
      rg.ctx.events.emit('gem:collected', { id: 'g1', count: 1, total: 60, position: p, value: 1, combo: 1, gain: 1 });
      rg.ctx.events.emit('combo:changed', { multiplier: 3, streak: 3 });
      rg.ctx.events.emit('interact:focus', { target: { id: 'x', icon: 'chest', position: () => p.clone(), radius: 3, onUse: () => {} } });
      rg.ctx.events.emit('ticket:denied', { kind: 'balloon', price: 5, wallet: 0 });
      rg.ctx.events.emit('stunt', { kind: 'bigBounce', value: 22, stars: 3 });
      rg.step(1 / 60, 8);
    });
    // Measure before the slow screenshot: toasts leave after ~3 s of real time.
    await page.waitForTimeout(500);
    report('hud', problems(await rects(page, HUD), s.width, s.height));
    await save('hud');

    await page.evaluate(() => {
      window.__rg.ctx.session.pause();
      window.__rg.step(1 / 60, 2);
    });
    await save('pause');
    report('pause', problems(await rects(page, { panel: '[data-screen="pause"] .panel', tiles: '[data-screen="pause"] .tile' }), s.width, s.height, ['panel+', 'tiles']));
    await page.evaluate(() => {
      window.__rg.ctx.session.resume();
      window.__rg.setRemaining(0.05);
      window.__rg.step(1 / 60, 30);
    });
    await save('end');
    report('end', problems(await rects(page, { panel: '[data-screen="end"] .panel', btn: '[data-screen="end"] .b' }), s.width, s.height, ['panel+', 'btn']));
    await page.close();
  }
} finally {
  await browser?.close();
  await new Promise((r) => server.httpServer.close(r));
}
console.log(bad ? `${bad} layout problem(s)` : 'layout OK');
process.exit(bad ? 1 : 0);
