/**
 * Race HUD (DOM, both-eye, wordless): big 3-2-1 countdown with a chequered GO flag, lap counter
 * and place badge, a boost-chain meter, an arrow back to the track when lost, and the result card
 * (medal with the place, stars, gem prize, replay / exit). Bright shapes with black outlines on
 * dark panels: readable in R-only and G-only; nothing here hints where a weak-eye object is.
 */
import { iconSvg } from '../../ui/icons';

const inner = (n: Parameters<typeof iconSvg>[0]): string => iconSvg(n).replace(/^<svg[^>]*>|<\/svg>$/g, '');

const FLAG =
  '<path d="M3 2.5h2v19H3z"/><path d="M5 3h16v11H5z"/><path class="k" d="M5 3h4v3.7H5zM13 3h4v3.7h-4zM9 6.7h4v3.6H9zM17 6.7h4v3.6h-4zM5 10.3h4V14H5zM13 10.3h4V14h-4z"/>';

const CSS = `
.rg-race{position:absolute;inset:0;pointer-events:none;font:900 4vmin/1 ui-rounded,"Nunito","Trebuchet MS",system-ui,sans-serif;color:#fff;display:none}
.rg-race.on{display:block}
.rg-race svg{fill:currentColor;stroke:#000;stroke-width:1.3;stroke-linejoin:round;paint-order:stroke fill;overflow:visible}
.rg-race svg .k{fill:#10142a;stroke:none}
.rg-race svg .l{fill:none;stroke:#000;stroke-width:1.1}
.rg-race svg .o{fill:none;stroke:#000;stroke-width:3.4;stroke-linecap:round;stroke-linejoin:round}
.rg-race svg .w{fill:none;stroke:#fff;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.rg-race.done .bar{display:none}
.rg-race .bar{position:absolute;left:50%;top:13vmin;transform:translateX(-50%);display:flex;gap:1.6vmin;align-items:center}
.rg-race .chip{display:flex;align-items:center;gap:1vmin;padding:1vmin 2vmin 1vmin 1.2vmin;border-radius:4vmin;background:#10142a;border:.55vmin solid #fff;box-shadow:0 .7vmin 0 #000;font-size:4.6vmin}
.rg-race .chip svg{width:5vmin;height:5vmin;color:#fff}
.rg-race .place{width:9vmin;height:9vmin;border-radius:50%;display:grid;place-items:center;background:#fff;color:#10142a;border:.6vmin solid #000;box-shadow:0 .7vmin 0 #000;font-size:6vmin}
.rg-race .place.p1{background:#ffd93b}
.rg-race .chain{display:flex;gap:.8vmin;padding:1.2vmin 1.6vmin;border-radius:4vmin;background:#10142a;border:.55vmin solid #fff;box-shadow:0 .7vmin 0 #000}
.rg-race .chain i{width:3vmin;height:3vmin;border-radius:50%;border:.45vmin solid #fff;background:transparent}
.rg-race .chain i.f{background:#fff}
.rg-race .chain.surge{animation:rg-race-pop .5s}
.rg-race .count{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);width:26vmin;height:26vmin;border-radius:50%;background:#10142a;border:1.2vmin solid #fff;box-shadow:0 1.4vmin 0 #000;display:none;place-items:center;font-size:17vmin}
.rg-race .count.on{display:grid;animation:rg-race-pop .3s}
.rg-race .count svg{width:70%;height:70%;color:#fff}
.rg-race .lost{position:absolute;left:50%;top:26vmin;width:12vmin;height:12vmin;margin-left:-6vmin;display:none}
.rg-race .lost.on{display:block}
.rg-race .lost svg{width:100%;height:100%;color:#fff}
.rg-race .result{position:absolute;right:4vmin;top:56%;transform:translateY(-50%);display:none;flex-direction:column;align-items:center;gap:2vmin;padding:3vmin 5vmin;border-radius:4vmin;background:#10142a;border:.8vmin solid #fff;box-shadow:0 1.2vmin 0 #000;pointer-events:auto}
.rg-race .result.on{display:flex;animation:rg-race-pop .4s}
.rg-race .medal{width:17vmin;height:17vmin;border-radius:50%;display:grid;place-items:center;font-size:11vmin;color:#10142a;background:#fff;border:1vmin solid #000;box-shadow:0 0 0 .7vmin #fff}
.rg-race .medal.p1{background:#ffd93b}
.rg-race .stars{display:flex;gap:1vmin}
.rg-race .stars svg{width:7vmin;height:7vmin;color:#ffd93b}
.rg-race .stars svg.e{color:#10142a;stroke:#fff}
.rg-race .prize{display:flex;align-items:center;gap:1vmin;font-size:6vmin}
.rg-race .prize svg{width:6.4vmin;height:6.4vmin;color:#7ff0ff}
.rg-race .btns{display:flex;gap:2.4vmin}
.rg-race .btn{all:unset;cursor:pointer;width:13vmin;height:11vmin;border-radius:2.6vmin;background:#2b3557;border:.55vmin solid #000;box-shadow:0 0 0 .5vmin #fff,0 .9vmin 0 .5vmin #000;display:grid;place-items:center;position:relative}
.rg-race .btn svg{width:7.4vmin;height:7.4vmin;color:#fff}
.rg-race .btn .key{position:absolute;right:-1.2vmin;top:-1.2vmin;min-width:4.4vmin;height:4.4vmin;border-radius:1vmin;background:#ffd93b;color:#15110a;border:.45vmin solid #000;display:grid;place-items:center;font-size:3vmin}
.rg-race .reset{all:unset;pointer-events:auto;cursor:pointer;position:relative;width:max(44px,9vmin);height:max(44px,9vmin);border-radius:50%;background:#2b3557;border:.55vmin solid #000;box-shadow:0 0 0 .5vmin #fff,0 .7vmin 0 .5vmin #000;display:grid;place-items:center;touch-action:none}
.rg-race .reset svg{width:62%;height:62%;color:#fff}
.rg-race .reset .key{position:absolute;right:-1.2vmin;top:-1.2vmin;min-width:3.6vmin;height:3.6vmin;padding:0 .4vmin;border-radius:1vmin;background:#ffd93b;color:#15110a;border:.4vmin solid #000;display:grid;place-items:center;font-size:2.6vmin}
.rg-race .reset .key:empty{display:none}
.rg-race .reset.flash{animation:rg-race-spin .6s}
.rg-race .poof{position:absolute;left:50%;top:40%;width:22vmin;height:22vmin;margin:-11vmin 0 0 -11vmin;border-radius:50%;background:#10142a;border:1vmin solid #fff;box-shadow:0 1.2vmin 0 #000;display:none;place-items:center}
.rg-race .poof svg{width:70%;height:70%;color:#fff}
.rg-race .poof.on{display:grid;animation:rg-race-poof .9s forwards}
@keyframes rg-race-spin{0%{rotate:0deg;scale:1}50%{scale:1.25}100%{rotate:-360deg;scale:1}}
@keyframes rg-race-poof{0%{scale:.4;opacity:1}30%{scale:1.1;opacity:1}100%{scale:1.3;opacity:0}}
@keyframes rg-race-pop{0%{scale:.6}60%{scale:1.15}100%{scale:1}}
`;

