// QA3 part 1: start screen, hero select, help, gate, settings, calibration, first 60 s of play.
// Usage: npm run build && RG_PORT=4352 node scripts/qa3/ui.mjs
import { open } from './lib.mjs';

const { page, shot, close } = await open('ui', { query: '&quality=medium' });
const step = (n = 2, render = true) => page.evaluate(([n, r]) => window.__rg.step(1 / 60, n, r), [n, render]);
const log = (...a) => console.log(...a);
try {
  await page.evaluate(() => window.__rg.freeze(true));
  await step(2);
  await shot('01-title', { channels: true });
  log('title text:', (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 400));

  // Change hero
  const hero = page.getByTestId('title-hero');
  if (await hero.count()) {
    await hero.click();
    await step(4);
    await shot('02-hero-select', { channels: true });
    log('hero text:', (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 300));
    await page.keyboard.press('ArrowRight');
    await step(4);
    await shot('02b-hero-next');
    await page.keyboard.press('Escape');
    await step(2);
  } else log('no title-hero button');

  // Help card
  await page.keyboard.press('KeyH');
  await step(2);
  await shot('03-help-keyboard', { channels: true });
  const pad = page.locator('[data-screen="controls"] [data-testid="controls-gamepad"]');
  if (await pad.count()) {
    await pad.click();
    await shot('03b-help-gamepad');
  }
  await page.keyboard.press('Escape');
  await step(1);

  // Grown-up gate + settings + calibration
  await page.getByTestId('grownups').click();
  await step(1);
  await shot('04-gate', { channels: true });
  const q = await page.evaluate(() => {
    const m = /(\d+) × (\d+)/.exec(document.querySelector('[data-testid="gate-question"]').textContent);
    return Number(m[1]) * Number(m[2]);
  });
  await page.locator(`[data-testid="gate-answer"][data-value="${q}"]`).click();
  await step(1);
  await shot('05-settings-glasses', { channels: true });
  log('settings text:', (await page.locator('[data-testid="settings"]').innerText()).replace(/\s+/g, ' '));
  await page.getByTestId('tab-game').click();
  await shot('05b-settings-game', { channels: true });
  log('settings game text:', (await page.locator('[data-testid="settings"]').innerText()).replace(/\s+/g, ' '));
  await page.getByTestId('tab-glasses').click();
  await page.getByTestId('calibrate').click();
  await step(2);
  await shot('06-calibration', { channels: true });
  log('calibration text:', (await page.evaluate(() => document.querySelector('.rgv-cal')?.innerText ?? '')).replace(/\s+/g, ' '));
  await page.keyboard.press('Escape');
  await page.getByTestId('settings-done').click();
  await step(1);
  await shot('07-title-again');

  // Play: first 60 s
  await page.getByTestId('play').click();
  await step(3);
  await shot('10-play-t0', { channels: true });
  const hudText = async () => (await page.evaluate(() => document.querySelector('#ui, body').innerText)).replace(/\s+/g, ' ').slice(0, 400);
  log('t0 text:', await hudText());
  // Simulate a child pressing W for a while (no mouse), in 5 s chunks, screenshots each 10 s.
  for (let t = 5; t <= 60; t += 5) {
    await page.evaluate(() => window.__rg.inject({ moveY: 1 }));
    await step(300, t % 10 === 0);
    if (t % 10 === 0) {
      await shot(`11-play-t${t}`, { channels: t === 10 || t === 30 });
      const s = await page.evaluate(() => window.__rg.state());
      log(`t${t}`, s.playerPosition.map((v) => v.toFixed(1)).join(','), s.playerMode, 'text:', await hudText());
    }
  }
  await page.evaluate(() => window.__rg.inject(null));
  // Fun Pass
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Tab');
  await step(2);
  await shot('12-funpass', { channels: true });
  log('funpass text:', (await page.getByTestId('funpass').innerText()).replace(/\s+/g, ' '));
  await page.keyboard.press('Tab');
  await step(1);
  // HUD explain bubbles: click/hover each HUD item that has one
  const items = await page.evaluate(() =>
    [...document.querySelectorAll('[data-explain], [data-testid="wallet"], [data-testid="stars"], [data-testid="timer"], [data-testid="missions"]')].map((e) => e.getAttribute('data-testid') || e.getAttribute('data-explain')),
  );
  log('hud explain candidates', items);
  for (const id of ['wallet', 'stars', 'timer']) {
    const el = page.getByTestId(id);
    if (!(await el.count())) continue;
    await el.click({ force: true }).catch(() => {});
    await step(2);
    await shot(`13-explain-${id}`, { channels: id === 'wallet' });
  }
  // Pip info
  log('pip', await page.evaluate(() => document.querySelector('[class*="buddy"], [data-testid*="pip"], [data-testid*="buddy"]')?.innerText ?? 'none'));
  // Skip timer to end
  await page.evaluate(() => {
    window.__rg.setRemaining(0.05);
    window.__rg.step(1 / 60, 30, false);
  });
  await step(2);
  await shot('14-end', { channels: true });
  log('end text:', (await page.evaluate(() => document.body.innerText)).replace(/\s+/g, ' ').slice(0, 500));
} finally {
  await close();
}
