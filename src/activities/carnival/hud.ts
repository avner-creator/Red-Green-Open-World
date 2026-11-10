/**
 * Carnival HUD (DOM, inside ctx.uiRoot): scoreboard chips (you + two friends), a time bar, the
 * 3-2-1 countdown with the game's pictogram and how-to keys, a power meter, score pops and the
 * result card (podium, stars, prize, replay / exit). White and yellow on near-black with black
 * outlines, like the main HUD, so everything reads in the R-only and G-only channel.
 */
import type { InputState } from '../../types';
import { icon } from '../../ui/icons';
import type { UiIconName } from '../../ui/icons';
import { pictoDataUrl } from './picto';
import type { PictoId } from './picto';
import type { RoundResult } from './round';

const CSS = `
.rg .cv{position:absolute;inset:0;pointer-events:none;display:none;z-index:6}
.rg .cv.on{display:block}
.rg .cv-board{position:absolute;top:calc(var(--u)*16.5);left:50%;transform:translateX(-50%);display:flex;gap:calc(var(--u)*1.6);align-items:flex-end}
.rg .cv-chip{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*.3);padding:calc(var(--u)*.8) calc(var(--u)*1.6);
  background:var(--panel);border:calc(var(--u)*.5) solid #000;border-radius:calc(var(--u)*2);box-shadow:0 0 0 calc(var(--u)*.35) #fff;min-width:calc(var(--u)*9)}
.rg .cv-chip .nm{font-size:.62em;padding:0 calc(var(--u)*.8);border-radius:calc(var(--u)*1);color:#000;border:calc(var(--u)*.3) solid #000}
.rg .cv-chip .sc{font-size:1.5em}
.rg .cv-chip.me{transform:scale(1.18);box-shadow:0 0 0 calc(var(--u)*.45) var(--y),0 0 calc(var(--u)*2) var(--y)}
.rg .cv-chip.bump{animation:cv-bump .35s ease-out}
@keyframes cv-bump{40%{transform:scale(1.4)}}
.rg .cv-chip.me.bump{animation:cv-bump-me .35s ease-out}
@keyframes cv-bump-me{40%{transform:scale(1.5)}}
.rg .cv-time{position:absolute;top:calc(var(--u)*28);left:50%;transform:translateX(-50%);width:calc(var(--u)*34);height:calc(var(--u)*2.2);
  background:#000;border:calc(var(--u)*.35) solid #fff;border-radius:calc(var(--u)*2);overflow:hidden}
.rg .cv-time i{display:block;height:100%;background:linear-gradient(90deg,#fff,var(--y));transform-origin:left;border-radius:calc(var(--u)*2)}
.rg .cv-meter{position:absolute;right:calc(var(--u)*7);top:50%;transform:translateY(-50%);width:calc(var(--u)*4.4);height:calc(var(--u)*34);
  background:#000;border:calc(var(--u)*.45) solid #fff;border-radius:calc(var(--u)*2.2);overflow:hidden;display:none}
.rg .cv-meter.on{display:block}
.rg .cv-meter i{position:absolute;left:0;right:0;bottom:0;background:linear-gradient(0deg,#fff,var(--y));border-radius:calc(var(--u)*1.6)}
.rg .cv-meter b{position:absolute;left:-10%;right:-10%;height:calc(var(--u)*.6);background:#fff;border:calc(var(--u)*.2) solid #000}
.rg .cv-count{position:absolute;inset:0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:calc(var(--u)*2);
  background:radial-gradient(circle,rgba(5,6,12,.55),rgba(5,6,12,0) 60%)}
.rg .cv-count.on{display:flex}
.rg .cv-count img{width:calc(var(--u)*16);height:calc(var(--u)*16);background:var(--panel);border:calc(var(--u)*.6) solid #000;border-radius:calc(var(--u)*3);
  box-shadow:0 0 0 calc(var(--u)*.45) var(--y)}
.rg .cv-count .n{font-size:5em;line-height:1}
.rg .cv-count .n.pop{animation:cv-n .9s ease-out}
@keyframes cv-n{0%{transform:scale(2.2);opacity:0}25%{transform:scale(1);opacity:1}100%{transform:scale(.9)}}
.rg .cv-how{display:flex;gap:calc(var(--u)*2.4)}
.rg .cv-how > span{display:flex;align-items:center;gap:calc(var(--u)*.8);background:var(--panel);padding:calc(var(--u)*.6) calc(var(--u)*1.2);
  border:calc(var(--u)*.4) solid #000;border-radius:calc(var(--u)*1.6);box-shadow:0 0 0 calc(var(--u)*.3) #fff}
.rg .cv .ic{width:calc(var(--u)*4);height:calc(var(--u)*4);display:inline-block}
.rg .cv .key{display:inline-flex;align-items:center;justify-content:center;min-width:calc(var(--u)*4);height:calc(var(--u)*4);padding:0 calc(var(--u)*.8);
  font-size:.7em;color:#000;background:#fff;border:calc(var(--u)*.35) solid #000;border-radius:calc(var(--u)*.9);box-shadow:0 calc(var(--u)*.4) 0 #000}
.rg .cv-pop{position:absolute;left:50%;top:42%;font-size:2.4em;transform:translate(-50%,-50%);opacity:0;color:var(--y)}
.rg .cv-pop.go{animation:cv-pop .8s ease-out}
@keyframes cv-pop{0%{opacity:0;transform:translate(-50%,-20%) scale(.6)}20%{opacity:1;transform:translate(-50%,-50%) scale(1.25)}100%{opacity:0;transform:translate(-50%,-160%) scale(1)}}
.rg .cv-res{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:none;flex-direction:column;align-items:center;gap:calc(var(--u)*1.6);
  padding:calc(var(--u)*2.4) calc(var(--u)*3.6);background:var(--panel);border:calc(var(--u)*.6) solid #000;border-radius:calc(var(--u)*3);
  box-shadow:0 0 0 calc(var(--u)*.5) #fff,0 calc(var(--u)*1.2) 0 calc(var(--u)*.5) #000}
.rg .cv-res.on{display:flex;animation:cv-in .45s cubic-bezier(.2,1.6,.4,1)}
@keyframes cv-in{0%{transform:translate(-50%,-50%) scale(.4);opacity:0}100%{transform:translate(-50%,-50%) scale(1);opacity:1}}
.rg .cv-pod{display:flex;align-items:flex-end;gap:calc(var(--u)*1.2)}
.rg .cv-pod > div{display:flex;flex-direction:column;align-items:center;gap:calc(var(--u)*.4)}
.rg .cv-pod .blk{width:calc(var(--u)*9);background:#fff;border:calc(var(--u)*.4) solid #000;border-radius:calc(var(--u)*.8) calc(var(--u)*.8) 0 0;
  color:#000;display:flex;justify-content:center;padding-top:calc(var(--u)*.4)}
.rg .cv-pod .me .blk{background:var(--y)}
.rg .cv-stars{display:flex;gap:calc(var(--u)*1)}
.rg .cv-stars .ic{width:calc(var(--u)*7);height:calc(var(--u)*7);color:#3a3f5c}
.rg .cv-stars .ic.lit{color:var(--y);animation:cv-star .5s cubic-bezier(.2,1.8,.4,1) backwards}
@keyframes cv-star{0%{transform:scale(0) rotate(-90deg)}}
.rg .cv-prize{display:flex;align-items:center;gap:calc(var(--u)*1.4);font-size:1.3em}
.rg .cv-prize img{width:calc(var(--u)*6);height:calc(var(--u)*6)}
.rg .cv-btns{display:flex;gap:calc(var(--u)*2)}
`;

