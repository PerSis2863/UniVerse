import { describe, expect, it } from 'vitest';
import { PASSKEY_ALGS, derToRaw, fromB64url, parseAuthData, toB64url, usableKey, verifyAssertion, type Expected } from './webauthn';

// A pretend phone that holds a passkey and answers sign-ins the way a real authenticator does.
async function device(kind: 'ES256' | 'EdDSA' | 'RS256') {
  const gen = kind === 'ES256' ? { name: 'ECDSA', namedCurve: 'P-256' } : kind === 'EdDSA' ? { name: 'Ed25519' } : { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
  const keys = (await crypto.subtle.generateKey(gen, true, ['sign', 'verify'])) as CryptoKeyPair;
  const spki = new Uint8Array(await crypto.subtle.exportKey('spki', keys.publicKey));
  let count = 0;
  const answer = async (o: { challenge: string; origin?: string; rpId?: string; type?: string; flags?: number; counter?: number }) => {
    const clientDataJSON = new TextEncoder().encode(JSON.stringify({ type: o.type ?? 'webauthn.get', challenge: o.challenge, origin: o.origin ?? 'https://universeimpact.com', crossOrigin: false }));
    const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(o.rpId ?? 'universeimpact.com')));
    count = o.counter ?? count + 1;
    const authenticatorData = new Uint8Array(37);
    authenticatorData.set(rpHash);
    authenticatorData[32] = o.flags ?? 0x05; // user present + verified
    new DataView(authenticatorData.buffer).setUint32(33, count);
    const signed = new Uint8Array([...authenticatorData, ...new Uint8Array(await crypto.subtle.digest('SHA-256', clientDataJSON))]);
    const params = kind === 'ES256' ? { name: 'ECDSA', hash: 'SHA-256' } : kind === 'EdDSA' ? { name: 'Ed25519' } : { name: 'RSASSA-PKCS1-v1_5' };
    let signature = new Uint8Array(await crypto.subtle.sign(params, keys.privateKey, signed));
    if (kind === 'ES256') signature = rawToDer(signature); // authenticators send ECDSA signatures as DER
    return { clientDataJSON, authenticatorData, signature };
  };
  return { spki, alg: PASSKEY_ALGS[kind], answer };
}

function rawToDer(raw: Uint8Array): Uint8Array<ArrayBuffer> {
  const int = (b: Uint8Array) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    const v = b.slice(i);
    return v[0] & 0x80 ? [0x02, v.length + 1, 0, ...v] : [0x02, v.length, ...v];
  };
  const body = [...int(raw.slice(0, 32)), ...int(raw.slice(32))];
  return new Uint8Array([0x30, body.length, ...body]);
}

const expected = (ok = 'c1'): Expected => ({ type: 'webauthn.get', rpId: 'universeimpact.com', origins: ['https://universeimpact.com'], challengeOk: (c) => c === ok });

describe('passkeys (WebAuthn) checked with WebCrypto', () => {
  for (const kind of ['ES256', 'EdDSA', 'RS256'] as const) {
    it(`${kind}: a real sign-in passes; a changed one fails`, async () => {
      const d = await device(kind);
      expect(await usableKey(d.spki, d.alg)).toBe(true);
      const a = await d.answer({ challenge: 'c1' });
      expect(await verifyAssertion({ ...d, storedCount: 0, ...a, expected: expected() })).toEqual({ ok: true, signCount: 1 });
      const tampered = new Uint8Array(a.authenticatorData);
      tampered[36] ^= 1;
      expect((await verifyAssertion({ ...d, storedCount: 0, ...a, authenticatorData: tampered, expected: expected() })).ok).toBe(false);
    });
  }

  it('refuses the wrong challenge, site, kind, a skipped fingerprint and a copied passkey', async () => {
    const d = await device('ES256');
    const check = async (a: Awaited<ReturnType<typeof d.answer>>, storedCount = 0) => verifyAssertion({ ...d, storedCount, ...a, expected: expected() });
    expect(await check(await d.answer({ challenge: 'old' }))).toEqual({ ok: false, reason: 'This request has expired. Try again.' });
    expect(await check(await d.answer({ challenge: 'c1', origin: 'https://evil.example' }))).toEqual({ ok: false, reason: 'Wrong site' });
    expect(await check(await d.answer({ challenge: 'c1', type: 'webauthn.create' }))).toEqual({ ok: false, reason: 'Wrong kind of request' });
    expect(await check(await d.answer({ challenge: 'c1', rpId: 'evil.example' }))).toEqual({ ok: false, reason: 'Passkey is for another site' });
    expect(await check(await d.answer({ challenge: 'c1', flags: 0x01 }))).toEqual({ ok: false, reason: 'The device did not check it was you' });
    expect(await check(await d.answer({ challenge: 'c1', counter: 5 }), 9)).toEqual({ ok: false, reason: 'This passkey looks copied' });
    expect((await check(await d.answer({ challenge: 'c1', counter: 0 }), 0)).ok).toBe(true); // synced passkeys keep 0
    const other = await device('ES256');
    expect(await verifyAssertion({ ...other, storedCount: 0, ...(await d.answer({ challenge: 'c1' })), expected: expected() })).toEqual({ ok: false, reason: 'Wrong passkey' });
  });

  it('helpers', () => {
    expect(toB64url(fromB64url('AQID_-8'))).toBe('AQID_-8');
    expect(() => fromB64url('a+b')).toThrow();
    const raw = new Uint8Array(64).map((_, i) => (i === 0 || i === 32 ? 0x80 : i));
    expect(derToRaw(rawToDer(raw))).toEqual(raw);
    expect(parseAuthData(new Uint8Array(37).fill(0).map((_, i) => (i === 32 ? 0x05 : i === 36 ? 7 : 0)))).toMatchObject({ userPresent: true, userVerified: true, signCount: 7 });
    expect(() => parseAuthData(new Uint8Array(10))).toThrow();
  });
});
