// Keyboard and on-screen buttons into Controls (PLAN §11 "Input"). Each
// button captures its pointers, so a finger that slides off still lifts
// the right button, and several fingers hold several buttons at once.

import type { Controls } from './controls';

function typing(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}

/** Listens until the returned function is called. */
export function bindKeyboard(controls: Controls): () => void {
  const down = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    if (controls.keyDown(e.code)) e.preventDefault();
  };
  const up = (e: KeyboardEvent): void => {
    if (controls.keyUp(e.code)) e.preventDefault();
  };
  const release = (): void => controls.releaseAll();
  const hidden = (): void => {
    if (document.visibilityState === 'hidden') controls.releaseAll();
  };
  addEventListener('keydown', down);
  addEventListener('keyup', up);
  addEventListener('blur', release);
  document.addEventListener('visibilitychange', hidden);
  return () => {
    removeEventListener('keydown', down);
    removeEventListener('keyup', up);
    removeEventListener('blur', release);
    document.removeEventListener('visibilitychange', hidden);
    controls.releaseAll();
  };
}

/** Makes `el` a hold-to-press button for `bit`. */
export function bindButton(el: HTMLElement, bit: number, controls: Controls): void {
  const mine = new Set<number>();
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // a synthetic or already-released pointer: the press still counts
    }
    mine.add(e.pointerId);
    controls.pointerDown(e.pointerId, bit);
  });
  const lift = (e: PointerEvent): void => {
    if (!mine.delete(e.pointerId)) return;
    controls.pointerUp(e.pointerId);
  };
  el.addEventListener('pointerup', lift);
  el.addEventListener('pointercancel', lift);
  el.addEventListener('lostpointercapture', lift);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
