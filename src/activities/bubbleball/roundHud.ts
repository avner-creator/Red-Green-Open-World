/**
 * Wordless round HUD shared by the bumper games (DOM, both-eye): a 3-2-1 countdown, a scoreboard
 * with team pictograms and a timer ring, a big score splash, an action-key chip and the result
 * card (stars, gem prize, "again" and "leave" keys). Bright-on-dark with thick outlines so it reads
 * through the red lens and the green lens alone. Numbers are the only "text".
 */

export type TeamIcon = 'light' | 'dark' | 'dino' | 'crown';
export type ActionIcon = 'hop' | 'tail' | 'kick' | 'charge' | 'edge';

const ICONS: Record<TeamIcon | ActionIcon | 'ball' | 'again' | 'leave' | 'gem' | 'splash' | 'trophy' | 'smile' | 'noGem' | 'bonus', string> = {
  // On the rim: a round dino tipping over a line, a fat arrow pointing back in (mash to recover).
  edge: '<path d="M2 20h11" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><ellipse cx="16" cy="13.5" rx="5" ry="5.5" fill="#fff3a0" stroke="#000" stroke-width="1.6" transform="rotate(25 16 13.5)"/><circle cx="18" cy="11" r="1" fill="#000"/><path d="M11 9H3m3-3.2L2.6 9 6 12.2" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 9H3m3-3.2L2.6 9 6 12.2" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  // Practice: a gem with a fat line through it (no prize this time).
  noGem: '<path d="M6 4h12l4 5-10 12L2 9z" fill="#2a3060" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M2 9h20M9 4l3 17 3-17" fill="none" stroke="#fff" stroke-width="1.1"/><path d="M3 21L21 3" stroke="#000" stroke-width="4.4" stroke-linecap="round"/><path d="M3 21L21 3" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>',
  // Bonus: a ribbon medal (missions and Fun Pass prizes paid during the round).
  bonus: '<path d="M7 2l3 7M17 2l-3 7" stroke="#fff" stroke-width="3" stroke-linecap="round"/><circle cx="12" cy="15" r="7" fill="#fff3a0" stroke="#000" stroke-width="1.8"/><path d="M12 10.5l1.5 3 3.2.4-2.4 2.2.6 3.2-2.9-1.6-2.9 1.6.6-3.2-2.4-2.2 3.2-.4z" fill="#fff" stroke="#000" stroke-width="1"/>',
  // Dash kick: a bubble lunging at a ball, with speed lines.
  kick: '<path d="M1.5 8h5M1 12h4.5M1.5 16h5" stroke="#fff" stroke-width="2" stroke-linecap="round"/><circle cx="10.5" cy="12" r="5.5" fill="#fff3a0" stroke="#000" stroke-width="1.6"/><circle cx="19" cy="13" r="3.6" fill="#fff" stroke="#000" stroke-width="1.6"/><path d="M19 11.2l1.5 1.1-.6 1.8h-1.8l-.6-1.8z" fill="#000"/>',
  // Belly charge: a round dino belly lunging forward with speed lines.
  charge: '<path d="M1.5 8h4.5M1 12h4M1.5 16h4.5" stroke="#fff" stroke-width="2" stroke-linecap="round"/><ellipse cx="13.5" cy="13" rx="7.5" ry="7" fill="#fff3a0" stroke="#000" stroke-width="1.6"/><ellipse cx="15" cy="15" rx="4" ry="3.6" fill="#fff" stroke="#000" stroke-width="1.2"/><circle cx="17" cy="9" r="1.2" fill="#000"/><path d="M20.5 6.5l2 -2M21.5 9l2.2 -.6" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>',
  trophy: '<path d="M7 3h10v5a5 5 0 0 1-10 0z" fill="#fff3a0" stroke="#000" stroke-width="1.6"/><path d="M7 5H3.5a3.5 3.5 0 0 0 4 4.2M17 5h3.5a3.5 3.5 0 0 1-4 4.2" fill="none" stroke="#000" stroke-width="1.6"/><path d="M10.5 13h3v4h-3z" fill="#fff" stroke="#000" stroke-width="1.4"/><path d="M7 21h10v-3H7z" fill="#fff3a0" stroke="#000" stroke-width="1.6"/>',
  smile: '<circle cx="12" cy="12" r="9.5" fill="#fff3a0" stroke="#000" stroke-width="1.8"/><circle cx="8.8" cy="9.8" r="1.4" fill="#000"/><circle cx="15.2" cy="9.8" r="1.4" fill="#000"/><path d="M7 14c2.5 3.5 7.5 3.5 10 0" fill="none" stroke="#000" stroke-width="1.8" stroke-linecap="round"/>',
  // A bright bubble with a shine (home team).
  light: '<circle cx="12" cy="12" r="9.5" fill="#fff3a0" stroke="#000" stroke-width="2"/><path d="M7 8.5a6 6 0 0 1 4-3" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="13.5" r="3" fill="#000"/>',
  // A dark bubble with a white outline (away team).
  dark: '<circle cx="12" cy="12" r="9.5" fill="#141a3c" stroke="#fff" stroke-width="2"/><path d="M7 8.5a6 6 0 0 1 4-3" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="13.5" r="3" fill="#fff"/>',
  dino:
    '<path d="M3 16c0-5 4-8 9-8 2-3 6-4 8-2 1.5 1.5.5 4-2 4.5L17 14c0 3-3 5-7 5H6c-2 0-3-1-3-3z" fill="#fff3a0" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/><circle cx="17.5" cy="7.5" r="1.2" fill="#000"/><path d="M8 8l1-3 1.5 3M11 7l1.5-3 1 3" fill="#fff" stroke="#000" stroke-width="1.2" stroke-linejoin="round"/>',
  crown: '<path d="M3 18l1.5-10 4.5 4 3-6 3 6 4.5-4L21 18z" fill="#141a3c" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/>',
  ball: '<circle cx="12" cy="12" r="9.5" fill="#fff" stroke="#000" stroke-width="2"/><path d="M12 7.5l4 3-1.5 4.5h-5L8 10.5z" fill="#000"/><path d="M12 2.5v5M16 10.5l5-1.5M14.5 15l3 4.5M9.5 15l-3 4.5M8 10.5L3 9" stroke="#000" stroke-width="1.6"/>',
  hop: '<circle cx="12" cy="12.5" r="7.5" fill="#fff3a0" stroke="#000" stroke-width="1.8"/><path d="M8.5 10a4 4 0 0 1 3-3" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/><path d="M12 1.5v7M8.8 4.6L12 1.4l3.2 3.2" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 1.5v7M8.8 4.6L12 1.4l3.2 3.2" fill="none" stroke="#000" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 21.5l1.2-2M15 21.5l-1.2-2" stroke="#000" stroke-width="2" stroke-linecap="round"/>',
  tail: '<path d="M4 15c3 4 10 5 15 0" fill="none" stroke="#000" stroke-width="5" stroke-linecap="round"/><path d="M4 15c3 4 10 5 15 0" fill="none" stroke="#fff3a0" stroke-width="2.6" stroke-linecap="round"/><path d="M19 15l2-4-4 1" fill="#fff" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/><circle cx="12" cy="6" r="3.2" fill="#fff" stroke="#000" stroke-width="1.6"/>',
  again: '<path d="M18.5 8.5A7.5 7.5 0 1 0 19 15" fill="none" stroke="#000" stroke-width="5" stroke-linecap="round"/><path d="M18.5 8.5A7.5 7.5 0 1 0 19 15" fill="none" stroke="#fff3a0" stroke-width="2.4" stroke-linecap="round"/><path d="M20.5 3.5v6h-6" fill="#fff3a0" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/>',
  leave: '<rect x="4" y="3" width="10" height="18" rx="1.5" fill="#141a3c" stroke="#fff" stroke-width="1.8"/><path d="M12 12h9m-3-3.5L21.5 12 18 15.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
  gem: '<path d="M6 4h12l4 5-10 12L2 9z" fill="#fff3a0" stroke="#000" stroke-width="1.8" stroke-linejoin="round"/><path d="M2 9h20M9 4l3 17 3-17" fill="none" stroke="#000" stroke-width="1.2"/>',
  splash: '<path d="M12 3c-3 5-6 8-6 11a6 6 0 0 0 12 0c0-3-3-6-6-11z" fill="#fff" stroke="#000" stroke-width="1.8"/><path d="M9 14a3 3 0 0 0 3 3" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round"/>',
};

