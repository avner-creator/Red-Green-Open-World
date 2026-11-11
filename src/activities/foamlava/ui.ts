/**
 * Foam Lava DOM overlay (both-eye, wordless): the race HUD (stopwatch, medal targets, a race
 * track with you and your friend), the 3-2-1-GO countdown, the price chip at the booth and the
 * result card (medal, stars, both times, gem prize, replay / leave). Bright-on-dark with black
 * outlines so every part reads in the R channel and the G channel alone.
 */
import { controlKeys } from '../../ui/controlGlyphs';
import { icon } from '../../ui/icons';
import type { InputState } from '../../types';
import { LAPS } from './layout';
import { MEDALS, formatTime } from './scoring';
import type { Medal } from './scoring';

const CSS = `
.rg-fl-hud{position:absolute;left:50%;top:calc(var(--u,8px)*13);transform:translateX(-50%);display:none;flex-direction:column;align-items:center;gap:calc(var(--u,8px)*1);pointer-events:none;z-index:6}
.rg-fl-hud.on{display:flex}
.rg-fl-row{display:flex;align-items:center;gap:calc(var(--u,8px)*1.2)}
.rg-fl-clock{display:flex;align-items:center;gap:calc(var(--u,8px)*.8);background:#10142a;border:calc(var(--u,8px)*.5) solid #fff;border-radius:calc(var(--u,8px)*3);
  padding:calc(var(--u,8px)*.5) calc(var(--u,8px)*1.6);font:900 calc(var(--u,8px)*4.6)/1 ui-rounded,"Nunito","Trebuchet MS",system-ui,sans-serif;color:#fff;
  box-shadow:0 calc(var(--u,8px)*.6) 0 #000;min-width:calc(var(--u,8px)*19);justify-content:center;font-variant-numeric:tabular-nums}
.rg .rg-fl-clock .ic{width:calc(var(--u,8px)*4.4);height:calc(var(--u,8px)*4.4);color:#ffd93b}
.rg-fl-medals{display:flex;gap:calc(var(--u,8px)*.6)}
.rg-fl-medal{display:flex;flex-direction:column;align-items:center;font:900 calc(var(--u,8px)*2.1)/1 ui-rounded,"Nunito",system-ui,sans-serif;color:#fff;
  text-shadow:0 0 calc(var(--u,8px)*.5) #000,0 0 calc(var(--u,8px)*.5) #000;transition:opacity .3s}
.rg-fl-medal i{display:block;width:calc(var(--u,8px)*3.6);height:calc(var(--u,8px)*3.6);border-radius:50%;border:calc(var(--u,8px)*.45) solid #000;margin-bottom:calc(var(--u,8px)*.3);
  font:900 calc(var(--u,8px)*2)/calc(var(--u,8px)*2.8) ui-rounded,system-ui,sans-serif;font-style:normal;text-align:center;text-shadow:none}
.rg-fl-medal.gold i{background:#ffd23f;color:#3a2800}.rg-fl-medal.silver i{background:#e6e9f0;color:#202329}.rg-fl-medal.bronze i{background:#a5612b;color:#fff}
.rg-fl-medal.gone{opacity:.28}
.rg-fl-track{position:relative;width:calc(var(--u,8px)*46);height:calc(var(--u,8px)*2.2);background:#10142a;border:calc(var(--u,8px)*.4) solid #fff;border-radius:calc(var(--u,8px)*2);box-shadow:0 calc(var(--u,8px)*.5) 0 #000}
.rg-fl-track .end{position:absolute;right:calc(var(--u,8px)*-1.4);top:50%;transform:translateY(-50%);width:calc(var(--u,8px)*3);height:calc(var(--u,8px)*3);
  background:repeating-conic-gradient(#000 0 25%,#fff 0 50%) 50%/calc(var(--u,8px)*1.5) calc(var(--u,8px)*1.5);border:calc(var(--u,8px)*.35) solid #fff;border-radius:calc(var(--u,8px)*.4)}
.rg-fl-dot{position:absolute;top:50%;width:calc(var(--u,8px)*3.4);height:calc(var(--u,8px)*3.4);margin-left:calc(var(--u,8px)*-1.7);margin-top:calc(var(--u,8px)*-1.7);border-radius:50%;
  border:calc(var(--u,8px)*.45) solid #000;transition:left .12s linear}
.rg-fl-dot.you{background:#ffd93b;z-index:2;box-shadow:0 0 0 calc(var(--u,8px)*.35) #fff}
.rg-fl-dot.friend{background:#f4f4f4}
.rg-fl-dot.friend::after{content:"";position:absolute;inset:22%;border-radius:50%;background:#10142a}
.rg-fl-count{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);pointer-events:none;display:none;z-index:7;
  font:900 calc(var(--u,8px)*22)/1 ui-rounded,"Nunito","Trebuchet MS",system-ui,sans-serif;color:#ffd93b;-webkit-text-stroke:calc(var(--u,8px)*1) #000;paint-order:stroke fill;
  text-shadow:0 calc(var(--u,8px)*1.2) 0 #000}
.rg-fl-count.on{display:flex;align-items:center;gap:calc(var(--u,8px)*2)}
.rg-fl-count.pop{animation:rg-fl-pop .5s cubic-bezier(.2,1.6,.4,1)}
.rg-fl-count .go{display:flex;align-items:center;gap:calc(var(--u,8px)*1.5);color:#fff}
.rg-fl-count svg{width:calc(var(--u,8px)*20);height:calc(var(--u,8px)*20);fill:#ffd93b;stroke:#000;stroke-width:1.6;stroke-linejoin:round;paint-order:stroke fill}
@keyframes rg-fl-pop{0%{transform:translate(-50%,-50%) scale(.3);opacity:0}60%{opacity:1}100%{transform:translate(-50%,-50%) scale(1)}}
.rg-fl-price{position:absolute;left:50%;bottom:calc(var(--u,8px)*20);transform:translateX(-50%);display:none;align-items:center;gap:calc(var(--u,8px)*.8);pointer-events:none;z-index:5;
  background:#10142a;border:calc(var(--u,8px)*.45) solid #fff;border-radius:calc(var(--u,8px)*3);padding:calc(var(--u,8px)*.6) calc(var(--u,8px)*1.6);
  font:900 calc(var(--u,8px)*3.4)/1 ui-rounded,"Nunito",system-ui,sans-serif;color:#fff;box-shadow:0 calc(var(--u,8px)*.5) 0 #000}
.rg-fl-price.on{display:flex}
.rg .rg-fl-price .ic{width:calc(var(--u,8px)*3.6);height:calc(var(--u,8px)*3.6);color:#ffd93b}
.rg-fl-price .free{color:#ffd93b}
.rg-fl-result{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:none;flex-direction:column;align-items:center;gap:calc(var(--u,8px)*1.4);z-index:8;pointer-events:none;
  background:#10142a;border:calc(var(--u,8px)*.7) solid #fff;border-radius:calc(var(--u,8px)*3);padding:calc(var(--u,8px)*2.2) calc(var(--u,8px)*3.4);box-shadow:0 calc(var(--u,8px)*1.2) 0 #000;
  font:900 calc(var(--u,8px)*3.6)/1 ui-rounded,"Nunito","Trebuchet MS",system-ui,sans-serif;color:#fff}
.rg-fl-result.on{display:flex;animation:rg-fl-in .45s cubic-bezier(.2,1.5,.4,1)}
@keyframes rg-fl-in{from{transform:translate(-50%,-50%) scale(.5);opacity:0}}
.rg-fl-big{width:calc(var(--u,8px)*15);height:calc(var(--u,8px)*15);border-radius:50%;border:calc(var(--u,8px)*.9) solid #000;display:grid;place-items:center;
  box-shadow:0 0 0 calc(var(--u,8px)*.6) #fff,0 calc(var(--u,8px)*1) 0 calc(var(--u,8px)*.6) #000;font-size:calc(var(--u,8px)*8)}
.rg-fl-big.gold{background:radial-gradient(circle at 35% 30%,#fff6c2,#ffd23f 45%,#d49a00)}
.rg-fl-big.silver{background:radial-gradient(circle at 35% 30%,#fff,#e6e9f0 45%,#9aa1ad)}
.rg-fl-big.bronze{background:radial-gradient(circle at 35% 30%,#ffd2a8,#b06a30 50%,#6b3a12)}
.rg-fl-big.ribbon{background:radial-gradient(circle at 35% 30%,#fff,#dfe4ff 45%,#7d86c2)}
.rg .rg-fl-big .ic{width:62%;height:62%;color:#fff}
.rg-fl-stars{display:flex;gap:calc(var(--u,8px)*.6)}
.rg .rg-fl-stars .ic{width:calc(var(--u,8px)*5.4);height:calc(var(--u,8px)*5.4);color:#ffd93b}
.rg .rg-fl-stars .ic.off{color:#2a3150}
.rg-fl-times{display:flex;flex-direction:column;gap:calc(var(--u,8px)*.8)}
.rg-fl-time{display:flex;align-items:center;gap:calc(var(--u,8px)*1);font-variant-numeric:tabular-nums}
.rg-fl-time .rg-fl-dot{position:relative;top:auto;left:auto;margin:0;flex:none}
.rg .rg-fl-time .win{width:calc(var(--u,8px)*3.6);height:calc(var(--u,8px)*3.6);color:#ffd93b}
.rg .rg-fl-time .win.no{visibility:hidden}
.rg-fl-prize{display:flex;align-items:center;gap:calc(var(--u,8px)*.6);color:#ffd93b}
.rg .rg-fl-prize .ic{width:calc(var(--u,8px)*4.6);height:calc(var(--u,8px)*4.6);color:#9fe8ff}
.rg-fl-btns{display:flex;gap:calc(var(--u,8px)*2)}
.rg-fl-btn{pointer-events:auto;display:flex;align-items:center;gap:calc(var(--u,8px)*.8);background:#ffd93b;color:#15110a;border:calc(var(--u,8px)*.5) solid #000;border-radius:calc(var(--u,8px)*2);
  padding:calc(var(--u,8px)*.8) calc(var(--u,8px)*1.6);font:900 calc(var(--u,8px)*2.6)/1 ui-rounded,"Nunito",system-ui,sans-serif;cursor:pointer;box-shadow:0 calc(var(--u,8px)*.6) 0 #000}
.rg-fl-btn.alt{background:#fff}
.rg .rg-fl-btn .ic{width:calc(var(--u,8px)*3.6);height:calc(var(--u,8px)*3.6);color:#15110a}
.rg-fl-btn kbd{font:inherit;background:#15110a;color:#fff;border-radius:calc(var(--u,8px)*.7);padding:calc(var(--u,8px)*.3) calc(var(--u,8px)*.7)}

.rg-fl-lap{min-width:0}
.rg-fl-lap.pop{animation:rg-fl-in .45s cubic-bezier(.2,1.5,.4,1)}
.rg-fl-prize.practice{color:#fff}
.rg-fl-nogem{position:relative;display:inline-grid;place-items:center}
.rg-fl-nogem::after{content:"";position:absolute;left:-12%;right:-12%;top:46%;height:calc(var(--u,8px)*.9);background:#000;border:calc(var(--u,8px)*.25) solid #fff;transform:rotate(-38deg);border-radius:calc(var(--u,8px)*.5)}
.rg-fl-chip{display:flex;align-items:center;gap:calc(var(--u,8px)*.6);background:#10142a;border:calc(var(--u,8px)*.4) dashed #fff;border-radius:calc(var(--u,8px)*2);padding:calc(var(--u,8px)*.4) calc(var(--u,8px)*1.2);
  font:900 calc(var(--u,8px)*2.8)/1 ui-rounded,"Nunito",system-ui,sans-serif;color:#fff}
.rg .rg-fl-chip .ic{width:calc(var(--u,8px)*3.4);height:calc(var(--u,8px)*3.4);color:#9fe8ff}
.rg-fl-jump{position:absolute;left:50%;bottom:calc(var(--u,8px)*3);transform:translateX(-50%);display:none;align-items:center;gap:calc(var(--u,8px)*1.2);pointer-events:none;z-index:6;
  background:#10142a;border:calc(var(--u,8px)*.5) solid #fff;border-radius:calc(var(--u,8px)*3);padding:calc(var(--u,8px)*.8) calc(var(--u,8px)*1.8);box-shadow:0 calc(var(--u,8px)*.6) 0 #000}
.rg-fl-jump.on{display:flex}
.rg-fl-jump.pulse{animation:rg-fl-pulse .5s ease-in-out infinite alternate;border-color:#ffd93b}
.rg .rg-fl-jump .ic{width:calc(var(--u,8px)*4.4);height:calc(var(--u,8px)*4.4);color:#ffd93b}
.rg-fl-jump .keys{display:flex;align-items:center;gap:calc(var(--u,8px)*.4)}
@keyframes rg-fl-pulse{to{transform:translateX(-50%) scale(1.18)}}
.rg-fl-leave{position:absolute;left:calc(var(--u,8px)*2);top:50%;transform:translateY(-50%);display:none;pointer-events:auto;cursor:pointer;z-index:6;
  width:max(48px,calc(var(--u,8px)*9));height:max(48px,calc(var(--u,8px)*9));border-radius:calc(var(--u,8px)*2.4);background:#10142a;border:calc(var(--u,8px)*.5) solid #fff;
  box-shadow:0 calc(var(--u,8px)*.6) 0 #000;padding:0;place-items:center}
.rg-fl-leave.on{display:grid}
.rg .rg-fl-leave .ic{width:62%;height:62%;color:#fff}
.rg-fl-leave .keys{position:absolute;right:calc(var(--u,8px)*-1.4);top:calc(var(--u,8px)*-1.4)}
`;

