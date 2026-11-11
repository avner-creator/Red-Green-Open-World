// Guard for gameplay keyboard shortcuts (Tab = Fun Pass, H/F1 = help card, ...).
// They act only while playing, with no dialog (calibration, menus) open, and never when the key
// press belongs to a form control: there Tab/Enter/Space/arrows are keyboard navigation.

const CONTROL_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A']);
const DIALOG_SEL = 'dialog, [role="dialog"], [role="alertdialog"], [role="menu"], [aria-modal="true"]';

/** True when the event's target is a focusable control or sits inside a dialog/menu. */
export function isControlTarget(target: EventTarget | null): boolean {
  if (!target || typeof Element === 'undefined' || !(target instanceof Element)) return false;
  if (CONTROL_TAGS.has(target.tagName)) return true;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  const role = target.getAttribute('role');
  if (role === 'button' || role === 'slider' || role === 'checkbox' || role === 'switch') return true;
  return !!target.closest(DIALOG_SEL);
}

/** True when a dialog (e.g. the calibration screen) is open anywhere in the document. */
export function dialogOpen(doc: Document = document): boolean {
  return !!doc.querySelector('[role="dialog"], [aria-modal="true"], dialog[open]');
}

/** True when the key press is typing into (or adjusting) a text field, select or slider. */
export function typingTarget(target: EventTarget | null): boolean {
  if (!target || typeof Element === 'undefined' || !(target instanceof Element)) return false;
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return true;
  return target instanceof HTMLElement && target.isContentEditable;
}

/** May a gameplay shortcut act on this key event? */
export function gameplayKeyAllowed(e: KeyboardEvent, phase: string): boolean {
  return phase === 'playing' && !isControlTarget(e.target) && !dialogOpen();
}
