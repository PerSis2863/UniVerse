import { LabError } from './parse';

// Hyperion's computer app reached from the engine (M577): the engine runs synchronously in a background worker, so it
// asks the app with a synchronous request to the app's private address (hyperion-native://), which only the computer
// app has and which answers only Hyperion's own site with this launch's token. In a browser there is no bridge, and
// the functions that need one say so.

export type Native = (op: string, body: object) => Record<string, unknown>;
let bridge: Native | null = null, where: { platform: string; arch: string } | null = null;
/** The bridge and, from the app, the computer's system and processor (Node's names: win32, darwin, linux; x64, arm64). */
export const setNative = (n: Native | null, info?: { platform: string; arch: string }) => { bridge = n; where = n ? info ?? null : null; };
export const nativePlatform = () => where;
export const hasNative = () => bridge !== null;
export function native(op: string, body: object) {
  if (!bridge) throw new LabError("IBIS-AMI models run only in Hyperion's computer app: they are compiled programs a browser can't run. Install it with Hyperion's Install button, then run this again there.");
  return bridge(op, body);
}
/** The worker's bridge: a synchronous POST of text (a simple request, no preflight) with the token in the address. */
export function xhrNative(url: string, token: string): Native {
  return (op, body) => {
    const x = new XMLHttpRequest();
    x.open('POST', `${url}/${op}?t=${encodeURIComponent(token)}`, false);
    try { x.send(JSON.stringify(body)); } catch { throw new LabError("The computer app didn't answer (restart Hyperion and try again)."); }
    let r: Record<string, unknown>;
    try { r = JSON.parse(x.responseText); } catch { throw new LabError(`The computer app didn't answer (${x.status}).`); }
    if (!r.ok) throw new LabError(String(r.error || 'The model failed.'));
    return r;
  };
}

/** Doubles to base64 and back (the bytes as they are in memory, little-endian on every computer Hyperion runs on). */
export function f64ToB64(a: ArrayLike<number>) {
  const u = new Uint8Array(Float64Array.from(a).buffer);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
export function b64ToF64(s: string) {
  const bin = atob(s), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return Array.from(new Float64Array(u.buffer));
}
export function bytesToB64(u: Uint8Array) {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