const STAR = '<svg viewBox="0 0 24 24"><path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.6 5.7 21l1.5-7L2 9.3l7-.8z"/></svg>';

function svg(name: keyof typeof ICONS): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
}

const CSS = `
.rg-bump{position:absolute;inset:0;pointer-events:none;font:900 5vmin/1 ui-rounded,"Nunito","Trebuchet MS",system-ui,sans-serif;color:#fff;z-index:3}
.rg-bump .board{position:absolute;top:13vmin;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:1.6vmin;
  background:#0d1130;border:.6vmin solid #fff;border-radius:3vmin;padding:1vmin 2vmin;box-shadow:0 .8vmin 0 #000;opacity:0;transition:opacity .2s}
.rg-bump.on .board{opacity:1}
.rg-bump .team{display:flex;align-items:center;gap:1vmin}
.rg-bump .team svg{width:7vmin;height:7vmin}
.rg-bump .num{min-width:5.5vmin;text-align:center;font-size:6.4vmin;-webkit-text-stroke:.35vmin #000;paint-order:stroke fill;color:#fff3a0}
.rg-bump .team.r .num{color:#fff}
.rg-bump .clock{position:relative;width:9vmin;height:9vmin;display:grid;place-items:center;font-size:3.8vmin;color:#fff}
.rg-bump .clock svg{position:absolute;inset:0;transform:rotate(-90deg)}
.rg-bump .clock circle{fill:none;stroke-width:9}
.rg-bump .clock .bg{stroke:#2a3060}
.rg-bump .clock .fg{stroke:#fff3a0;stroke-linecap:round}
.rg-bump .clock.low .fg{stroke:#fff}
.rg-bump .clock.low span{animation:rg-bump-pulse .5s ease-in-out infinite alternate}
.rg-bump .count{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%) scale(.4);font-size:30vmin;color:#fff3a0;
  -webkit-text-stroke:1.6vmin #000;paint-order:stroke fill;opacity:0;text-shadow:0 2vmin 0 #000}
.rg-bump .count.pop{animation:rg-bump-count .9s cubic-bezier(.2,1.6,.4,1) both}
.rg-bump .count svg{width:34vmin;height:34vmin;filter:drop-shadow(0 1.4vmin 0 #000)}
.rg-bump .splash{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);display:flex;align-items:center;gap:2vmin;opacity:0}
.rg-bump .splash.pop{animation:rg-bump-splash 1.8s ease-out both}
.rg-bump .splash svg{width:24vmin;height:24vmin;filter:drop-shadow(0 1.2vmin 0 #000)}
.rg-bump .splash b{font-size:18vmin;color:#fff3a0;-webkit-text-stroke:1.2vmin #000;paint-order:stroke fill;text-shadow:0 1.4vmin 0 #000}
.rg-bump .chip{position:absolute;left:50%;bottom:5%;transform:translateX(-50%);display:flex;align-items:center;gap:1.8vmin;opacity:0;transition:opacity .25s}
.rg-bump .chip.on{opacity:1}
.rg-bump .chip .ico{width:10vmin;height:10vmin;border-radius:50%;background:#0d1130;border:.6vmin solid #fff;display:grid;place-items:center;box-shadow:0 .7vmin 0 #000}
.rg-bump .chip .ico svg{width:74%;height:74%}
.rg-bump .chip.cool{opacity:.45}
.rg-bump .chip.on:not(.cool) .ico{animation:rg-bump-ready 1.1s ease-in-out infinite alternate}
.rg-bump .chip.mash .ico,.rg-bump .chip.mash .key{animation:rg-bump-ready .16s ease-in-out infinite alternate}
.rg-bump .chip.mash .ico{border-color:#fff3a0}
.rg-bump .practice{position:absolute;top:13vmin;left:3vmin;width:9vmin;height:9vmin;border-radius:50%;background:#0d1130;border:.6vmin solid #fff;
  display:grid;place-items:center;box-shadow:0 .7vmin 0 #000;opacity:0;transition:opacity .2s}
.rg-bump .practice svg{width:72%;height:72%}
.rg-bump .practice.on{opacity:1}
.rg-bump .practice.big{left:50%;top:66%;width:16vmin;height:16vmin;transform:translateX(-50%)}
.rg-bump .prize.bonus{font-size:5.4vmin}
.rg-bump .prize.bonus svg{width:6.4vmin;height:6.4vmin}
.rg-bump .mood svg{width:16vmin;height:16vmin;filter:drop-shadow(0 .8vmin 0 #000)}
.rg-bump .result.on .mood svg{animation:rg-bump-star .6s cubic-bezier(.2,1.8,.4,1) both}
.rg-bump .key{height:7vmin;min-width:7vmin;padding:0 1.6vmin;border-radius:1.6vmin;background:linear-gradient(180deg,#ffe97a,#ffd93b 55%,#f2b400);
  border:.55vmin solid #000;box-shadow:0 0 0 .4vmin #fff,0 1vmin 0 .4vmin #000;display:grid;place-items:center;font-size:4.2vmin;color:#15110a}
.rg-bump .key.wide{min-width:19vmin}
.rg-bump .key .bar{width:12vmin;height:1.5vmin;border:.5vmin solid #15110a;border-top:none;border-radius:0 0 .6vmin .6vmin;margin-top:1.2vmin}
.rg-bump .result{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(.6);opacity:0;background:#0d1130;border:.8vmin solid #fff;
  border-radius:4vmin;padding:3vmin 5vmin 3.4vmin;box-shadow:0 1.4vmin 0 #000;display:flex;flex-direction:column;align-items:center;gap:2.4vmin;transition:opacity .25s,transform .35s cubic-bezier(.2,1.6,.4,1)}
.rg-bump .result.on{opacity:1;transform:translate(-50%,-50%) scale(1)}
.rg-bump .stars{display:flex;gap:1.4vmin}
.rg-bump .stars svg{width:13vmin;height:13vmin;fill:#2a3060;stroke:#fff;stroke-width:1.4;stroke-linejoin:round}
.rg-bump .stars svg.got{fill:#fff3a0;stroke:#000;filter:drop-shadow(0 .6vmin 0 #000)}
.rg-bump .result.on .stars svg.got{animation:rg-bump-star .5s cubic-bezier(.2,1.8,.4,1) both}
.rg-bump .result.on .stars svg.got:nth-child(2){animation-delay:.25s}
.rg-bump .result.on .stars svg.got:nth-child(3){animation-delay:.5s}
.rg-bump .prize{display:flex;align-items:center;gap:1.2vmin;font-size:7vmin;color:#fff3a0;-webkit-text-stroke:.4vmin #000;paint-order:stroke fill}
.rg-bump .prize svg{width:8vmin;height:8vmin}
.rg-bump .row{display:flex;gap:4vmin}
.rg-bump .opt{display:flex;align-items:center;gap:1.2vmin}
.rg-bump .opt svg{width:8vmin;height:8vmin}
@keyframes rg-bump-count{0%{opacity:0;transform:translate(-50%,-50%) scale(.3)}25%{opacity:1;transform:translate(-50%,-50%) scale(1.1)}70%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-50%) scale(1.5)}}
@keyframes rg-bump-splash{0%{opacity:0;transform:translate(-50%,-50%) scale(.3) rotate(-12deg)}15%{opacity:1;transform:translate(-50%,-50%) scale(1.15) rotate(4deg)}30%{transform:translate(-50%,-50%) scale(1) rotate(0)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,-60%) scale(1)}}
@keyframes rg-bump-star{from{transform:scale(0) rotate(-40deg)}to{transform:scale(1) rotate(0)}}
@keyframes rg-bump-pulse{to{transform:scale(1.25)}}
@keyframes rg-bump-ready{to{transform:scale(1.12)}}
`;

