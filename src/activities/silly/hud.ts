/**
 * "Boop them all!" HUD (DOM, both-eye): a tube-person counter and a clock while playing, a big
 * 3-2-1-GO, and a result card (stars + gems). Bright on dark with black outlines, icons first, so it
 * reads in R-only and G-only and needs no reading (numbers only).
 */

export interface BoopHud {
  show(on: boolean): void;
  set(booped: number, total: number, timeLeft: number): void;
  /** Big centre number (3, 2, 1), 'go' (a burst), or null to clear. */
  count(n: number | 'go' | null): void;
  /** Pop the counter (a bop landed). */
  pop(): void;
  result(r: { win: boolean; booped: number; total: number; stars: number; prize: number } | null): void;
  dispose(): void;
}

/** A little tube person (body, waving arms, face). */
const TUBE_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="b" d="M9 22V9.5a3 3 0 0 1 6 0V22z"/><path class="a" d="M9.2 12.5L4 8M14.8 12.5L20 7"/>' +
  '<circle class="e" cx="10.8" cy="9.6" r="1"/><circle class="e" cx="13.2" cy="9.6" r="1"/><path class="m" d="M10.6 12.2q1.4 1.3 2.8 0"/></svg>';
const CLOCK_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="b" cx="12" cy="13" r="8.5"/><path class="h" d="M12 8.5V13l3 2"/><path class="b" d="M9.5 2.5h5v2h-5z"/></svg>';
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.2l2.9 6.3 6.9.7-5.2 4.6 1.5 6.8L12 17.1l-6.1 3.5 1.5-6.8L2.2 9.2l6.9-.7z"/></svg>';
const GEM = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12l4 6-10 12L2 9z"/></svg>';

const CSS = `
.rg-boop{position:absolute;left:50%;top:15%;transform:translateX(-50%);display:none;gap:2vmin;pointer-events:none;
  filter:drop-shadow(0 .5vmin 0 #000);font:900 5.4vmin/1 ui-rounded,"Nunito","Trebuchet MS",system-ui,sans-serif;color:#fff}
.rg-boop.on{display:flex}
.rg-boop .chip{display:flex;align-items:center;gap:1.2vmin;background:#10142a;border:.6vmin solid #fff;border-radius:5vmin;padding:.8vmin 2.4vmin .8vmin 1.2vmin}
.rg-boop .chip svg{width:7vmin;height:7vmin;overflow:visible}
.rg-boop .chip .b{fill:#ffd93b;stroke:#000;stroke-width:1.3;stroke-linejoin:round}
.rg-boop .chip .a{fill:none;stroke:#ffd93b;stroke-width:2.2;stroke-linecap:round}
.rg-boop .chip .e{fill:#000}
.rg-boop .chip .m,.rg-boop .chip .h{fill:none;stroke:#000;stroke-width:1.4;stroke-linecap:round}
.rg-boop .chip.pop{animation:rg-boop-pop .35s ease-out}
.rg-boop .chip.low{background:#5a0f1e}
.rg-boop-count{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);pointer-events:none;display:none;
  font:900 26vmin/1 ui-rounded,"Nunito","Trebuchet MS",system-ui,sans-serif;color:#ffd93b;-webkit-text-stroke:1.4vmin #000;paint-order:stroke fill;
  filter:drop-shadow(0 1vmin 0 #000)}
.rg-boop-count.on{display:block;animation:rg-boop-in .5s ease-out}
.rg-boop-count svg{width:30vmin;height:30vmin;fill:#ffd93b;stroke:#000;stroke-width:1.2;stroke-linejoin:round;paint-order:stroke fill}
.rg-boop-res{position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);pointer-events:none;display:none;flex-direction:column;align-items:center;gap:2vmin;
  background:#10142a;border:.8vmin solid #fff;border-radius:4vmin;padding:3vmin 5vmin;filter:drop-shadow(0 1vmin 0 #000)}
.rg-boop-res.on{display:flex;animation:rg-boop-in .45s ease-out}
.rg-boop-res .stars{display:flex;gap:1.5vmin}
.rg-boop-res .stars svg{width:12vmin;height:12vmin;fill:#3a3f5c;stroke:#000;stroke-width:1.2;stroke-linejoin:round}
.rg-boop-res .stars svg.got{fill:#ffd93b;stroke:#fff}
.rg-boop-res .row{display:flex;align-items:center;gap:1.6vmin;font:900 6vmin/1 ui-rounded,"Nunito","Trebuchet MS",system-ui,sans-serif;color:#fff}
.rg-boop-res .row svg{width:7vmin;height:7vmin;fill:#9ff0ff;stroke:#000;stroke-width:1.3;stroke-linejoin:round}
.rg-boop-res .row .tube svg .b{fill:#ffd93b;stroke:#000;stroke-width:1.3}
.rg-boop-res .row .tube svg .a{fill:none;stroke:#ffd93b;stroke-width:2.2;stroke-linecap:round}
.rg-boop-res .row .tube svg .e{fill:#000}.rg-boop-res .row .tube svg .m{fill:none;stroke:#000;stroke-width:1.4}
@keyframes rg-boop-pop{0%{transform:scale(1)}40%{transform:scale(1.25)}100%{transform:scale(1)}}
@keyframes rg-boop-in{0%{transform:translate(-50%,-50%) scale(.4);opacity:0}70%{transform:translate(-50%,-50%) scale(1.12);opacity:1}100%{transform:translate(-50%,-50%) scale(1)}}
`;