export interface RaceHud {
  show(on: boolean): void;
  /** Hide the lap/place bar (podium). */
  bar(on: boolean): void;
  countdown(n: number | 'go' | null): void;
  status(lap: number, laps: number, place: number): void;
  chain(n: number, surge?: boolean): void;
  /** Direction to steer back to the track, radians relative to the camera (null = on track). */
  lost(angle: number | null): void;
  result(r: { place: number; stars: number; gems: number; practice: boolean } | null, gamepad: boolean): void;
  /** The buggy was popped back onto the track: spin the reset button, flash a big pictogram. */
  resetFlash(): void;
  /** Key cap on the reset button (R / Y). */
  resetKey(key: string): void;
  onReplay: (() => void) | null;
  onExit: (() => void) | null;
  onReset: (() => void) | null;
  dispose(): void;
}

let styled = false;

export function createRaceHud(root: HTMLElement): RaceHud {
  if (!styled) {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    styled = true;
  }
  const el = document.createElement('div');
  el.className = 'rg-race';
  el.setAttribute('data-testid', 'race-hud');
  el.innerHTML = `
    <div class="bar"><div class="chip lap"><svg viewBox="0 0 24 24">${FLAG}</svg><span data-testid="race-lap">1/3</span></div>
      <div class="place" data-testid="race-place">1</div>
      <div class="chain"><i></i><i></i><i></i></div>
      <button class="reset" data-testid="race-reset" aria-label="reset"><svg viewBox="0 0 24 24">${inner('restart')}</svg><span class="key">R</span></button></div>
    <div class="poof" data-testid="race-poof"><svg viewBox="0 0 24 24">${inner('restart')}</svg></div>
    <div class="count" data-testid="race-count"></div>
    <div class="lost"><svg viewBox="0 0 24 24"><path d="M12 1.5l8.5 11h-5v10h-7v-10h-5z"/></svg></div>
    <div class="result" data-testid="race-result">
      <div class="medal" data-testid="race-medal">1</div>
      <div class="stars"></div>
      <div class="prize"><svg viewBox="0 0 24 24">${inner('gem')}</svg><span>+0</span></div>
      <div class="btns"><button class="btn replay" data-testid="race-replay"><svg viewBox="0 0 24 24">${inner('restart')}</svg><span class="key">E</span></button>
      <button class="btn exit" data-testid="race-exit"><svg viewBox="0 0 24 24">${inner('exit')}</svg><span class="key">R</span></button></div>
    </div>`;
  root.appendChild(el);
  const $ = <T extends HTMLElement>(s: string): T => el.querySelector(s) as T;
  const lap = $<HTMLSpanElement>('[data-testid="race-lap"]');
  const place = $<HTMLDivElement>('.place');
  const chainEl = $<HTMLDivElement>('.chain');
  const count = $<HTMLDivElement>('.count');
  const lost = $<HTMLDivElement>('.lost');
  const result = $<HTMLDivElement>('.result');
  const medal = $<HTMLDivElement>('.medal');
  const stars = $<HTMLDivElement>('.stars');
  const prize = $<HTMLDivElement>('.prize');
  const keys = el.querySelectorAll<HTMLSpanElement>('.btn .key');
  const resetBtn = $<HTMLButtonElement>('.reset');
  const poof = $<HTMLDivElement>('.poof');
  let lastCount: string | null = null;
  let lastStatus = '';
  const api: RaceHud = {
    show(on) {
      el.classList.toggle('on', on);
      if (!on) {
        el.classList.remove('done');
        poof.classList.remove('on');
        result.classList.remove('on');
        count.classList.remove('on');
        lastCount = null;
      }
    },
    bar(on) {
      el.classList.toggle('done', !on);
    },
    countdown(n) {
      const key = n === null ? null : String(n);
      if (key === lastCount) return;
      lastCount = key;
      count.classList.remove('on');
      if (n === null) return;
      count.innerHTML = n === 'go' ? `<svg viewBox="0 0 24 24">${FLAG}</svg>` : String(n);
      void count.offsetWidth;
      count.classList.add('on');
    },
    status(l, laps, p) {
      const key = `${l}/${laps}/${p}`;
      if (key === lastStatus) return;
      lastStatus = key;
      lap.textContent = `${Math.min(l, laps)}/${laps}`;
      place.textContent = String(p);
      place.classList.toggle('p1', p === 1);
    },
    chain(n, surge) {
      chainEl.querySelectorAll('i').forEach((d, i) => d.classList.toggle('f', i < n));
      if (surge) {
        chainEl.classList.remove('surge');
        void chainEl.offsetWidth;
        chainEl.classList.add('surge');
      }
    },
    lost(angle) {
      lost.classList.toggle('on', angle !== null);
      if (angle !== null) lost.style.transform = `rotate(${angle}rad)`;
    },
    result(r, gamepad) {
      result.classList.toggle('on', !!r);
      el.classList.toggle('done', !!r);
      if (!r) return;
      medal.textContent = String(r.place);
      medal.classList.toggle('p1', r.place === 1);
      stars.innerHTML = [0, 1, 2].map((i) => `<svg viewBox="0 0 24 24" class="${i < r.stars ? '' : 'e'}">${inner('star')}</svg>`).join('');
      prize.style.display = r.practice ? 'none' : '';
      (prize.querySelector('span') as HTMLSpanElement).textContent = `+${r.gems}`;
      keys[0].textContent = gamepad ? 'A' : 'E';
      keys[1].textContent = gamepad ? 'Y' : 'R';
    },
    resetFlash() {
      for (const e of [resetBtn, poof]) {
        e.classList.remove(e === poof ? 'on' : 'flash');
        void e.offsetWidth;
        e.classList.add(e === poof ? 'on' : 'flash');
      }
    },
    resetKey(k) {
      (resetBtn.querySelector('.key') as HTMLSpanElement).textContent = k;
    },
    onReplay: null,
    onExit: null,
    onReset: null,
    dispose() {
      el.remove();
    },
  };
  $<HTMLButtonElement>('.replay').addEventListener('click', (e) => {
    e.stopPropagation();
    api.onReplay?.();
  });
  resetBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    api.onReset?.();
  });
  $<HTMLButtonElement>('.exit').addEventListener('click', (e) => {
    e.stopPropagation();
    api.onExit?.();
  });
  return api;
}
