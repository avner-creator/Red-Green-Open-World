/** Grown-up gate logic (pure): hold-to-open progress and a simple multiplication question. */
export const GATE_HOLD_SECONDS = 3;

export interface HoldState {
  held: number;
  active: boolean;
}

export function stepHold(state: HoldState, dt: number, seconds = GATE_HOLD_SECONDS): { state: HoldState; done: boolean } {
  const held = state.active ? state.held + dt : Math.max(0, state.held - dt * 2.5);
  return { state: { held: Math.min(seconds, held), active: state.active }, done: state.active && held >= seconds };
}

export interface GateQuestion {
  a: number;
  b: number;
  answer: number;
  options: number[];
}

export function makeGateQuestion(rand: () => number = Math.random): GateQuestion {
  const a = 6 + Math.floor(rand() * 4); // 6..9
  const b = 3 + Math.floor(rand() * 7); // 3..9
  const answer = a * b;
  const options = new Set<number>([answer]);
  let guard = 0;
  while (options.size < 4 && guard++ < 100) {
    const delta = (1 + Math.floor(rand() * 9)) * (rand() < 0.5 ? -1 : 1);
    const wrong = rand() < 0.5 ? answer + delta : (a + (delta % 3 || 1)) * b;
    if (wrong > 0 && wrong !== answer) options.add(wrong);
  }
  let n = answer + 11;
  while (options.size < 4) options.add(n++);
  const list = [...options];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j] as number, list[i] as number];
  }
  return { a, b, answer, options: list };
}

export const checkAnswer = (q: GateQuestion, choice: number): boolean => q.answer === choice;
