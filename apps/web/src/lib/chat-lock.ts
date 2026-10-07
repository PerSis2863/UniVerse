'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Chat lock (Stage 4 · 1.10): chosen chats stay hidden on this device until you unlock them with
// the device's own Face ID, fingerprint or PIN (a WebAuthn passkey made only for this). It's a
// privacy screen for a shared or borrowed phone, kept on this device: nothing goes to the server,
// and other devices aren't locked. Unlocking opens every locked chat until the app has been in
// the background for a minute (or the page is reloaded).

interface LockStore {
  credId: string | null; // the passkey's id (base64url)
  chats: string[];
  unlocked: boolean;
  setCred: (id: string | null) => void;
  toggle: (chatId: string, on: boolean) => void;
  setUnlocked: (v: boolean) => void;
}

export const useChatLock = create<LockStore>()(
  persist(
    (set) => ({
      credId: null,
      chats: [],
      unlocked: false,
      setCred: (credId) => set({ credId }),
      toggle: (chatId, on) => set((s) => ({ chats: on ? [...new Set([...s.chats, chatId])] : s.chats.filter((c) => c !== chatId) })),
      setUnlocked: (unlocked) => set({ unlocked }),
    }),
    // Being unlocked is never saved: a reload locks again.
    { name: 'universe-chat-lock', partialize: (s) => ({ credId: s.credId, chats: s.chats }) },
  ),
);

const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const challenge = () => crypto.getRandomValues(new Uint8Array(32));

/** This device can check it's you (Face ID, fingerprint, Windows Hello, a PIN). */
export async function lockSupported(): Promise<boolean> {
  try {
    return typeof window !== 'undefined' && !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch { return false; }
}

/** Makes this device's chat-lock passkey (asks for Face ID / fingerprint / PIN once). */
async function makeKey(): Promise<string> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: challenge(),
      rp: { name: 'UniVerse chat lock' },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'chat-lock', displayName: 'UniVerse chat lock' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      timeout: 60_000,
      attestation: 'none',
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('No passkey was made.');
  return b64(cred.rawId);
}

/** Asks for Face ID / fingerprint / PIN. Resolves true when it was you. */
export async function verifyMe(): Promise<boolean> {
  const { credId, setCred } = useChatLock.getState();
  if (!credId) { setCred(await makeKey()); return true; }
  const got = await navigator.credentials.get({
    publicKey: { challenge: challenge(), allowCredentials: [{ type: 'public-key', id: unb64(credId) }], userVerification: 'required', timeout: 60_000 },
  }).catch(() => null);
  return !!got;
}

/** Locks or unlocks a chat (both need Face ID / fingerprint / PIN). */
export async function setChatLocked(chatId: string, on: boolean): Promise<boolean> {
  if (!(await verifyMe())) return false;
  useChatLock.getState().toggle(chatId, on);
  useChatLock.getState().setUnlocked(!on);
  return true;
}

/** Relocks after a minute in the background. Call once (the chats screen). */
export function watchRelock(): () => void {
  let hiddenAt = 0;
  const onVis = () => {
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > 60_000) useChatLock.getState().setUnlocked(false);
  };
  document.addEventListener('visibilitychange', onVis);
  return () => document.removeEventListener('visibilitychange', onVis);
}
