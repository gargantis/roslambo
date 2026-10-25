// Little-endian byte writing and total reading for the wire protocol
// (PLAN §9). The reader never throws: a short or malformed buffer sets
// `bad`, and every later read returns zeros.

const utf8 = new TextEncoder();
const utf8Strict = new TextDecoder('utf-8', { fatal: true });

export const MAX_MESSAGE = 16_000;
export const MAX_STRING = 32;

export class Writer {
  private buf = new Uint8Array(256);
  private view = new DataView(this.buf.buffer);
  length = 0;

  private room(n: number): void {
    if (this.length + n <= this.buf.length) return;
    let size = this.buf.length * 2;
    while (size < this.length + n) size *= 2;
    const next = new Uint8Array(size);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
    this.view = new DataView(next.buffer);
  }

  u8(v: number): this {
    this.room(1);
    this.view.setUint8(this.length, v);
    this.length += 1;
    return this;
  }

  u16(v: number): this {
    this.room(2);
    this.view.setUint16(this.length, v, true);
    this.length += 2;
    return this;
  }

  u32(v: number): this {
    this.room(4);
    this.view.setUint32(this.length, v, true);
    this.length += 4;
    return this;
  }

  bytes(b: Uint8Array): this {
    this.room(b.length);
    this.buf.set(b, this.length);
    this.length += b.length;
    return this;
  }

  /** u8 length, then UTF-8; at most 32 bytes (longer strings are cut). */
  string(s: string): this {
    let b = utf8.encode(s);
    if (b.length > MAX_STRING) b = b.subarray(0, 0);
    return this.u8(b.length).bytes(b);
  }

  /** A 32-hex-digit ID or hash as raw bytes. */
  hex(h: string, size: number): this {
    this.room(size);
    for (let i = 0; i < size; i++) {
      const v = parseInt(h.slice(2 * i, 2 * i + 2), 16);
      this.buf[this.length + i] = v === v ? v : 0;
    }
    this.length += size;
    return this;
  }

  done(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}

export class Reader {
  private readonly buf: Uint8Array;
  private readonly view: DataView;
  private pos = 0;
  bad = false;

  constructor(buf: Uint8Array) {
    this.buf = buf;
    this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  }

  private take(n: number): number {
    if (this.bad || this.pos + n > this.buf.length) {
      this.bad = true;
      return -1;
    }
    const at = this.pos;
    this.pos += n;
    return at;
  }

  u8(): number {
    const at = this.take(1);
    return at < 0 ? 0 : this.view.getUint8(at);
  }

  u16(): number {
    const at = this.take(2);
    return at < 0 ? 0 : this.view.getUint16(at, true);
  }

  u32(): number {
    const at = this.take(4);
    return at < 0 ? 0 : this.view.getUint32(at, true);
  }

  bytes(n: number): Uint8Array {
    const at = this.take(n);
    return at < 0 ? new Uint8Array(0) : this.buf.slice(at, at + n);
  }

  string(): string {
    const n = this.u8();
    if (n > MAX_STRING) {
      this.bad = true;
      return '';
    }
    const b = this.bytes(n);
    if (this.bad) return '';
    try {
      return utf8Strict.decode(b);
    } catch {
      this.bad = true;
      return '';
    }
  }

  hex(size: number): string {
    const b = this.bytes(size);
    let s = '';
    for (const v of b) s += v.toString(16).padStart(2, '0');
    return this.bad ? '' : s;
  }

  get remaining(): number {
    return this.buf.length - this.pos;
  }

  /** True when the whole buffer was read without error. */
  get complete(): boolean {
    return !this.bad && this.pos === this.buf.length;
  }
}