const ARROW = '<svg viewBox="0 0 24 24"><path d="M3 9h10V4l9 8-9 8v-5H3z"/></svg>';

export interface ResultInfo {
  time: number;
  medal: Medal;
  stars: number;
  friendTime: number;
  beatFriend: boolean;
  /** Gems the round added to the wallet: the prize plus stamp / mission bonuses it set off (0 for a practice run or without the economy). */
  prize: number;
  /** Could not pay: a practice run, no gems (shown as a crossed-out gem). */
  practice: boolean;
  friendColor: string;
}

export interface FoamUi {
  showHud(on: boolean, friendColor?: string): void;
  hud(time: number, you: number, friend: number): void;
  countdown(n: number | 'go' | null): void;
  price(state: 'free' | number | null): void;
  result(info: ResultInfo | null, device: InputState['device']): void;
  /** Update the gem total on the open result card (a stamp or mission bonus landed). */
  setPrize(gems: number): void;
  /** The one button of the run (jump) for the active device; pulse = now! null hides it. */
  jumpHint(device: InputState['device'] | null, pulse: boolean): void;
  /**
   * The always-on "leave" button during a countdown or a run (a big exit pictogram with the R / Y
   * key cap; a plain ≥ 48 px button on touch). null hides it. A click reads as 'exit'.
   */
  leave(device: InputState['device'] | null): void;
  /** Lap counter (1-based) next to the stopwatch. */
  lap(n: number): void;
  /** A crossed-out gem chip by the countdown: this run is practice (no gems). */
  practice(on: boolean): void;
  /** Buttons clicked/tapped since last call. */
  takeClick(): 'replay' | 'exit' | null;
  dispose(): void;
}

