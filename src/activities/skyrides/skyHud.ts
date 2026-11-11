/**
 * Sky-ride HUD (DOM, both-eye): contest clock, the three racers' scores with a crown on the leader,
 * a 3-2-1 countdown, "+points" pops, action hints (Space / Q) and the podium. Wordless: pictograms
 * and numbers only. White/yellow on dark with thick black outlines, so it reads through either lens.
 */

export type HudIcon = 'plane' | 'clock' | 'hoop' | 'cloud' | 'target' | 'star' | 'gem' | 'crown' | 'wing' | 'bubbles' | 'loop' | 'drop' | 'home' | 'dragon' | 'treat';

const ICON: Record<HudIcon, string> = {
  plane:
    '<path d="M3 11.2h7.2l2.6-6.4h2.4l-1.2 6.4H20c1.4 0 2.4.4 2.4.8s-1 .8-2.4.8h-6l1.2 6.4h-2.4l-2.6-6.4H3c-.8 0-1.2-.4-1.2-.8s.4-.8 1.2-.8z"/><path d="M3.4 8.6h1.8l1.2 2.6H4.2zM3.4 15.4h1.8l1.2-2.6H4.2z"/>',
  clock: '<circle cx="12" cy="13" r="9"/><path class="w" d="M12 8v5l3.4 2.2"/><path d="M9 2.4h6v2.2H9z"/>',
  hoop: '<circle class="o" cx="12" cy="12" r="8"/><circle class="w" cx="12" cy="12" r="8"/>',
  cloud: '<path d="M6.5 18.5a4.2 4.2 0 0 1-.4-8.4 5.6 5.6 0 0 1 10.8-1.2 4.8 4.8 0 1 1 .9 9.6z"/><path class="l" d="M12 18.5v3.6"/>',
  target: '<circle cx="12" cy="12" r="9.5"/><circle class="k" cx="12" cy="12" r="6.4"/><circle cx="12" cy="12" r="3.4"/>',
  star: '<path d="M12 2.2l2.9 6.2 6.8.8-5 4.6 1.3 6.7L12 17.2l-6 3.3 1.3-6.7-5-4.6 6.8-.8z"/>',
  gem: '<path d="M6.6 3.5h10.8L22 9.2 12 21.5 2 9.2z"/><path class="l" d="M2 9.2h20M8.6 9.2 12 21.5l3.4-12.3M6.6 3.5l2 5.7 3.4-5.7 3.4 5.7 2-5.7"/>',
  crown: '<path d="M3 18.5 2 7.5l5.4 4.2L12 4.5l4.6 7.2L22 7.5l-1 11z"/><path class="k" d="M3.4 19.6h17.2v1.8H3.4z"/>',
  wing: '<path d="M2 12.5c3-5.8 9-8.5 20-8-2.2 2-3 3.4-3.4 5.2 1.4.3 2.3.8 2.6 1.6-1.8.4-3 1.2-3.6 2.4 1 .4 1.6 1 1.8 1.8-5 .6-10 0-17.4-3z"/>',
  bubbles: '<circle cx="8" cy="14" r="5.2"/><circle cx="17" cy="8.6" r="3.6"/><circle cx="18.2" cy="17.6" r="2.4"/><path class="w" d="M5.6 12.2a3 3 0 0 1 2-1.8M15.4 7.4a2 2 0 0 1 1.2-1"/>',
  loop: '<path class="o" d="M4 18c6 0 9-3 9-7a4 4 0 1 0-8 0c0 4 3 7 15 7"/><path class="w" d="M4 18c6 0 9-3 9-7a4 4 0 1 0-8 0c0 4 3 7 15 7"/><path d="M18.6 14.6 22.4 18l-3.8 3.4z"/>',
  drop: '<path d="M12 2.5c3.6 4.6 6.4 8.4 6.4 11.6a6.4 6.4 0 0 1-12.8 0c0-3.2 2.8-7 6.4-11.6z"/><path class="w" d="M9.4 14.4a2.8 2.8 0 0 0 1.8 2.6"/>',
  home: '<path d="M2.5 11.5 12 3l9.5 8.5h-2.6v9h-5v-6h-3.8v6h-5v-9z"/>',
  dragon:
    '<path d="M5 15.5c0-3.6 2.6-6 6-6h1.4c.4-2.4 2-4 4.6-4.2l.6-2 1.4 2.2c1.6.6 2.6 2 2.6 3.8 0 1.6-1.2 2.6-2.8 2.6h-1c.6 1 1 2.2 1 3.6 0 2.6-2 4.5-5 4.5H9c-2.4 0-4-1.8-4-4.5z"/><path d="M5.4 15C3 14.8 1.6 13.2 1.6 11c1.4.8 2.6 1.2 4.2 1.2zM8 9.8 5.6 4.6l5 3.4z"/><circle class="k" cx="18.2" cy="8.4" r="1"/>',
  treat: '<circle cx="12" cy="12" r="9"/><circle class="k" cx="9" cy="9.5" r="1.3"/><circle class="k" cx="14.6" cy="8.6" r="1.1"/><circle class="k" cx="15" cy="14.4" r="1.4"/><circle class="k" cx="9.4" cy="15" r="1.1"/>',
};

