import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import prisma from '@/lib/db';
import { PASSKEY_ALGS, fromB64url, parseAuthData, readClientData, checkClientData, toB64url, usableKey, verifyAssertion, type Expected } from '@/lib/webauthn';
import { describeDevice } from '@/lib/device-name';
import { BadRequestException, UnauthorizedException } from './http';

// Passkeys (Stage 5 · A8): sign in with the device's fingerprint, face or PIN instead of a password,
// and, for admins, instead of the emailed code. The checking is in src/lib/webauthn.ts; this file
// hands out challenges and keeps the passkeys (table "passkeys", migration 0130).
//
// Challenges are stateless: "<purpose>.<user>.<time>.<random>" signed with SESSION_SECRET, good for
// 5 minutes. A passkey remembers the newest challenge time it answered, so an answer can't be used
// twice. Off when SESSION_SECRET is missing (a passkey sign-in ends with a UniVerse session token,
// signed with it).

export type Purpose = 'register' | 'signin' | 'two-step';
const TTL_MS = 5 * 60_000;
const MAX_PER_USER = 10;

const secret = () => {
  const s = process.env.SESSION_SECRET;
  return s && s.length >= 32 ? s : null;
};
export const passkeysEnabled = () => secret() !== null;
const mac = (text: string) => createHmac('sha256', secret()!).update(`passkey:${text}`).digest('base64url');

/** A new challenge (base64url, as the browser will echo it in its client data). */
export function issueChallenge(purpose: Purpose, userId = '', now = Date.now()): string {
  const body = `${purpose}.${userId}.${now.toString(36)}.${randomBytes(12).toString('base64url')}`;
  return toB64url(new TextEncoder().encode(`${body}.${mac(body)}`));
}

/** The challenge's time (ms) when it is ours, for this purpose and user, and recent; otherwise null. */
export function challengeTime(challenge: string, purpose: Purpose, userId = '', now = Date.now()): number | null {
  if (!secret()) return null;
  let text: string;
  try {
    text = new TextDecoder().decode(fromB64url(challenge));
  } catch {
    return null;
  }
  const parts = text.split('.');
  if (parts.length !== 5) return null;
  const [p, u, t, , sig] = parts;
  const want = Buffer.from(mac(parts.slice(0, 4).join('.')));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const at = parseInt(t, 36);
  if (p !== purpose || u !== userId || !Number.isFinite(at) || at > now + 60_000 || now - at > TTL_MS) return null;
  return at;
}

/** The site a passkey belongs to: this address's domain, and the pages allowed to use it. */
export function relyingParty(req: Request): { rpId: string; origins: string[] } {
  const url = new URL(req.url);
  const origins = new Set([url.origin]);
  const app = process.env.NEXT_PUBLIC_APP_URL;
  if (app) try { origins.add(new URL(app).origin); } catch { /* not a URL */ }
  return { rpId: url.hostname, origins: [...origins] };
}

const expected = (req: Request, type: Expected['type'], purpose: Purpose, userId = ''): Expected => ({
  type,
  ...relyingParty(req),
  challengeOk: (c) => challengeTime(c, purpose, userId) !== null,
});

/** What the browser needs to make or use a passkey. */
export async function passkeyOptions(req: Request, purpose: Purpose, user?: { id: string; name: string; email: string }) {
  if (!passkeysEnabled()) throw new BadRequestException('Passkeys are not switched on for this site yet.');
  const { rpId } = relyingParty(req);
  const challenge = issueChallenge(purpose, purpose === 'signin' ? '' : user?.id ?? '');
  if (purpose === 'signin') return { challenge, rpId };
  if (!user) throw new UnauthorizedException('Please sign in.');
  const mine = await prisma.passkey.findMany({ where: { userId: user.id }, select: { credentialId: true } });
  if (purpose === 'two-step' && !mine.length) throw new BadRequestException('You have no passkey yet.');
  return {
    challenge,
    rpId,
    credentialIds: mine.map((p) => p.credentialId),
    ...(purpose === 'register' ? { user: { id: toB64url(new TextEncoder().encode(user.id)), name: user.email, displayName: user.name } } : {}),
  };
}

const b64 = (v: unknown, max: number) => {
  if (typeof v !== 'string' || !v || v.length > max) throw new BadRequestException('Unreadable passkey answer.');
  try {
    return fromB64url(v);
  } catch {
    throw new BadRequestException('Unreadable passkey answer.');
  }
};