let cssDone = false;
function injectCss(): void {
  if (cssDone) return;
  cssDone = true;
  const s = document.createElement('style');
  s.textContent = CSS;
  document.head.append(s);
}

function el(tag: string, cls = '', ...kids: (Node | string)[]): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const k of kids) e.append(k);
  return e;
}

function key(label: string): HTMLElement {
  return el('span', 'key', label);
}

export interface Contestant {
  name: string;
  /** [light, dark] card colours. */
  colors: readonly [string, string];
  me: boolean;
}

export type HowStep = 'aim' | 'throw' | 'charge' | 'scoop' | 'stomp' | 'dodge' | 'jump';

const HOW_ICON: Record<HowStep, UiIconName> = {
  aim: 'target',
  throw: 'hand',
  charge: 'bolt',
  scoop: 'hand',
  stomp: 'bolt',
  dodge: 'flop',
  jump: 'trampoline',
};

function howKeys(step: HowStep, device: InputState['device']): HTMLElement[] {
  if (device === 'touch') {
    if (step === 'aim' || step === 'dodge') return [icon('hand')];
    return [icon('play')];
  }
  if (device === 'gamepad') {
    if (step === 'aim' || step === 'dodge') return [icon('stick')];
    return [key('A')];
  }
  if (step === 'aim') return [icon('mouse')];
  if (step === 'dodge') return [key('A'), key('D')];
  if (step === 'jump') return [key('Space')];
  return [key('Space')];
}

