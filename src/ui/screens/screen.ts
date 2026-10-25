// What every screen is (D-22): an element, an optional per-frame update,
// and an optional clean-up when it's replaced.

export interface Screen {
  el: HTMLElement;
  frame?(now: number): void;
  dispose?(): void;
}