const CSS = `
.rg-sky .sk-nogem{position:relative;display:inline-grid;place-items:center}
.rg-sky .sk-nogem::after{content:"";position:absolute;left:-14%;right:-14%;top:44%;height:calc(var(--u)*.9);background:#000;border:calc(var(--u)*.25) solid #fff;transform:rotate(-38deg);border-radius:calc(var(--u)*.5)}
.rg-sky .sk-practice{position:absolute;left:50%;top:calc(var(--u)*24);transform:translateX(-50%);display:none;align-items:center;gap:calc(var(--u)*.8);
  background:#10142a;border:calc(var(--u)*.4) dashed #fff;border-radius:calc(var(--u)*2.4);padding:calc(var(--u)*.5) calc(var(--u)*1.4);font-size:calc(var(--u)*3)}
.rg-sky .sk-practice.on{display:flex}
.rg-sky .sk-practice .ic{color:#9ff3ff}
.rg-sky{position:absolute;inset:0;pointer-events:none;z-index:3;--u:clamp(5px,1vmin,22px);
  font:900 calc(var(--u)*3.4)/1 ui-rounded,"Nunito","Trebuchet MS","Segoe UI",system-ui,sans-serif;color:#fff}
.rg-sky .ic{display:inline-block;width:1em;height:1em;vertical-align:middle;flex:none}
.rg-sky .ic svg{width:100%;height:100%;overflow:visible;fill:currentColor;stroke:#000;stroke-width:1.9;stroke-linejoin:round;stroke-linecap:round;paint-order:stroke fill}
.rg-sky .ic .k{fill:#000;stroke:none}
.rg-sky .ic .l{fill:none;stroke:#000;stroke-width:1.3}
.rg-sky .ic .o{fill:none;stroke:#000;stroke-width:5.4}
.rg-sky .ic .w{fill:none;stroke:currentColor;stroke-width:2.6;paint-order:normal}
.rg-sky .t{-webkit-text-stroke:calc(var(--u)*.7) #000;paint-order:stroke fill;text-shadow:0 calc(var(--u)*.35) 0 #000}
.rg-sky .sk-top{position:absolute;top:calc(var(--u)*13.5);left:50%;transform:translateX(-50%);display:none;flex-direction:column;align-items:center;gap:calc(var(--u)*1)}
.rg-sky.on .sk-top{display:flex}
.rg-sky .sk-pill{display:flex;align-items:center;gap:calc(var(--u)*1);background:#10142a;border:calc(var(--u)*.55) solid #fff;border-radius:calc(var(--u)*3);
  padding:calc(var(--u)*.7) calc(var(--u)*1.8);box-shadow:0 calc(var(--u)*.7) 0 #000}
.rg-sky .sk-pill .ic{color:#ffd93b;font-size:1.15em}
.rg-sky .sk-pill.sk-low{animation:rg-sky-pulse .5s ease-in-out infinite alternate}
.rg-sky .sk-racers{display:flex;gap:calc(var(--u)*1)}
.rg-sky .sk-racer{position:relative;display:flex;align-items:center;gap:calc(var(--u)*.6);background:#10142a;border:calc(var(--u)*.45) solid #000;
  border-radius:calc(var(--u)*2.2);padding:calc(var(--u)*.4) calc(var(--u)*1.2);font-size:.82em;box-shadow:0 0 0 calc(var(--u)*.3) #8a90b0}
.rg-sky .sk-racer.sk-you{box-shadow:0 0 0 calc(var(--u)*.45) #fff;font-size:1em}
.rg-sky .sk-racer .ic{font-size:1.25em}
.rg-sky .sk-racer .sk-crown{position:absolute;left:50%;top:calc(var(--u)*-2.6);transform:translateX(-50%);font-size:calc(var(--u)*2.8);color:#ffd93b;display:none}
.rg-sky .sk-racer.sk-lead .sk-crown{display:block}
.rg-sky .sk-count{position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);font-size:calc(var(--u)*22);display:none}
.rg-sky .sk-count.on{display:block;animation:rg-sky-pop .9s ease-out both}
.rg-sky .sk-count .ic{font-size:.8em;color:#ffd93b}
.rg-sky .sk-pops{position:absolute;left:50%;top:38%;width:0;height:0}
.rg-sky .sk-pop{position:absolute;transform:translate(-50%,-50%);display:flex;align-items:center;gap:calc(var(--u)*.6);font-size:calc(var(--u)*7);animation:rg-sky-rise 1.1s ease-out forwards;white-space:nowrap}
.rg-sky .sk-pop .ic{color:#ffd93b}
.rg-sky .sk-hints{position:absolute;bottom:calc(var(--u)*2.4);left:50%;transform:translateX(-50%);display:none;gap:calc(var(--u)*3)}
.rg-sky.on .sk-hints{display:flex}
.rg-sky .sk-hint{display:flex;align-items:center;gap:calc(var(--u)*.8);opacity:.95}
.rg-sky .sk-hint .ic{font-size:calc(var(--u)*6);color:#fff;filter:drop-shadow(0 calc(var(--u)*.5) 0 #000)}
.rg-sky .sk-hint.sk-cool{opacity:.45}
.rg-sky .sk-cap{min-width:calc(var(--u)*6);height:calc(var(--u)*5.4);padding:0 calc(var(--u)*1.2);border-radius:calc(var(--u)*1.3);display:grid;place-items:center;
  background:linear-gradient(180deg,#ffe97a,#ffd93b 55%,#f2b400);border:calc(var(--u)*.5) solid #000;box-shadow:0 0 0 calc(var(--u)*.35) #fff,0 calc(var(--u)*.8) 0 calc(var(--u)*.35) #000;
  color:#15110a;font-size:calc(var(--u)*3)}
.rg-sky .sk-cap.pad{border-radius:50%;min-width:calc(var(--u)*5.4);padding:0}
.rg-sky .sk-cap .sk-bar{width:calc(var(--u)*9);height:calc(var(--u)*1.2);border:calc(var(--u)*.4) solid #15110a;border-top:none;border-radius:0 0 calc(var(--u)*.5) calc(var(--u)*.5);margin-top:calc(var(--u)*1)}
.rg-sky .sk-podium{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(.6);opacity:0;display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*1.6);
  background:radial-gradient(ellipse at center,rgba(16,20,42,.95),rgba(16,20,42,.85));border:calc(var(--u)*.7) solid #fff;border-radius:calc(var(--u)*4);
  padding:calc(var(--u)*2.4) calc(var(--u)*4);box-shadow:0 calc(var(--u)*1.2) 0 #000;transition:transform .35s cubic-bezier(.3,1.6,.5,1),opacity .2s}
.rg-sky .sk-podium.on{transform:translate(-50%,-50%) scale(1);opacity:1}
.rg-sky .sk-steps{display:flex;align-items:flex-end;gap:calc(var(--u)*1.2)}
.rg-sky .sk-step{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*.6)}
.rg-sky .sk-step .ic{font-size:calc(var(--u)*6)}
.rg-sky .sk-step .sk-blk{width:calc(var(--u)*11);display:grid;place-items:center;background:#ffd93b;color:#15110a;border:calc(var(--u)*.55) solid #000;border-radius:calc(var(--u)*1) calc(var(--u)*1) 0 0;font-size:calc(var(--u)*5)}
.rg-sky .sk-step.sk-p1 .sk-blk{height:calc(var(--u)*12)}
.rg-sky .sk-step.sk-p2 .sk-blk{height:calc(var(--u)*8.5);background:#e9ecf5}
.rg-sky .sk-step.sk-p3 .sk-blk{height:calc(var(--u)*6);background:#c9cde0}
.rg-sky .sk-step.sk-you .ic{animation:rg-sky-bounce .6s ease-in-out infinite alternate}
.rg-sky .sk-step .sk-sc{font-size:calc(var(--u)*3.2)}
.rg-sky .sk-stars{display:flex;gap:calc(var(--u)*.8);font-size:calc(var(--u)*6)}
.rg-sky .sk-stars .ic{color:#3a3f5c}
.rg-sky .sk-stars .ic.sk-got{color:#ffd93b}
.rg-sky .sk-prize{display:flex;align-items:center;gap:calc(var(--u)*1);font-size:calc(var(--u)*5)}
.rg-sky .sk-prize .ic{color:#9ff3ff}
.rg-sky .sk-again{display:flex;align-items:center;gap:calc(var(--u)*1);font-size:calc(var(--u)*3);opacity:.9}
.rg-sky .sk-tour{position:absolute;top:calc(var(--u)*13.5);left:50%;transform:translateX(-50%);display:none;gap:calc(var(--u)*1.2)}
.rg-sky.tour-on .sk-tour{display:flex}
.rg-sky.tour-on .sk-hints{display:flex}
@keyframes rg-sky-pop{0%{transform:translate(-50%,-50%) scale(.3);opacity:0}30%{transform:translate(-50%,-50%) scale(1.15);opacity:1}100%{transform:translate(-50%,-50%) scale(1);opacity:1}}
.rg-sky .sk-stars .ic.sk-got{animation:rg-sky-star .5s ease-out both}
@keyframes rg-sky-star{0%{transform:scale(.2)}60%{transform:scale(1.3)}100%{transform:scale(1)}}
@keyframes rg-sky-rise{0%{transform:translate(-50%,-50%) scale(.6);opacity:0}20%{transform:translate(-50%,-80%) scale(1.15);opacity:1}100%{transform:translate(-50%,-260%) scale(1);opacity:0}}
@keyframes rg-sky-pulse{to{transform:scale(1.1)}}
@keyframes rg-sky-bounce{to{transform:translateY(calc(var(--u)*-1))}}
`;

