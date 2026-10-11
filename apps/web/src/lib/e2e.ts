// End-to-end encrypted private chats (Stage 5 · B7.6), with the browser's own crypto (WebCrypto):
// each device has an X25519 key pair (the private half never leaves it). A message is encrypted
// once with a fresh AES-GCM key, and that key is wrapped for every device of both people (each
// with a key agreed between the sender's device and that device, through HKDF). The server only
// ever sees the scrambled message and the wrapped keys. No ratchet yet: a device that's added later
// can't read what was sent before it, and one whose keys leak could read past messages to it.

const enc = new TextEncoder(), dec = new TextDecoder();
export const b64 = (u: ArrayBuffer | Uint8Array) => { const a = u instanceof Uint8Array ? u : new Uint8Array(u); let s = ''; for (const x of a) s += String.fromCharCode(x); return btoa(s); };
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export interface Device { deviceId: string; publicKey: string }
export interface E2EPayload { v: 1; from: string; iv: string; ct: string; keys: Record<string, { iv: string; wk: string }> }

/** Whether this browser can do private chats. */
export async function e2eSupported() {
  try { await crypto.subtle.generateKey({ name: 'X25519' }, false, ['deriveBits']); return true; } catch { return false; }
}

/** A new key pair for this device (the private key can't be read out, only used). */
export const newDeviceKey = () => crypto.subtle.generateKey({ name: 'X25519' }, false, ['deriveBits']) as Promise<CryptoKeyPair>;
export const exportPublic = async (k: CryptoKey) => b64(await crypto.subtle.exportKey('raw', k));
export const importPublic = (s: string) => crypto.subtle.importKey('raw', unb64(s), { name: 'X25519' }, true, []);

/** The key two devices agree on (the same from either side). */
async function pairKey(mine: CryptoKey, theirs: CryptoKey, usage: KeyUsage[]) {
  const bits = await crypto.subtle.deriveBits({ name: 'X25519', public: theirs }, mine, 256);
  const hkdf = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('universe-e2e'), info: enc.encode('wrap-v1') }, hkdf, { name: 'AES-GCM', length: 256 }, false, usage);
}

/** A message for these devices (both people's, mine included). */
export async function encryptFor(text: string, me: { deviceId: string; privateKey: CryptoKey }, devices: Device[]): Promise<E2EPayload> {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const content = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['encrypt']);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, content, enc.encode(text));
  const keys: E2EPayload['keys'] = {};
  for (const d of devices) {
    const wrap = await pairKey(me.privateKey, await importPublic(d.publicKey), ['encrypt']);
    const wiv = crypto.getRandomValues(new Uint8Array(12));
    keys[d.deviceId] = { iv: b64(wiv), wk: b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: wiv }, wrap, key)) };
  }
  return { v: 1, from: me.deviceId, iv: b64(iv), ct: b64(ct), keys };
}

/** The text of a message, on one of the devices it was for (throws when it wasn't, or it was changed). */
export async function decryptFrom(p: E2EPayload, me: { deviceId: string; privateKey: CryptoKey }, senderPublic: string): Promise<string> {
  const mine = p.keys[me.deviceId];
  if (!mine) throw new Error('not-for-this-device');
  const unwrap = await pairKey(me.privateKey, await importPublic(senderPublic), ['decrypt']);
  const key = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(mine.iv) }, unwrap, unb64(mine.wk));
  const content = await crypto.subtle.importKey('raw', key, 'AES-GCM', false, ['decrypt']);
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(p.iv) }, content, unb64(p.ct)));
}

/** A code both people can compare (in person or on a call) to check nobody swapped the keys. */
export async function safetyCode(publicKeys: string[]) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode([...publicKeys].sort().join('|'))));
  return Array.from({ length: 6 }, (_, i) => String(((digest[i * 2] << 8) | digest[i * 2 + 1]) % 10000).padStart(4, '0')).join(' ');
}

/** Checks a payload's shape before storing it (sizes kept small). */
export function validPayload(x: unknown): x is E2EPayload {
  const p = x as E2EPayload | null;
  const s = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max && /^[A-Za-z0-9+/=]+$/.test(v);
  if (!p || p.v !== 1 || typeof p.from !== 'string' || p.from.length > 64 || !s(p.iv, 24) || !s(p.ct, 40_000) || !p.keys || typeof p.keys !== 'object') return false;
  const entries = Object.entries(p.keys);
  return entries.length > 0 && entries.length <= 24 && entries.every(([id, k]) => id.length <= 64 && s(k?.iv, 24) && s(k?.wk, 100));
}
