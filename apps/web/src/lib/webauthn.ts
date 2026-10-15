// Checking a passkey (WebAuthn) on the server with the platform's own WebCrypto, no library: the
// browser gives the passkey's public key when it is made (SPKI, from response.getPublicKey()), and
// each sign-in sends a signature over the authenticator's data and a hash of the client data, which
// names the challenge we gave, the page's origin and the kind of request.
// https://www.w3.org/TR/webauthn-3/#sctn-verifying-assertion

/** COSE algorithm numbers the browser reports (getPublicKeyAlgorithm) and we accept. */
export const PASSKEY_ALGS = { ES256: -7, EdDSA: -8, RS256: -257 } as const;

export const toB64url = (bytes: ArrayBuffer | Uint8Array) => {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

export function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('Not base64url');
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const sha256 = async (data: Uint8Array<ArrayBuffer>) => new Uint8Array(await crypto.subtle.digest('SHA-256', data));
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/** The authenticator data's fixed start: which site it is for, the flags and the signature counter. */
export function parseAuthData(data: Uint8Array) {
  if (data.length < 37) throw new Error('Authenticator data too short');
  const flags = data[32];
  return {
    rpIdHash: data.slice(0, 32),
    userPresent: (flags & 0x01) !== 0,
    userVerified: (flags & 0x04) !== 0,
    signCount: ((data[33] << 24) | (data[34] << 16) | (data[35] << 8) | data[36]) >>> 0,
  };
}

/** An ECDSA signature as WebAuthn sends it (DER SEQUENCE of two INTEGERs) → r‖s, as WebCrypto wants. */
export function derToRaw(der: Uint8Array, size = 32): Uint8Array<ArrayBuffer> {
  if (der[0] !== 0x30) throw new Error('Not a DER signature');
  let i = der[1] & 0x80 ? 2 + (der[1] & 0x7f) : 2;
  const out = new Uint8Array(size * 2);
  for (let part = 0; part < 2; part++) {
    if (der[i] !== 0x02) throw new Error('Not a DER integer');
    const len = der[i + 1];
    let n = der.slice(i + 2, i + 2 + len);
    while (n.length > size && n[0] === 0) n = n.slice(1);
    if (n.length > size) throw new Error('Integer too long');
    out.set(n, part * size + (size - n.length));
    i += 2 + len;
  }
  return out;
}

function keyParams(alg: number): { importAs: AlgorithmIdentifier | EcKeyImportParams | RsaHashedImportParams; verifyAs: AlgorithmIdentifier | EcdsaParams } {
  if (alg === PASSKEY_ALGS.ES256) return { importAs: { name: 'ECDSA', namedCurve: 'P-256' }, verifyAs: { name: 'ECDSA', hash: 'SHA-256' } };
  if (alg === PASSKEY_ALGS.EdDSA) return { importAs: { name: 'Ed25519' }, verifyAs: { name: 'Ed25519' } };
  if (alg === PASSKEY_ALGS.RS256) return { importAs: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, verifyAs: { name: 'RSASSA-PKCS1-v1_5' } };
  throw new Error('Unsupported passkey type');
}

/** Whether a public key from the browser can be used (imports, and is a type we check). */
export async function usableKey(spki: Uint8Array<ArrayBuffer>, alg: number): Promise<boolean> {
  try {
    await crypto.subtle.importKey('spki', spki, keyParams(alg).importAs, false, ['verify']);
    return true;
  } catch {
    return false;
  }
}

export interface ClientData {
  type: string;
  challenge: string;
  origin: string;
  crossOrigin?: boolean;
}

/** The client data JSON, read (the browser writes it; it is covered by the signature). */
export function readClientData(json: Uint8Array): ClientData {
  const c = JSON.parse(new TextDecoder().decode(json)) as Partial<ClientData>;
  if (typeof c.type !== 'string' || typeof c.challenge !== 'string' || typeof c.origin !== 'string') throw new Error('Bad client data');
  return c as ClientData;
}

export interface Expected {
  type: 'webauthn.create' | 'webauthn.get';
  /** The site's own domain (the passkey's "relying party"), e.g. universeimpact.com. */
  rpId: string;
  origins: string[];
  /** Checks the challenge we handed out (signed and recent; see src/server/passkeys.ts). */
  challengeOk: (challenge: string) => boolean;
}

/** Client data checks shared by making and using a passkey. Returns a reason, or null when fine. */
export function checkClientData(c: ClientData, e: Expected): string | null {
  if (c.type !== e.type) return 'Wrong kind of request';
  if (!e.origins.includes(c.origin)) return 'Wrong site';
  if (c.crossOrigin) return 'Not allowed inside another site';
  if (!e.challengeOk(c.challenge)) return 'This request has expired. Try again.';
  return null;
}

/**
 * Checks one passkey sign-in (an assertion). Returns the authenticator's new signature counter, or a
 * reason it failed. The user must have been verified on the device (fingerprint, face, PIN).
 */
export async function verifyAssertion(input: {
  spki: Uint8Array<ArrayBuffer>;
  alg: number;
  storedCount: number;
  clientDataJSON: Uint8Array<ArrayBuffer>;
  authenticatorData: Uint8Array<ArrayBuffer>;
  signature: Uint8Array<ArrayBuffer>;
  expected: Expected;
}): Promise<{ ok: true; signCount: number } | { ok: false; reason: string }> {
  let c: ClientData;
  let auth: ReturnType<typeof parseAuthData>;
  try {
    c = readClientData(input.clientDataJSON);
    auth = parseAuthData(input.authenticatorData);
  } catch {
    return { ok: false, reason: 'Unreadable passkey answer' };
  }
  const bad = checkClientData(c, input.expected);
  if (bad) return { ok: false, reason: bad };
  if (!same(auth.rpIdHash, await sha256(new TextEncoder().encode(input.expected.rpId)))) return { ok: false, reason: 'Passkey is for another site' };
  if (!auth.userPresent || !auth.userVerified) return { ok: false, reason: 'The device did not check it was you' };
  // A counter that goes backwards means a copied passkey (counters that stay 0 are allowed: synced passkeys do that).
  if (auth.signCount !== 0 || input.storedCount !== 0) {
    if (auth.signCount <= input.storedCount) return { ok: false, reason: 'This passkey looks copied' };
  }
  try {
    const { importAs, verifyAs } = keyParams(input.alg);
    const key = await crypto.subtle.importKey('spki', input.spki, importAs, false, ['verify']);
    const signed = new Uint8Array(input.authenticatorData.length + 32);
    signed.set(input.authenticatorData, 0);
    signed.set(await sha256(input.clientDataJSON), input.authenticatorData.length);
    const sig = input.alg === PASSKEY_ALGS.ES256 ? derToRaw(input.signature) : input.signature;
    if (!(await crypto.subtle.verify(verifyAs, key, sig, signed))) return { ok: false, reason: 'Wrong passkey' };
  } catch {
    return { ok: false, reason: 'Wrong passkey' };
  }
  return { ok: true, signCount: auth.signCount };
}