export function iconHtml(name: HudIcon, color?: string): string {
  const style = color ? ` style="color:${color}"` : '';
  return `<span class="ic"${style}><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg></span>`;
}

export interface RacerView {
  id: string;
  color: string;
  score: number;
  /** Racer pictogram (default plane). */
  icon?: HudIcon;
}

export interface SkyHud {
  /** Contest mode (clock + racers + hints). */
  showContest(on: boolean): void;
  /** Dragon tour mode (treasure counter + hints). */
  showTour(on: boolean): void;
  setClock(seconds: number): void;
  setRacers(r: readonly RacerView[]): void;
  setTour(treasure: number, clouds: number): void;
  setHints(h: readonly { icon: HudIcon; key: 'space' | 'skill'; cool?: boolean }[], gamepad: boolean, touch: boolean): void;
  countdown(n: number | 'go'): void;
  pop(icon: HudIcon, text: string): void;
  /** Result: places, stars and the gems the round added to the wallet; `practice` = no gems (crossed-out gem). */
  podium(r: { places: readonly RacerView[]; you: number; stars: number; prize: number; practice?: boolean }): void;
  /** Update the gem total on the open podium (a stamp or mission bonus landed). */
  setPrize(gems: number): void;
  /** A crossed-out gem chip under the clock: this ride is practice (no gems). */
  practice(on: boolean): void;
  hidePodium(): void;
  readonly root: HTMLElement;
  dispose(): void;
}

