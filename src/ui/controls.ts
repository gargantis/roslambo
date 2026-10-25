// The three controls (PLAN §11 "Input"): keys and touch points held, plus
// presses since the last sample, so a tap shorter than one tick still
// counts. Pure, so the latch logic is tested without a DOM.

import { LEFT, RIGHT, THRUST } from '../core/sim/rules';

/** Physical key positions (Q-18): AZERTY plays on Z, Q and D. */
export const KEY_BITS: Readonly<Record<string, number>> = { KeyW: THRUST, KeyA: LEFT, KeyD: RIGHT };

export class Controls {
  private readonly keys = new Map<string, number>();
  private readonly pointers = new Map<number, number>();
  private latched = 0;

  /** True if the key is one of the controls. Repeats change nothing. */
  keyDown(code: string): boolean {
    const bit = KEY_BITS[code];
    if (bit === undefined) return false;
    if (!this.keys.has(code)) {
      this.keys.set(code, bit);
      this.latched |= bit;
    }
    return true;
  }

  keyUp(code: string): boolean {
    return this.keys.delete(code) || KEY_BITS[code] !== undefined;
  }

  pointerDown(id: number, bit: number): void {
    this.pointers.set(id, bit);
    this.latched |= bit;
  }

  pointerUp(id: number): void {
    this.pointers.delete(id);
  }

  /** Focus lost, page hidden, or screen changed: nothing stays held. */
  releaseAll(): void {
    this.keys.clear();
    this.pointers.clear();
  }

  held(): number {
    let b = 0;
    for (const bit of this.keys.values()) b |= bit;
    for (const bit of this.pointers.values()) b |= bit;
    return b;
  }

  /** The buttons for one tick: held now, or pressed since the last sample. */
  sample(): number {
    const b = this.held() | this.latched;
    this.latched = 0;
    return b;
  }
}