export function createBoopHud(root: HTMLElement): BoopHud {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const bar = document.createElement('div');
  bar.className = 'rg-boop';
  bar.setAttribute('data-testid', 'silly-hud');
  bar.innerHTML = `<div class="chip tubes">${TUBE_SVG}<span class="n" data-testid="silly-count">0/0</span></div><div class="chip clock">${CLOCK_SVG}<span class="t" data-testid="silly-time">45</span></div>`;
  const big = document.createElement('div');
  big.className = 'rg-boop-count';
  big.setAttribute('data-testid', 'silly-countdown');
  const res = document.createElement('div');
  res.className = 'rg-boop-res';
  res.setAttribute('data-testid', 'silly-result');
  root.append(bar, big, res);
  const tubes = bar.querySelector('.tubes') as HTMLElement;
  const clock = bar.querySelector('.clock') as HTMLElement;
  const n = bar.querySelector('.n') as HTMLElement;
  const t = bar.querySelector('.t') as HTMLElement;
  let lastN = '';
  let lastT = '';
  let lastCount: number | 'go' | null = null;

  return {
    show(on) {
      bar.classList.toggle('on', on);
    },
    set(booped, total, timeLeft) {
      const ns = `${booped}/${total}`;
      if (ns !== lastN) n.textContent = lastN = ns;
      const ts = String(Math.ceil(timeLeft));
      if (ts !== lastT) {
        t.textContent = lastT = ts;
        clock.classList.toggle('low', timeLeft <= 10);
      }
    },
    count(c) {
      if (c === lastCount) return;
      lastCount = c;
      big.classList.remove('on');
      if (c === null) return;
      big.innerHTML = c === 'go' ? STAR : String(c);
      // Restart the pop-in animation.
      void big.offsetWidth;
      big.classList.add('on');
    },
    pop() {
      tubes.classList.remove('pop');
      void tubes.offsetWidth;
      tubes.classList.add('pop');
    },
    result(r) {
      if (!r) {
        res.classList.remove('on');
        return;
      }
      const stars = [0, 1, 2].map((i) => STAR.replace('<svg ', `<svg class="${i < r.stars ? 'got' : ''}" `)).join('');
      res.innerHTML =
        `<div class="stars">${stars}</div>` +
        `<div class="row"><span class="tube">${TUBE_SVG}</span><span>${r.booped}/${r.total}</span></div>` +
        (r.prize > 0 ? `<div class="row">${GEM}<span>+${r.prize}</span></div>` : '');
      res.setAttribute('data-win', r.win ? '1' : '0');
      res.classList.add('on');
    },
    dispose() {
      bar.remove();
      big.remove();
      res.remove();
      style.remove();
    },
  };
}