export function createSkyHud(root: HTMLElement): SkyHud {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  const el = document.createElement('div');
  el.className = 'rg-sky';
  el.setAttribute('data-testid', 'sky-hud');
  el.innerHTML =
    '<div class="sk-top"><div class="sk-pill sk-clock t">' + iconHtml('clock') + '<span class="sk-sec">90</span></div><div class="sk-racers"></div></div>' +
    '<div class="sk-tour"><div class="sk-pill t">' + iconHtml('gem') + '<span class="sk-tr">0</span></div><div class="sk-pill t">' + iconHtml('cloud') + '<span class="sk-cl">0</span></div></div>' +
    '<div class="sk-count t"></div><div class="sk-pops"></div><div class="sk-hints"></div>' +
    '<div class="sk-podium" data-testid="sky-podium"><div class="sk-steps"></div><div class="sk-stars"></div><div class="sk-prize t"></div></div>';
  root.appendChild(el);
  const practiceChip = document.createElement('div');
  practiceChip.className = 'sk-practice t';
  practiceChip.setAttribute('data-testid', 'sky-practice-chip');
  practiceChip.innerHTML = `<span class="sk-nogem">${iconHtml('gem')}</span><span>0</span>`;
  el.appendChild(practiceChip);
  const q = <T extends HTMLElement>(s: string): T => el.querySelector(s) as T;
  const sec = q('.sk-sec');
  const clock = q('.sk-clock');
  const racers = q('.sk-racers');
  const count = q('.sk-count');
  const pops = q('.sk-pops');
  const hints = q('.sk-hints');
  const podiumEl = q('.sk-podium');
  const steps = q('.sk-steps');
  const stars = q('.sk-stars');
  const prize = q('.sk-prize');
  const tr = q('.sk-tr');
  const cl = q('.sk-cl');
  let lastSec = -1;
  let lastRacers = '';
  let lastHints = '';
  let lastTour = '';
  let popN = 0;

  return {
    root: el,
    showContest(on) {
      el.classList.toggle('on', on);
      if (!on) {
        lastRacers = '';
        lastHints = '';
      }
    },
    showTour(on) {
      el.classList.toggle('tour-on', on);
      if (!on) lastHints = '';
    },
    setClock(seconds) {
      const s = Math.max(0, Math.ceil(seconds));
      if (s === lastSec) return;
      lastSec = s;
      sec.textContent = String(s);
      clock.classList.toggle('sk-low', s <= 10);
    },
    setRacers(r) {
      const key = r.map((x) => `${x.id}:${x.score}`).join('|');
      if (key === lastRacers) return;
      lastRacers = key;
      const best = Math.max(...r.map((x) => x.score));
      racers.innerHTML = r
        .map(
          (x) =>
            `<div class="sk-racer t${x.id === 'you' ? ' sk-you' : ''}${x.score === best && best > 0 ? ' sk-lead' : ''}" data-racer="${x.id}">` +
            `<span class="sk-crown">${iconHtml('crown')}</span>${iconHtml(x.icon ?? 'plane', x.color)}<span>${x.score}</span></div>`,
        )
        .join('');
    },
    setTour(treasure, clouds) {
      const key = `${treasure}|${clouds}`;
      if (key === lastTour) return;
      lastTour = key;
      tr.textContent = String(treasure);
      cl.textContent = String(clouds);
    },
    setHints(h, gamepad, touch) {
      const key = h.map((x) => `${x.icon}${x.key}${x.cool ? 1 : 0}`).join() + (gamepad ? 'g' : touch ? 't' : 'k');
      if (key === lastHints) return;
      lastHints = key;
      hints.innerHTML = h
        .map((x) => {
          let cap = '';
          if (!touch) {
            if (x.key === 'space') cap = gamepad ? '<span class="sk-cap sk-pad">A</span>' : '<span class="sk-cap"><span class="sk-bar"></span></span>';
            else cap = gamepad ? '<span class="sk-cap">LB</span>' : '<span class="sk-cap">Q</span>';
          }
          return `<div class="sk-hint${x.cool ? ' sk-cool' : ''}">${iconHtml(x.icon)}${cap}</div>`;
        })
        .join('');
    },
    countdown(n) {
      count.innerHTML = n === 'go' ? iconHtml('plane') : String(n);
      count.classList.remove('on');
      void count.offsetWidth; // restart the animation
      count.classList.add('on');
      if (n === 'go') setTimeout(() => count.classList.remove('on'), 900);
    },
    pop(icon, text) {
      const p = document.createElement('div');
      p.className = 'sk-pop t';
      p.innerHTML = `${iconHtml(icon)}<span>${text}</span>`;
      popN++;
      p.style.left = `${((popN % 5) - 2) * 9}vmin`;
      p.style.top = `${(popN % 2) * 6}vmin`;
      pops.appendChild(p);
      while (pops.childElementCount > 5) pops.firstElementChild?.remove();
      setTimeout(() => p.remove(), 1200);
    },
    podium(r) {
      const order = [2, 1, 3];
      steps.innerHTML = order
        .map((place) => {
          const x = r.places[place - 1];
          if (!x) return '';
          return `<div class="sk-step sk-p${place}${x.id === 'you' ? ' sk-you' : ''}" data-place="${place}" data-racer="${x.id}">${iconHtml(x.icon ?? 'plane', x.color)}<span class="sk-sc t">${x.score}</span><div class="sk-blk">${place}</div></div>`;
        })
        .join('');
      stars.innerHTML = [0, 1, 2]
        .map((i) => `<span class="ic${i < r.stars ? ' sk-got' : ''}" style="animation-delay:${0.3 + i * 0.25}s"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON.star}</svg></span>`)
        .join('');
      prize.innerHTML = r.practice
        ? `<span class="sk-nogem" data-testid="sky-practice">${iconHtml('gem')}</span><span>0</span>`
        : `${iconHtml('gem')}<span data-testid="sky-prize">+${r.prize}</span>`;
      prize.style.display = r.practice || r.prize > 0 ? '' : 'none';
      podiumEl.dataset.you = String(r.you);
      podiumEl.classList.add('on');
    },
    setPrize(gems) {
      const t = prize.querySelector('[data-testid="sky-prize"]');
      if (!t) return;
      t.textContent = `+${gems}`;
      prize.style.display = gems > 0 ? '' : 'none';
    },
    practice(on) {
      practiceChip.classList.toggle('on', on);
    },
    hidePodium() {
      podiumEl.classList.remove('on');
    },
    dispose() {
      el.remove();
      style.remove();
    },
  };
}
