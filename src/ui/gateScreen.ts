/** Grown-up gate: hold a button for 3 s OR answer a multiplication. */
import { h } from './dom';
import { checkAnswer, GATE_HOLD_SECONDS, makeGateQuestion, stepHold } from './gate';
import type { GateQuestion, HoldState } from './gate';
import { icon } from './icons';
import type { Screen } from './screens';

const NS = 'http://www.w3.org/2000/svg';
const R = 46;
const C = 2 * Math.PI * R;

export interface GateScreen extends Screen {
  update(dt: number, padHeld: boolean): void;
  reset(): void;
}

export function createGate(onPass: () => void, onBack: () => void): GateScreen {
  let hold: HoldState = { held: 0, active: false };
  let pointerHeld = false;
  let keyHeld = false;
  let q: GateQuestion = makeGateQuestion();

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.classList.add('ring');
  const mk = (stroke: string, w: number): SVGCircleElement => {
    const c = document.createElementNS(NS, 'circle');
    for (const [k, v] of Object.entries({ cx: '50', cy: '50', r: String(R), fill: 'none', stroke, 'stroke-width': String(w), 'stroke-linecap': 'round' })) c.setAttribute(k, v);
    return c;
  };
  const arc = mk('#ffd93b', 7);
  arc.setAttribute('stroke-dasharray', String(C));
  arc.setAttribute('stroke-dashoffset', String(C));
  svg.append(mk('#000', 12), mk('#2a3160', 7), arc);

  const holdBtn = h(
    'button',
    'b hold',
    { type: 'button', 'aria-label': 'Hold for 3 seconds', 'data-testid': 'gate-hold', 'data-hold': '1' },
    svg,
    h('span', 'row', {}, icon('gear'), icon('grownup')),
    h('span', 'hint', {}, icon('hand'), icon('clock'), '3'),
  );
  const begin = (): void => {
    hold.active = true;
  };
  const end = (): void => {
    hold.active = false;
  };
  holdBtn.addEventListener('pointerdown', (e) => {
    pointerHeld = true;
    holdBtn.setPointerCapture?.(e.pointerId);
    begin();
  });
  const up = (): void => {
    pointerHeld = false;
    if (!keyHeld) end();
  };
  holdBtn.addEventListener('pointerup', up);
  holdBtn.addEventListener('pointercancel', up);
  holdBtn.addEventListener('lostpointercapture', up);
  holdBtn.addEventListener('keydown', (e) => {
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      keyHeld = true;
      begin();
    }
  });
  holdBtn.addEventListener('keyup', (e) => {
    if (e.code === 'Enter' || e.code === 'Space') {
      keyHeld = false;
      if (!pointerHeld) end();
    }
  });
  holdBtn.addEventListener('blur', () => {
    keyHeld = false;
    if (!pointerHeld) end();
  });

  const qText = h('div', 'q t', { 'data-testid': 'gate-question' });
  const opts = h('div', 'opts');
  const quiz = h('div', 'quiz', {}, qText, opts);
  const renderQuiz = (): void => {
    qText.textContent = `${q.a} × ${q.b} = ?`;
    opts.replaceChildren(
      ...q.options.map((n) => {
        const b = h('button', 'b d', { type: 'button', 'data-testid': 'gate-answer', 'data-value': String(n) }, String(n));
        b.addEventListener('click', () => {
          if (checkAnswer(q, n)) onPass();
          else {
            q = makeGateQuestion();
            renderQuiz();
            quiz.classList.remove('shake');
            void quiz.offsetWidth;
            quiz.classList.add('shake');
            (opts.firstElementChild as HTMLElement | null)?.focus();
          }
        });
        return b;
      }),
    );
  };
  renderQuiz();

  const back = h('button', 'b d sm', { type: 'button', 'aria-label': 'Back', 'data-testid': 'gate-back' }, icon('back'));
  back.addEventListener('click', onBack);
  const panel = h(
    'div',
    'panel',
    {},
    h('div', 'head t', {}, icon('gear'), icon('grownup')),
    h('div', 'gate', {}, holdBtn, h('span', 'or t', {}, 'OR'), quiz),
    h('div', '', { style: 'display:flex;justify-content:center;margin-top:calc(var(--u)*2.4)' }, back),
  );
  const el = h('div', 'screen dim', { 'data-screen': 'gate' }, panel);

  const draw = (): void => arc.setAttribute('stroke-dashoffset', String(C * (1 - hold.held / GATE_HOLD_SECONDS)));
  return {
    el,
    onShow() {
      this.reset();
      return holdBtn;
    },
    reset() {
      hold = { held: 0, active: false };
      pointerHeld = false;
      keyHeld = false;
      q = makeGateQuestion();
      renderQuiz();
      draw();
    },
    update(dt, padHeld) {
      const focused = document.activeElement === holdBtn;
      if (padHeld && focused) hold.active = true;
      else if (!pointerHeld && !keyHeld) hold.active = false;
      const r = stepHold(hold, dt);
      hold = r.state;
      draw();
      if (r.done) {
        hold = { held: 0, active: false };
        onPass();
      }
    },
  };
}