export interface ScoreSide {
  icon: TeamIcon;
  value: number;
}

export interface RoundHud {
  /** Show the scoreboard (null right side = single score). */
  board(left: ScoreSide, right: ScoreSide | null, secondsLeft: number, total: number): void;
  /** Big 3 / 2 / 1 (or 0 = the "go" pictogram). Call once per number. */
  count(n: number, goIcon: TeamIcon | 'ball'): void;
  /** Big score splash: an icon and "+n" (n ≤ 0 hides the number). */
  splash(icon: keyof typeof ICONS, plus: number): void;
  /** The action-key chip (null hides it); `cooling` dims it while the move recharges. */
  chip(action: ActionIcon | null, gamepad: boolean, cooling?: boolean): void;
  /** Result card: the prize line, plus a bonus line (other gems the wallet got during the round). */
  result(stars: number, gems: number, device: 'keyboard' | 'gamepad' | 'touch', extra?: { bonus?: number; practice?: boolean }): void;
  /** The "practice: no prize" marker (big while counting down, small in the corner during play). */
  practice(on: boolean, big?: boolean): void;
  /** Make the action chip pulse fast (mash it!). */
  mash(on: boolean): void;
  hideResult(): void;
  hide(): void;
  readonly el: HTMLElement;
  dispose(): void;
}

