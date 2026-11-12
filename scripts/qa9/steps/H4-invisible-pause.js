// Why is the pause screen 'on' but invisible (and the HUD gone)?
log(await page.evaluate(() => {
  const p = document.querySelector('[data-screen="pause"]');
  const cs = getComputedStyle(p);
  const r = p.getBoundingClientRect();
  const ui = p.parentElement;
  const ucs = getComputedStyle(ui);
  const chain = [];
  for (let e = p; e; e = e.parentElement) { const c = getComputedStyle(e); chain.push(`${e.tagName}.${String(e.className).slice(0, 30)} d=${c.display} v=${c.visibility} o=${c.opacity}`); }
  return { cls: p.className, display: cs.display, vis: cs.visibility, op: cs.opacity, rect: [r.left, r.top, r.width, r.height], chain, styleTags: [...document.querySelectorAll('style')].filter((s) => s.textContent.includes('visibility: hidden !important')).length };
}));
