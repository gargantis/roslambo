// Round IDs (REQUIREMENTS "Round ID"): 100 bits as 20 Crockford base32
// characters plus a mod-32 check character, 21 in all. The same format as
// amorfus's join secret, whose src/net/secret.ts this follows.

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const BODY = 20;

/** 20 characters from the first 100 bits of `bytes` (at least 13 bytes). */
function body(bytes: Uint8Array): string {
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const b of bytes) {
    acc = ((acc << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5 && out.length < BODY) {
      bits -= 5;
      out += ALPHABET[(acc >> bits) & 31]!;
    }
    if (out.length === BODY) break;
  }
  return out;
}

// 37 ≡ 5 (mod 32), which is invertible, so any single wrong character
// changes the check.
function checksum(s: string): number {
  let sum = 0;
  for (const ch of s) sum = (sum * 37 + ALPHABET.indexOf(ch)) % 32;
  return sum;
}

function withCheck(s: string): string {
  return s + ALPHABET[checksum(s)]!;
}

export function generateRoundId(): string {
  const bytes = new Uint8Array(13); // 104 bits ≥ 100
  crypto.getRandomValues(bytes);
  return withCheck(body(bytes));
}

/** Q-8: the Play again round's ID, the same for every press, so presses at
 *  the same moment lead to one room: the first 100 bits of
 *  SHA-256("roslambo again" + previous ID). */
export async function nextRoundId(previous: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`roslambo again${previous}`));
  return withCheck(body(new Uint8Array(digest)));
}

/** Groups of four for display: K7QM-2XDP-4TR8-WHZN-3VBC-7. */
export function formatRoundId(id: string): string {
  return id.match(/.{1,4}/g)?.join('-') ?? id;
}

/** Accepts lowercase, dashes, spaces and the Crockford look-alikes (O for 0,
 *  I and L for 1). Null when the shape or the check character is wrong. */
export function normalizeRoundId(input: string): string | null {
  const cleaned = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (!/^[0-9A-HJKMNP-TV-Z]{21}$/.test(cleaned)) return null;
  return ALPHABET[checksum(cleaned.slice(0, BODY))] === cleaned[BODY] ? cleaned : null;
}

/** The round ID from a URL fragment such as `#join=K7QM…`, or null. */
export function roundIdFromHash(hash: string): string | null {
  const m = /^#join=([^&]*)/.exec(hash);
  return m ? normalizeRoundId(decodeURIComponent(m[1]!)) : null;
}

/** A shareable link: this page's address with the ID in the fragment,
 *  which never reaches a server. */
export function joinLink(href: string, id: string): string {
  return `${href.split('#')[0]!}#join=${id}`;
}
