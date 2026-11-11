// QA4C sections 5 + 6: grown-up gate, settings (all four lens/eye choices), calibration, Auto
// challenge, Pip's voice, session summary; R-only / G-only shots of title, HUD, Fun Pass, help.
// Real clicks and keys. Usage: RG_PORT=4363 node scripts/qa4c/ui.mjs
import { open } from './lib.mjs';

const { page, shot, close, errors } = await open('ui', { query: '&quality=low&freeze=1', width: 1280, height: 720 });
const step = (n = 1) => page.evaluate((k) => window.__rg.step(1 / 60, k, true), n);
const text = async (sel) => (await page.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ');
try {
  await page.evaluate(() => window.__rg.freeze(true));
  await step(1);
  await shot('01-title', { channels: true });
  console.log('TITLE', await text('body'));
  // Grown-up gate
  await page.getByTestId('grownups').click();
  await step(1);
  await shot('02-gate', { channels: true });
  console.log('GATE', await text('body'));
  const q = await page.evaluate(() => {
    const m = /(\d+)\s*[×x+]\s*(\d+)/.exec(document.querySelector('[data-testid="gate-question"]').textContent);
    const plus = /\+/.test(document.querySelector('[data-testid="gate-question"]').textContent);
    return plus ? Number(m[1]) + Number(m[2]) : Number(m[1]) * Number(m[2]);
  });
  await page.locator(`[data-testid="gate-answer"][data-value="${q}"]`).click();
  await step(1);
  await shot('03-settings-glasses', { channels: true });
  console.log('SETTINGS-GLASSES', await text('[data-testid="settings"]'));
  // All four lens / eye choices: click each radio-ish button found by its text and read back eye settings.
  const btns = await page.locator('[data-testid="settings"] button, [data-testid="settings"] [role="radio"], [data-testid="settings"] label').allInnerTexts();
  console.log('SETTINGS BUTTONS', JSON.stringify(btns.map((b) => b.replace(/\s+/g, ' ')).filter(Boolean)));
  const eyeCombos = [];
  for (const lens of ['red', 'green']) {
    for (const eye of ['left', 'right']) {
      const ok = await page.evaluate(([lens, eye]) => {
        const root = document.querySelector('[data-testid="settings"]');
        const clickBy = (attrs) => {
          for (const a of attrs) {
            const el = root.querySelector(a);
            if (el) {
              el.click();
              return a;
            }
          }
          return null;
        };
        const a = clickBy([`[data-value="${lens}"]`, `[data-lens="${lens}"]`, `[data-testid="lens-${lens}"]`]);
        const b = clickBy([`[data-value="${eye}"]`, `[data-eye="${eye}"]`, `[data-testid="weak-${eye}"]`]);
        const s = window.__rg.ctx.settings.get().eye;
        return { a, b, s: { leftLens: s.leftLens, weakEye: s.weakEye } };
      }, [lens, eye]);
      await step(1);
      await shot(`04-eye-${lens}-${eye}`);
      eyeCombos.push({ want: [lens, eye], ...ok, vision: await page.evaluate(() => window.__rg.ctx.vision.channels()) });
    }
  }
  console.log('EYE COMBOS', JSON.stringify(eyeCombos));
  await page.getByTestId('calibrate').click();
  await step(2);
  await shot('05-calibration', { channels: true });
  console.log('CALIBRATION', (await page.evaluate(() => document.querySelector('.rgv-cal')?.innerText ?? document.body.innerText)).replace(/\s+/g, ' '));
  const sliders = await page.locator('input[type="range"]').count();
  console.log('calibration sliders', sliders);
  for (let i = 0; i < sliders; i++) {
    const s = page.locator('input[type="range"]').nth(i);
    await s.focus();
    for (let k = 0; k < 8; k++) await page.keyboard.press('ArrowLeft');
  }
  await step(1);
  await shot('05b-calibration-sliders-low', { channels: true });
  await page.keyboard.press('Escape');
  await step(1);
  await page.getByTestId('tab-game').click();
  await step(1);
  await shot('06-settings-game', { channels: true });
  console.log('SETTINGS-GAME', await text('[data-testid="settings"]'));
  const ac = page.getByTestId('auto-challenge');
  if (await ac.count()) {
    const before = await page.evaluate(() => JSON.stringify(window.__rg.ctx.settings.get()).match(/"auto\w*":\w+/g));
    await ac.click();
    await step(1);
    const after = await page.evaluate(() => JSON.stringify(window.__rg.ctx.settings.get()).match(/"auto\w*":\w+/g));
    console.log('AUTO CHALLENGE', before, '->', after);
    await shot('06b-auto-toggled');
  }
  if (await page.getByTestId('open-summary').count()) {
    await page.getByTestId('open-summary').click();
    await step(1);
    await shot('07-summary', { channels: true });
    console.log('SUMMARY', await text('[data-testid="glasses-summary"]'));
    await page.getByTestId('summary-back').click().catch(() => {});
  }
  await page.getByTestId('settings-done').click().catch(() => page.keyboard.press('Escape'));
  await step(1);
  // Start + HUD
  await page.getByTestId('play').click();
  await step(30);
  await shot('10-hud', { channels: true });
  await page.keyboard.press('KeyH');
  await step(2);
  await shot('11-help', { channels: true });
  console.log('HELP', await text('[data-testid="controls-card"]'));
  await page.keyboard.press('Escape');
  await step(2);
  await page.keyboard.press('Tab');
  await step(2);
  await shot('12-funpass', { channels: true });
  console.log('FUNPASS', await text('[data-testid="funpass"]'));
  await page.keyboard.press('Tab');
  await step(2);
  // Pause menu
  await page.keyboard.press('Escape');
  await step(2);
  await shot('13-pause', { channels: true });
  console.log('PAUSE', await text('body'));
  // Whole visible text after play, for wording audit
  const all = await page.evaluate(() => document.body.innerText);
  const bad = /therap|amblyop|lazy|patient|treat|medical|doctor|clinic|diagnos|exercise|healthy|cure|weak(er)? eye|strong(er)? eye/gi;
  console.log('WORDING HITS (visible UI)', JSON.stringify([...all.matchAll(bad)].map((m) => all.slice(Math.max(0, m.index - 30), m.index + 30))));
} finally {
  console.log('errors', errors.length, JSON.stringify(errors.slice(0, 5)));
  await close();
}
