// Display names (Q-22): up to 20 characters, at most 32 UTF-8 bytes (the
// wire limit, §9), no control characters. The simulation drops a name that
// breaks these rules, so the UI fits a typed name to them first.

import { nameBytes } from './sim/codec';

export const NAME_MAX_CHARS = 20;
export const NAME_MAX_BYTES = 32;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

/** A typed name made valid: trimmed, control characters removed, cut to
 *  the limits on a character boundary. */
export function fitName(input: string): string {
  const chars = [...input.replace(CONTROL, '').trim()].slice(0, NAME_MAX_CHARS);
  while (chars.length > 0 && nameBytes(chars.join('')) > NAME_MAX_BYTES) chars.pop();
  return chars.join('').trim();
}
