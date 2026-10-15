'use client';

import { useSyncExternalStore } from 'react';
import { api } from './api';

// Passkeys in the browser (Stage 5 · A8): make one (Settings → Privacy & Security), sign in with one
// (the sign-in page), or use one as an admin's second step instead of the emailed code. The server
// side is src/server/passkeys.ts; the checks src/lib/webauthn.ts.

const b64 = (buf: ArrayBuffer) => {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

/** This browser can make and use passkeys (and give the server the passkey's public key). */
export function passkeysSupported(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential && typeof AuthenticatorAttestationResponse !== 'undefined' && 'getPublicKey' in AuthenticatorAttestationResponse.prototype;
}

const noop = () => () => {};
/** passkeysSupported() for a component: null while the page is built or hydrating, then the answer. */
export const usePasskeysSupported = (): boolean | null => useSyncExternalStore(noop, passkeysSupported, () => null);

/** A person-friendly message for a passkey that didn't work (cancelled, no passkey on this device…). */
export function passkeyError(e: unknown): string {
  const name = (e as { name?: string } | null)?.name;
  if (name === 'NotAllowedError' || name === 'AbortError') return 'Cancelled, or this device has no passkey for UniVerse.';
  if (name === 'InvalidStateError') return 'This device already has a passkey for your account.';
  if (name === 'SecurityError') return 'Passkeys only work on the UniVerse website address.';
  return (e as Error)?.message || 'The passkey didn’t work. Try again.';
}

interface Options { challenge: string; rpId: string; credentialIds?: string[]; user?: { id: string; name: string; displayName: string } }

const ALGS = [-8, -7, -257].map((alg) => ({ type: 'public-key' as const, alg }));

/** Makes a passkey on this device and saves it to the account. */
export async function addPasskey(name?: string) {
  const { data: o } = await api.post<Options>('/auth/passkeys/options');
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: unb64(o.challenge),
      rp: { id: o.rpId, name: 'UniVerse' },
      user: { id: unb64(o.user!.id), name: o.user!.name, displayName: o.user!.displayName },
      pubKeyCredParams: ALGS,
      excludeCredentials: (o.credentialIds ?? []).map((id) => ({ type: 'public-key' as const, id: unb64(id) })),
      authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
      attestation: 'none',
      timeout: 120_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('No passkey was made.');
  const r = cred.response as AuthenticatorAttestationResponse;
  const key = r.getPublicKey();
  if (!key) throw new Error('This device’s passkey type isn’t supported. Try another device.');
  const { data } = await api.post('/auth/passkeys', {
    id: b64(cred.rawId),
    clientDataJSON: b64(r.clientDataJSON),
    authenticatorData: b64(r.getAuthenticatorData()),
    publicKey: b64(key),
    alg: r.getPublicKeyAlgorithm(),
    ...(name ? { name } : {}),
  });
  return data as { id: string; name: string; createdAt: string; lastUsedAt: string | null };
}

/** Asks the device for a passkey answer to `o` (any of the account's passkeys when ids are given). */
async function answer(o: Options) {
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: unb64(o.challenge),
      rpId: o.rpId,
      allowCredentials: (o.credentialIds ?? []).map((id) => ({ type: 'public-key' as const, id: unb64(id) })),
      userVerification: 'required',
      timeout: 120_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('No passkey was used.');
  const r = cred.response as AuthenticatorAssertionResponse;
  return { id: b64(cred.rawId), clientDataJSON: b64(r.clientDataJSON), authenticatorData: b64(r.authenticatorData), signature: b64(r.signature) };
}

/** Signs in with a passkey on this device: returns UniVerse's session token for it. */
export async function signInWithPasskey(): Promise<string> {
  const { data: o } = await api.post<Options>('/auth/passkeys/sign-in/options');
  const { data } = await api.post<{ accessToken: string }>('/auth/passkeys/sign-in', await answer(o));
  return data.accessToken;
}

/** An admin's second sign-in step with a passkey instead of the emailed code: returns the pass. */
export async function passkeyTwoStep(): Promise<string> {
  const { data: o } = await api.post<Options>('/auth/two-step/passkey/options');
  const { data } = await api.post<{ pass: string }>('/auth/two-step/passkey', await answer(o));
  return data.pass;
}