let styleRefs = 0;
let styleEl: HTMLStyleElement | null = null;

export function createRoundHud(root: HTMLElement, testId: string): RoundHud {
  if (styleRefs++ === 0) {
    styleEl = document.createElement('style');
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);
  }
  const el = document.createElement('div');
  el.className = 'rg-bump';
  el.setAttribute('data-testid', testId);
  el.innerHTML =
    '<div class="board"><div class="team l"><span class="ti"></span><span class="num">0</span></div>' +
    '<div class="clock"><svg viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="44"/><circle class="fg" cx="50" cy="50" r="44" pathLength="100" stroke-dasharray="100" stroke-dashoffset="0"/></svg><span>60</span></div>' +
    '<div class="team r"><span class="num">0</span><span class="ti"></span></div></div>' +
    '<div class="count"></div><div class="splash"></div>' +
    `<div class="practice" data-testid="${testId}-practice">${svg('noGem')}</div>` +
    '<div class="chip"><div class="ico"></div><div class="key wide"><div class="bar"></div></div></div>' +
    `<div class="result" data-testid="${testId}-result"><div class="mood"></div><div class="stars">${STAR}${STAR}${STAR}</div>` +
    `<div class="prize p-main" data-testid="${testId}-prize">${svg('gem')}<span>+0</span></div>` +
    `<div class="prize bonus" data-testid="${testId}-bonus">${svg('bonus')}<span>+0</span></div>` +
    `<div class="row"><div class="opt">${svg('again')}<div class="key k-again">E</div></div><div class="opt">${svg('leave')}<div class="key k-leave">R</div></div></div></div>`;
  root.appendChild(el);
  const q = <T extends Element>(s: string): T => el.querySelector(s) as T;
  const left = q<HTMLElement>('.team.l');
  const right = q<HTMLElement>('.team.r');
  const leftNum = q<HTMLElement>('.team.l .num');
  const rightNum = q<HTMLElement>('.team.r .num');
  const leftIcon = q<HTMLElement>('.team.l .ti');
  const rightIcon = q<HTMLElement>('.team.r .ti');
  const clock = q<HTMLElement>('.clock');
  const clockNum = q<HTMLElement>('.clock span');
  const clockFg = q<SVGCircleElement>('.clock .fg');
  const count = q<HTMLElement>('.count');
  const splashEl = q<HTMLElement>('.splash');
  const chipEl = q<HTMLElement>('.chip');
  const chipIco = q<HTMLElement>('.chip .ico');
  const chipKey = q<HTMLElement>('.chip .key');
  const result = q<HTMLElement>('.result');
  const stars = Array.from(el.querySelectorAll('.stars svg'));
  const mood = q<HTMLElement>('.mood');
  const prizeRow = q<HTMLElement>('.prize.p-main');
  const prize = q<HTMLElement>('.prize.p-main span');
  const bonusRow = q<HTMLElement>('.prize.bonus');
  const bonusNum = q<HTMLElement>('.prize.bonus span');
  const practiceEl = q<HTMLElement>('.practice');
  const kAgain = q<HTMLElement>('.k-again');
  const kLeave = q<HTMLElement>('.k-leave');
  let shownL = '';
  let shownR = '';
  let shownChip = '';
  const restart = (n: HTMLElement, cls: string): void => {
    n.classList.remove(cls);
    void n.offsetWidth; // restart the CSS animation
    n.classList.add(cls);
  };

  return {
    el,
    board(l, r, secondsLeft, total) {
      el.classList.add('on');
      if (shownL !== l.icon) {
        leftIcon.innerHTML = svg(l.icon);
        shownL = l.icon;
      }
      leftNum.textContent = String(l.value);
      right.style.display = r ? '' : 'none';
      if (r) {
        if (shownR !== r.icon) {
          rightIcon.innerHTML = svg(r.icon);
          shownR = r.icon;
        }
        rightNum.textContent = String(r.value);
      }
      left.style.display = '';
      const s = Math.max(0, Math.ceil(secondsLeft));
      clockNum.textContent = String(s);
      clock.classList.toggle('low', s <= 10);
      clockFg.setAttribute('stroke-dashoffset', String(Math.round((1 - Math.max(0, Math.min(1, secondsLeft / total))) * 100)));
    },
    count(n, goIcon) {
      count.innerHTML = n > 0 ? String(n) : svg(goIcon);
      restart(count, 'pop');
    },
    splash(icon, plus) {
      splashEl.innerHTML = svg(icon) + (plus > 0 ? `<b>+${plus}</b>` : '');
      restart(splashEl, 'pop');
    },
    chip(action, gamepad, cooling = false) {
      chipEl.classList.toggle('cool', cooling);
      const key = `${action}:${gamepad}`;
      if (key === shownChip) return;
      shownChip = key;
      chipEl.classList.toggle('on', !!action);
      if (!action) return;
      chipIco.innerHTML = svg(action);
      chipKey.classList.toggle('wide', !gamepad);
      chipKey.innerHTML = gamepad ? 'A' : '<div class="bar"></div>';
    },
    result(n, gems, device, extra = {}) {
      // A trophy for a win, a big smile otherwise (everybody had fun).
      mood.innerHTML = svg(n >= 3 ? 'trophy' : 'smile');
      stars.forEach((s, i) => s.classList.toggle('got', i < n));
      const practice = extra.practice === true;
      const bonus = practice ? 0 : Math.max(0, Math.round(extra.bonus ?? 0));
      // Practice: the crossed-out gem instead of "+0" (it was a practice round, not a loss).
      prizeRow.firstElementChild?.remove();
      prizeRow.insertAdjacentHTML('afterbegin', svg(practice ? 'noGem' : 'gem'));
      prize.textContent = practice ? '' : `+${gems}`;
      prizeRow.dataset.practice = String(practice);
      bonusRow.style.display = bonus > 0 ? '' : 'none';
      bonusNum.textContent = `+${bonus}`;
      practiceEl.classList.remove('on');
      kAgain.textContent = device === 'gamepad' ? 'X' : 'E';
      kLeave.textContent = device === 'gamepad' ? 'Y' : 'R';
      kAgain.style.display = kLeave.style.display = device === 'touch' ? 'none' : '';
      result.classList.add('on');
    },
    hideResult() {
      result.classList.remove('on');
    },
    practice(on, big = false) {
      practiceEl.classList.toggle('on', on);
      practiceEl.classList.toggle('big', on && big);
    },
    mash(on) {
      chipEl.classList.toggle('mash', on);
    },
    hide() {
      el.classList.remove('on');
      result.classList.remove('on');
      chipEl.classList.remove('on', 'mash');
      practiceEl.classList.remove('on');
      shownChip = '';
    },
    dispose() {
      el.remove();
      if (--styleRefs === 0) {
        styleEl?.remove();
        styleEl = null;
      }
    },
  };
}