/** Saves a new passkey for `user` (the browser's answer to navigator.credentials.create). */
export async function registerPasskey(req: Request, user: { id: string }, body: Record<string, unknown>) {
  if (!passkeysEnabled()) throw new BadRequestException('Passkeys are not switched on for this site yet.');
  const credentialId = typeof body.id === 'string' && /^[A-Za-z0-9_-]{16,1400}$/.test(body.id) ? body.id : null;
  if (!credentialId) throw new BadRequestException('Unreadable passkey answer.');
  const clientDataJSON = b64(body.clientDataJSON, 4000);
  const authenticatorData = b64(body.authenticatorData, 4000);
  const spki = b64(body.publicKey, 2000);
  const alg = Number(body.alg);
  if (!Object.values(PASSKEY_ALGS).includes(alg as -7) || !(await usableKey(spki, alg))) throw new BadRequestException("This device's passkey type isn't supported. Try another device.");
  let bad: string | null;
  try {
    bad = checkClientData(readClientData(clientDataJSON), expected(req, 'webauthn.create', 'register', user.id));
    const auth = parseAuthData(authenticatorData);
    const { rpId } = relyingParty(req);
    const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(rpId)));
    if (!bad && !auth.rpIdHash.every((x, i) => x === rpHash[i])) bad = 'Passkey is for another site';
    if (!bad && !auth.userVerified) bad = 'The device did not check it was you';
  } catch {
    bad = 'Unreadable passkey answer';
  }
  if (bad) throw new BadRequestException(`${bad}.`);
  const count = await prisma.passkey.count({ where: { userId: user.id } });
  if (count >= MAX_PER_USER) throw new BadRequestException(`You can have up to ${MAX_PER_USER} passkeys. Remove one first.`);
  const name = (typeof body.name === 'string' && body.name.trim() ? body.name.trim() : describeDevice(req.headers.get('user-agent')) ?? 'Passkey').slice(0, 60);
  const exists = await prisma.passkey.findUnique({ where: { credentialId }, select: { id: true } });
  if (exists) throw new BadRequestException('This passkey is already added.');
  return prisma.passkey.create({
    data: { userId: user.id, credentialId, publicKey: toB64url(spki), alg, name },
    select: { id: true, name: true, createdAt: true, lastUsedAt: true },
  });
}

/**
 * Checks a passkey answer (navigator.credentials.get). For sign-in any user's passkey; for the
 * two-step only `userId`'s. Returns the passkey's owner. Records the use, so the answer can't be
 * used again.
 */
export async function usePasskey(req: Request, purpose: 'signin' | 'two-step', body: Record<string, unknown>, userId?: string) {
  if (!passkeysEnabled()) throw new BadRequestException('Passkeys are not switched on for this site yet.');
  const credentialId = typeof body.id === 'string' && body.id.length <= 1400 ? body.id : '';
  const key = credentialId ? await prisma.passkey.findUnique({ where: { credentialId } }) : null;
  const fail = () => new UnauthorizedException("That passkey didn't work. Try again, or sign in another way.");
  if (!key || (purpose === 'two-step' && key.userId !== userId)) throw fail();
  const clientDataJSON = b64(body.clientDataJSON, 4000);
  const forUser = purpose === 'two-step' ? key.userId : '';
  let at: number | null = null;
  try {
    at = challengeTime(readClientData(clientDataJSON).challenge, purpose, forUser);
  } catch {
    throw fail();
  }
  // Each answer once: its challenge must be newer than the last one this passkey answered.
  if (at === null || at <= key.lastChallengeAt) throw fail();
  const result = await verifyAssertion({
    spki: fromB64url(key.publicKey),
    alg: key.alg,
    storedCount: key.signCount,
    clientDataJSON,
    authenticatorData: b64(body.authenticatorData, 4000),
    signature: b64(body.signature, 2000),
    expected: expected(req, 'webauthn.get', purpose, forUser),
  });
  if (!result.ok) throw fail();
  // Only if no other request used this answer meanwhile (the time check above, done atomically).
  const saved = await prisma.passkey.updateMany({
    where: { id: key.id, lastChallengeAt: { lt: at } },
    data: { signCount: result.signCount, lastChallengeAt: at, lastUsedAt: new Date() },
  });
  if (!saved.count) throw fail();
  return key.userId;
}
