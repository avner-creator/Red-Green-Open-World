// Probe: a child who follows Pip from spawn (jumps when Pip shows the jump button). Logs hero, Pip
// and lead state every 2.5 s and a screenshot every 10 s. Usage: RG_PORT=4377 node scripts/qa7/follow-probe.mjs [secs=150]
import { open } from './lib.mjs';

const secs = Number(process.argv[2] ?? 150);
const { page, shot, close } = await open('follow-probe', { query: '&quality=low&freeze=1&buddyIntro=1', width: 960, height: 540 });
try {
  await page.evaluate(() => {
    const rg = window.__rg;
    rg.freeze(true);
    rg.start();
    rg.step(1 / 30, 3, false);
  });
  for (let i = 0; i < secs * 2; i++) {
    const r = await page.evaluate(() => {
      const rg = window.__rg;
      const p = rg.ctx.player.position;
      const el = document.querySelector('[data-testid="pip-bubble"]');
      for (let n = 0; n < 15; n++) {
        const b = window.__rgBuddy.pos();
        const dx = b[0] - p.x;
        const dz = b[2] - p.z;
        const d = Math.hypot(dx, dz);
        const y = rg.ctx.cameraRig.yaw;
        let mx = 0;
        let my = 0;
        if (d > 2.5) {
          mx = (-dx * Math.cos(y) + dz * Math.sin(y)) / d;
          my = (dx * Math.sin(y) + dz * Math.cos(y)) / d;
        }
        const jump = el?.classList.contains('on') && el.dataset.action === 'jump';
        rg.inject({ moveX: mx, moveY: my, jump: !!jump, jumpPressed: !!jump && n % 10 === 0 });
        rg.step(1 / 30, 1, false);
      }
      rg.inject(null);
      const f = (a) => a.map((v) => +v.toFixed(1));
      return { hero: f([p.x, p.y, p.z]), pip: f(window.__rgBuddy.pos()), mode: rg.ctx.player.mode, lead: window.__rgBuddy.lead(), line: window.__rgBuddy.line() };
    });
    if (i % 5 === 0) console.log((i / 2).toFixed(1), JSON.stringify({ ...r, lead: { ...r.lead, done: undefined } }));
    if (i % 20 === 19) {
      await page.evaluate(() => window.__rg.render());
      await shot(`t${String(i / 2).padStart(5, '0')}`);
    }
  }
} finally {
  await close();
}
