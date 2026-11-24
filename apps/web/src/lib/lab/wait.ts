// Hyperion's waiting (M521): on a cross-origin-isolated page the engine's thread may sleep on memory it shares with
// the page or with its parallel workers (SharedArrayBuffer and Atomics.wait) until an answer is written there. So a
// script can wait for a device's next line, a pin's fresh reading, a channel's readings or a parfor's results anywhere:
// inside loops and functions, not only at its top level. Where a browser can't (no isolation), `waits` is false and
// the callers keep their earlier behaviour.

/** One shared slot: [state, length] then the answer's bytes. state 0 = waiting, 1 = answered, 2 = too big. */
export interface Slot { ctl: Int32Array; bytes: Uint8Array }
export const slotOf = (sab: SharedArrayBuffer): Slot => ({ ctl: new Int32Array(sab, 0, 2), bytes: new Uint8Array(sab, 8) });
export const newSlot = (size: number) => new SharedArrayBuffer(8 + size);
export const canShare = () => typeof SharedArrayBuffer !== 'undefined' && typeof Atomics !== 'undefined' && (globalThis as { crossOriginIsolated?: boolean }).crossOriginIsolated === true;

// ——— Packing values (numbers kept exactly: NaN, ±Inf, −0, typed arrays and Maps) ———
const enc = new TextEncoder(), dec = new TextDecoder();
const TYPED: Record<string, new (b: ArrayBuffer) => ArrayBufferView> = { Float64Array, Float32Array, Int8Array, Uint8Array, Int16Array, Uint16Array, Int32Array, Uint32Array };
const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0));
export function pack(v: unknown): Uint8Array {
  return enc.encode(JSON.stringify(v, function (this: unknown, _k, x) {
    if (typeof x === 'number') return Number.isFinite(x) && !Object.is(x, -0) ? x : { $n: Object.is(x, -0) ? '-0' : String(x) };
    if (ArrayBuffer.isView(x) && !(x instanceof DataView)) { const name = x.constructor.name; return { $t: name, d: b64(new Uint8Array(x.buffer, x.byteOffset, x.byteLength)) }; }
    if (x instanceof Map) return { $m: [...x] };
    return x;
  }));
}
export function unpack<T>(u: Uint8Array): T {
  return JSON.parse(dec.decode(u), (_k, x) => {
    if (x && typeof x === 'object' && !Array.isArray(x)) {
      if ('$n' in x) return x.$n === '-0' ? -0 : Number(x.$n);
      if ('$t' in x && TYPED[x.$t]) { const raw = unb64(x.d); return new TYPED[x.$t](raw.buffer); }
      if ('$m' in x) return new Map(x.$m);
    }
    return x;
  }) as T;
}

/** Writes an answer into a slot and wakes the thread sleeping on it. */
export function answer(sab: SharedArrayBuffer, value: unknown) {
  const s = slotOf(sab), data = pack(value);
  if (data.length > s.bytes.length) { Atomics.store(s.ctl, 1, data.length); Atomics.store(s.ctl, 0, 2); }
  else { s.bytes.set(data); Atomics.store(s.ctl, 1, data.length); Atomics.store(s.ctl, 0, 1); }
  Atomics.notify(s.ctl, 0);
}
/** Sleeps until the slot is answered (or `ms` pass): the answer, or undefined. */
export function sleepOn<T>(sab: SharedArrayBuffer, ms: number): T | undefined {
  const s = slotOf(sab);
  Atomics.wait(s.ctl, 0, 0, ms);
  const state = Atomics.load(s.ctl, 0);
  if (state === 2) throw new Error(`The answer is too big to pass back (${(Atomics.load(s.ctl, 1) / 1e6).toFixed(0)} MB).`);
  if (state !== 1) return undefined;
  return unpack<T>(s.bytes.slice(0, Atomics.load(s.ctl, 1)));
}

/** The engine's line to the page (set by lab.worker.ts when the page is isolated). */
export const waits: { page: ((kind: string, body: unknown, ms: number) => unknown) | null } = { page: null };
/** Asks the page and waits up to `ms` for its answer; null where the engine can't wait (or no answer came). */
export const askPage = <T,>(kind: string, body: unknown, ms: number): T | null => (waits.page ? ((waits.page(kind, body, ms) as T | undefined) ?? null) : null);