export function createFoamUi(root: HTMLElement): FoamUi {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const hud = document.createElement('div');
  hud.className = 'rg-fl-hud';
  hud.setAttribute('data-testid', 'foamlava-hud');
  const row = document.createElement('div');
  row.className = 'rg-fl-row';
  const clock = document.createElement('div');
  clock.className = 'rg-fl-clock';
  clock.appendChild(icon('clock'));
  const clockText = document.createElement('span');
  clockText.textContent = '0.0';
  clock.appendChild(clockText);
  const medals = document.createElement('div');
  medals.className = 'rg-fl-medals';
  const medalEls = (['gold', 'silver', 'bronze'] as const).map((m, i) => {
    const el = document.createElement('div');
    el.className = `rg-fl-medal ${m}`;
    el.innerHTML = `<i>${i + 1}</i>${MEDALS[m]}`;
    medals.appendChild(el);
    return { el, limit: MEDALS[m] };
  });
  const lapEl = document.createElement('div');
  lapEl.className = 'rg-fl-clock rg-fl-lap';
  lapEl.setAttribute('data-testid', 'foamlava-lap');
  lapEl.appendChild(icon('flag'));
  const lapText = document.createElement('span');
  lapEl.appendChild(lapText);
  row.append(lapEl, clock, medals);
  const track = document.createElement('div');
  track.className = 'rg-fl-track';
  track.innerHTML = '<div class="end"></div>';
  const friendDot = document.createElement('div');
  friendDot.className = 'rg-fl-dot friend';
  const youDot = document.createElement('div');
  youDot.className = 'rg-fl-dot you';
  track.append(friendDot, youDot);
  hud.append(row, track);

  const count = document.createElement('div');
  count.className = 'rg-fl-count';
  count.setAttribute('data-testid', 'foamlava-count');

  const priceEl = document.createElement('div');
  priceEl.className = 'rg-fl-price';
  priceEl.setAttribute('data-testid', 'foamlava-price');

  const res = document.createElement('div');
  res.className = 'rg-fl-result';
  res.setAttribute('data-testid', 'foamlava-result');

  const jump = document.createElement('div');
  jump.className = 'rg-fl-jump';
  jump.setAttribute('data-testid', 'foamlava-jump');
  const practiceChip = document.createElement('div');
  practiceChip.className = 'rg-fl-chip';
  practiceChip.setAttribute('data-testid', 'foamlava-practice-chip');
  practiceChip.style.display = 'none';
  const ng = document.createElement('span');
  ng.className = 'rg-fl-nogem';
  ng.appendChild(icon('gem'));
  practiceChip.append(ng);
  hud.appendChild(practiceChip);

  const leaveBtn = document.createElement('button');
  leaveBtn.type = 'button';
  leaveBtn.className = 'rg-fl-leave';
  leaveBtn.setAttribute('data-testid', 'foamlava-leave');
  leaveBtn.setAttribute('aria-label', 'leave');
  leaveBtn.addEventListener('click', () => {
    click = 'exit';
  });
  let leaveKey = '';

  root.append(hud, count, priceEl, res, jump, leaveBtn);
  let prizeText: Text | null = null;
  let jumpKey = '';

  let click: 'replay' | 'exit' | null = null;
  let lastCount: string | null = null;
  let lastPrice: string | null = null;
  let lastTime = '';

  return {
    showHud(on, friendColor) {
      hud.classList.toggle('on', on);
      if (friendColor) friendDot.style.background = friendColor;
    },
    hud(time, you, friend) {
      const t = formatTime(time);
      if (t !== lastTime) {
        lastTime = t;
        clockText.textContent = t;
        for (const m of medalEls) m.el.classList.toggle('gone', time > m.limit);
      }
      youDot.style.left = `${Math.round(Math.min(1, Math.max(0, you)) * 1000) / 10}%`;
      friendDot.style.left = `${Math.round(Math.min(1, Math.max(0, friend)) * 1000) / 10}%`;
    },
    countdown(n) {
      const key = n === null ? '' : String(n);
      if (key === lastCount) return;
      lastCount = key;
      count.classList.toggle('on', n !== null);
      if (n === null) return;
      count.innerHTML = n === 'go' ? `<span class="go">GO ${ARROW}</span>` : String(n);
      count.classList.remove('pop');
      void count.offsetWidth;
      count.classList.add('pop');
    },
    price(state) {
      const key = state === null ? '' : String(state);
      if (key === lastPrice) return;
      lastPrice = key;
      priceEl.classList.toggle('on', state !== null);
      priceEl.replaceChildren();
      if (state === null) return;
      priceEl.appendChild(icon(state === 'free' ? 'check' : 'gem'));
      const s = document.createElement('span');
      if (state === 'free') s.className = 'free';
      s.textContent = state === 'free' ? '0' : String(state);
      priceEl.appendChild(s);
    },
    result(info, device) {
      res.classList.toggle('on', !!info);
      if (!info) return;
      res.replaceChildren();
      const big = document.createElement('div');
      big.className = `rg-fl-big ${info.medal}`;
      big.appendChild(icon(info.medal === 'ribbon' ? 'check' : 'star'));
      const stars = document.createElement('div');
      stars.className = 'rg-fl-stars';
      for (let i = 0; i < 3; i++) {
        const s = icon('star');
        if (i >= info.stars) s.classList.add('off');
        stars.appendChild(s);
      }
      const times = document.createElement('div');
      times.className = 'rg-fl-times';
      const line = (who: 'you' | 'friend', t: number, win: boolean): HTMLElement => {
        const l = document.createElement('div');
        l.className = 'rg-fl-time';
        const d = document.createElement('div');
        d.className = `rg-fl-dot ${who}`;
        if (who === 'friend') d.style.background = info.friendColor;
        const w = icon('star', `win${win ? '' : ' no'}`);
        const s = document.createElement('span');
        s.textContent = formatTime(t);
        l.append(d, s, w);
        return l;
      };
      times.append(line('you', info.time, info.beatFriend), line('friend', info.friendTime, !info.beatFriend));
      res.append(big, stars, times);
      prizeText = null;
      if (info.practice) {
        // Practice run: a crossed-out gem and a 0, so "you won but got nothing" never confuses.
        const p = document.createElement('div');
        p.className = 'rg-fl-prize practice';
        p.setAttribute('data-testid', 'foamlava-practice');
        const g = document.createElement('span');
        g.className = 'rg-fl-nogem';
        g.appendChild(icon('gem'));
        p.append(g, document.createTextNode('0'));
        res.appendChild(p);
      } else {
        const p = document.createElement('div');
        p.className = 'rg-fl-prize';
        p.setAttribute('data-testid', 'foamlava-prize');
        prizeText = document.createTextNode(`+${info.prize}`);
        p.append(icon('gem'), prizeText);
        p.style.display = info.prize > 0 ? '' : 'none';
        res.appendChild(p);
      }
      const btns = document.createElement('div');
      btns.className = 'rg-fl-btns';
      const pad = device === 'gamepad';
      const touch = device === 'touch';
      const mk = (kind: 'replay' | 'exit', ic: 'restart' | 'exit', key: string): HTMLButtonElement => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `rg-fl-btn${kind === 'exit' ? ' alt' : ''}`;
        b.setAttribute('data-testid', `foamlava-${kind}`);
        b.appendChild(icon(ic));
        if (!touch) {
          const k = document.createElement('kbd');
          k.textContent = key;
          b.appendChild(k);
        }
        b.addEventListener('click', () => {
          click = kind;
        });
        return b;
      };
      btns.append(mk('replay', 'restart', pad ? 'A' : 'Space'), mk('exit', 'exit', pad ? 'B' : 'R'));
      res.appendChild(btns);
    },
    setPrize(gems) {
      if (!prizeText) return;
      prizeText.textContent = `+${gems}`;
      (prizeText.parentElement as HTMLElement).style.display = gems > 0 ? '' : 'none';
    },
    jumpHint(device, pulse) {
      const key = device ?? '';
      if (key !== jumpKey) {
        jumpKey = key;
        jump.replaceChildren();
        if (device) jump.append(controlKeys('jump', device), icon('trampoline'));
      }
      jump.classList.toggle('on', !!device);
      jump.classList.toggle('pulse', !!device && pulse);
    },
    leave(device) {
      leaveBtn.classList.toggle('on', !!device);
      const key = device ?? '';
      if (key === leaveKey) return;
      leaveKey = key;
      leaveBtn.replaceChildren();
      if (!device) return;
      leaveBtn.appendChild(icon('exit'));
      if (device !== 'touch') leaveBtn.appendChild(controlKeys('respawn', device));
    },
    lap(n) {
      lapText.textContent = `${n}/${LAPS}`;
      lapEl.classList.remove('pop');
      void lapEl.offsetWidth;
      lapEl.classList.add('pop');
    },
    practice(on) {
      practiceChip.style.display = on ? 'flex' : 'none';
    },
    takeClick() {
      const c = click;
      click = null;
      return c;
    },
    dispose() {
      style.remove();
      hud.remove();
      count.remove();
      priceEl.remove();
      res.remove();
      jump.remove();
      leaveBtn.remove();
    },
  };
}
