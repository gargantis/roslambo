// What the stores need from localStorage (D-18), and the browser's own,
// which may be missing or blocked. Base64 for the binary records of A.3.

export type KeyValue = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

export function browserStorage(): KeyValue | null {
  try {
    return localStorage;
  } catch {
    return null; // storage blocked
  }
}

/** Every key with this prefix, read before any is removed. */
export function keysWith(kv: KeyValue, prefix: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < kv.length; i++) {
    const k = kv.key(i);
    if (k?.startsWith(prefix)) out.push(k);
  }
  return out;
}

export function toBase64(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

export function fromBase64(s: string): Uint8Array | null {
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** A failed write (quota, blocked storage) loses that write only. */
export function tryWrite(kv: KeyValue | null, key: string, value: string | null): boolean {
  try {
    if (!kv) return false;
    if (value === null) kv.removeItem(key);
    else kv.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function tryRead(kv: KeyValue | null, key: string): string | null {
  try {
    return kv?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** An in-memory KeyValue: for tests, and for a browser without storage. */
export class MemoryStorage implements KeyValue {
  readonly data = new Map<string, string>();
  failNextWrite = false;
  get length(): number {
    return this.data.size;
  }
  key(i: number): string | null {
    return [...this.data.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    if (this.failNextWrite) {
      this.failNextWrite = false;
      throw new Error('closed mid-write');
    }
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    this.data.delete(k);
  }
}