export class CarnivalHud {
  readonly root = el('div', 'cv');
  private readonly board = el('div', 'cv-board');
  private readonly timeFill = el('i');
  private readonly time = el('div', 'cv-time', this.timeFill);
  private readonly meterFill = el('i');
  private readonly meterMark = el('b');
  private readonly meter = el('div', 'cv-meter', this.meterFill, this.meterMark);
  private readonly countImg = document.createElement('img');
  private readonly countN = el('span', 'n t', '3');
  private readonly how = el('div', 'cv-how');
  private readonly count = el('div', 'cv-count', this.countImg, this.countN, this.how);
  private readonly pop = el('div', 'cv-pop t', '+1');
  private readonly res = el('div', 'cv-res');
  private chips: { root: HTMLElement; score: HTMLElement; value: number }[] = [];
  private lastCount = '';
  private readonly urls = new Map<PictoId, string>();
  onReplay: (() => void) | null = null;
  onExit: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    injectCss();
    this.root.dataset.testid = 'carnival-hud';
    this.root.append(this.board, this.time, this.meter, this.count, this.pop, this.res);
    parent.append(this.root);
  }

  private url(id: PictoId): string {
    let u = this.urls.get(id);
    if (!u) this.urls.set(id, (u = pictoDataUrl(id)));
    return u;
  }

  show(contestants: readonly Contestant[]): void {
    this.board.replaceChildren();
    this.chips = contestants.map((c) => {
      const nm = el('span', 'nm', c.name);
      nm.style.background = c.colors[0];
      const score = el('span', 'sc t', '0');
      const root = el('div', `cv-chip${c.me ? ' me' : ''}`, nm, score);
      root.style.background = c.colors[1];
      this.board.append(root);
      return { root, score, value: 0 };
    });
    this.res.classList.remove('on');
    this.root.classList.add('on');
    this.board.style.display = 'flex';
    this.time.style.display = 'block';
    this.setTime(1);
    this.setMeter(null);
  }

  hide(): void {
    this.root.classList.remove('on');
    this.count.classList.remove('on');
    this.res.classList.remove('on');
  }

  setScores(scores: readonly number[]): void {
    scores.forEach((s, i) => {
      const c = this.chips[i];
      if (!c || c.value === s) return;
      c.value = s;
      c.score.textContent = String(s);
      c.root.classList.remove('bump');
      void c.root.offsetWidth;
      c.root.classList.add('bump');
    });
  }

  /** Floating "+N" for the player's points. */
  popPoints(n: number): void {
    this.pop.textContent = `+${n}`;
    this.pop.classList.remove('go');
    void this.pop.offsetWidth;
    this.pop.classList.add('go');
  }

  /** 0..1 of the round left; hidden for turn-based games (null). */
  setTime(f: number | null): void {
    this.time.style.display = f === null ? 'none' : 'block';
    if (f !== null) this.timeFill.style.transform = `scaleX(${Math.max(0, Math.min(1, f))})`;
  }

  /** Power meter 0..1 (null hides it); `mark` draws a target line. */
  setMeter(v: number | null, mark: number | null = null): void {
    this.meter.classList.toggle('on', v !== null);
    if (v === null) return;
    this.meterFill.style.height = `${Math.max(0, Math.min(1, v)) * 100}%`;
    this.meterMark.style.display = mark === null ? 'none' : 'block';
    if (mark !== null) this.meterMark.style.bottom = `${mark * 100}%`;
  }

  /** Countdown overlay: `n` = 3, 2, 1, 0 (= GO) or null to hide. */
  setCount(n: number | null, picto: PictoId, steps: readonly HowStep[], device: InputState['device']): void {
    if (n === null) {
      this.count.classList.remove('on');
      this.lastCount = '';
      return;
    }
    const label = n > 0 ? String(n) : 'GO!';
    if (label === this.lastCount) return;
    if (!this.lastCount) {
      this.countImg.src = this.url(picto);
      this.how.replaceChildren(
        ...steps.map((s) => {
          const span = el('span');
          span.append(...howKeys(s, device), icon(HOW_ICON[s], 'y'));
          return span;
        }),
      );
    }
    this.lastCount = label;
    this.count.classList.add('on');
    this.countN.textContent = label;
    this.countN.classList.remove('pop');
    void this.countN.offsetWidth;
    this.countN.classList.add('pop');
  }

  showResult(r: RoundResult, contestants: readonly Contestant[], scores: readonly number[], plush: boolean, device: InputState['device']): void {
    this.setMeter(null);
    this.setTime(null);
    this.board.style.display = 'none';
    // Podium: 2nd, 1st, 3rd.
    const order = contestants.map((c, i) => ({ c, s: scores[i], i })).sort((a, b) => b.s - a.s || (a.c.me ? -1 : b.c.me ? 1 : 0));
    const podium = el('div', 'cv-pod');
    const heights = [9, 6, 4];
    for (const slot of [1, 0, 2]) {
      const e = order[slot];
      if (!e) continue;
      const nm = el('span', 'nm', e.c.name);
      nm.style.cssText = `background:${e.c.colors[0]};color:#000;border:calc(var(--u)*.3) solid #000;border-radius:calc(var(--u));padding:0 calc(var(--u)*.8);font-size:.7em`;
      const blk = el('div', 'blk', String(slot + 1));
      blk.style.height = `calc(var(--u)*${heights[slot]})`;
      const col = el('div', e.c.me ? 'me' : '', el('span', 't', String(e.s)), nm, blk);
      podium.append(col);
    }
    const stars = el('div', 'cv-stars');
    for (let i = 0; i < 3; i++) {
      const s = icon('star', i < r.stars ? 'lit' : '');
      s.style.animationDelay = `${0.35 + i * 0.25}s`;
      stars.append(s);
    }
    const prize = el('div', 'cv-prize', icon('gem', 'y'), el('span', 't', `+${r.gems}`));
    if (plush) {
      const img = document.createElement('img');
      img.src = this.url('plush');
      prize.append(img);
    }
    const replay = el('button', 'b sm', icon('restart'), device === 'keyboard' ? key('E') : device === 'gamepad' ? key('A') : '');
    replay.dataset.testid = 'carnival-replay';
    const exit = el('button', 'b d sm', icon('exit'), device === 'keyboard' ? key('R') : device === 'gamepad' ? key('Y') : '');
    exit.dataset.testid = 'carnival-exit';
    replay.addEventListener('click', () => this.onReplay?.());
    exit.addEventListener('click', () => this.onExit?.());
    this.res.replaceChildren(podium, stars, prize, el('div', 'cv-btns', replay, exit));
    this.res.dataset.place = String(r.place);
    this.res.classList.add('on');
  }

  dispose(): void {
    this.root.remove();
  }
}
