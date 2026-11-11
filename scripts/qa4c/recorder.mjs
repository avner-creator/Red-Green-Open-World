// In-page recorder for Pip's bubble: samples every animation frame and logs on/off, id changes,
// text restarts, position jumps, off-screen and overlaps with HUD / touch controls.
export async function startRecorder(page, { raf = true } = {}) {
  await page.evaluate((raf) => {
    const AV =
      '[data-testid="wallet"],[data-testid="combo"],[data-testid="missions"],[data-testid="compass"],[data-testid="skill-chip"],' +
      '[data-testid="prompt"],[data-testid="mode-strip"],[data-testid="stars"],[data-testid="timer"],[data-testid="help"],' +
      '[data-testid^="touch-"],[data-testid="pip-button"],[data-testid="funpass-chip"],[data-testid="funpass"]';
    const log = [];
    const ov = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    let prev = null;
    const t0 = performance.now();
    const tick = () => {
      const b = document.querySelector('[data-testid="pip-bubble"]');
      if (b) {
        const on = b.classList.contains('on');
        const r = b.getBoundingClientRect();
        const id = b.dataset.id || b.dataset.text;
        const shown = b.querySelector('.say span:not(.hide)')?.textContent?.length ?? 0;
        const t = raf ? Date.now() : Math.round((window.__qaClock ?? 0) * 1000);
        const cur = { t, on, id, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), shown, below: b.classList.contains('below'), edge: b.classList.contains('edge') };
        if (on) {
          const W = innerWidth;
          const H = innerHeight;
          if (r.left < 0 || r.top < 0 || r.right > W || r.bottom > H) log.push({ ...cur, ev: 'offscreen' });
          const hits = [];
          for (const el of document.querySelectorAll(AV)) {
            const q = el.getBoundingClientRect();
            if (q.width < 2 || q.height < 2) continue;
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) continue;
            if (el.dataset.testid === 'touch-hud' || el.dataset.testid === 'touch-stick-zone' || el.dataset.testid === 'touch-look-zone') continue;
            if (ov(r, q)) hits.push(el.dataset.testid);
          }
          if (hits.length) log.push({ ...cur, ev: 'overlap', hits: hits.join(',') });
        }
        if (prev) {
          if (prev.on !== on) log.push({ ...cur, ev: on ? 'show' : 'hide' });
          else if (on && prev.id !== id) log.push({ ...cur, ev: 'replace', from: prev.id });
          else if (on && prev.id === id && shown < prev.shown) log.push({ ...cur, ev: 'retype', from: prev.shown });
          if (on && prev.on && prev.id === id && Math.hypot(cur.x - prev.x, cur.y - prev.y) > 30) log.push({ ...cur, ev: 'jump', dx: cur.x - prev.x, dy: cur.y - prev.y });
        }
        prev = cur;
      }
      if (raf) requestAnimationFrame(tick);
    };
    window.__qaSample = tick;
    window.__qaGameT = () => window.__rgBuddy?.director().playT ?? 0;
    if (raf) requestAnimationFrame(tick);
    window.__qaBubbleLog = log;
  }, raf);
}

export const readRecorder = (page) => page.evaluate(() => window.__qaBubbleLog.splice(0));

/** Collapse the raw log: keep first of each consecutive overlap/offscreen run. */
export function summarize(log) {
  const out = [];
  let lastKey = '';
  for (const e of log) {
    const key = e.ev === 'overlap' || e.ev === 'offscreen' ? `${e.ev}|${e.id}|${e.hits ?? ''}` : '';
    if (key && key === lastKey) continue;
    lastKey = key;
    out.push(e);
  }
  return out;
}
