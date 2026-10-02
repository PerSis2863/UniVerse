import { errors as joseErrors, jwtVerify, type JWTPayload } from 'jose';
import { ownerEmailList } from '@/lib/owner-emails';
import { jwksFor, keysMayHaveRotated } from './jwks-cache';
import type { User } from '@prisma/client';
import prisma from '@/lib/db';
import { ForbiddenException, UnauthorizedException } from './http';
import { isSessionToken, verifySessionToken } from './session-token';

// Turns a bearer token into a platform user (ported from the old NestJS API).
// Accepts Firebase ID tokens (verified against Google's public keys, no firebase-admin needed) and,
// for allowlisted demo accounts only when demo login is enabled, "mock-token-<email|id>" tokens.

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
/** Google's signing keys. For local testing only, FIREBASE_TEST_JWKS_URL may point at a key server
 *  on this machine; deployed Workers can't reach localhost, so it has no effect in production. */
const firebaseJwksUrl = () => {
  const test = process.env.FIREBASE_TEST_JWKS_URL;
  return test && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(test) ? test : GOOGLE_JWKS_URL;
};

function firebaseProjectId() {
  return process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'universe-71e68';
}

interface FirebaseClaims extends JWTPayload {
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
  phone_number?: string;
  firebase?: { sign_in_provider?: string };
}

/** Verifies a Firebase ID token the same way firebase-admin's verifyIdToken does. */
export async function verifyFirebaseIdToken(token: string): Promise<FirebaseClaims & { uid: string }> {
  const projectId = firebaseProjectId();
  const options = { issuer: `https://securetoken.google.com/${projectId}`, audience: projectId, algorithms: ['RS256'] };
  let payload: FirebaseClaims;
  try {
    ({ payload } = await jwtVerify<FirebaseClaims>(token, await jwksFor(firebaseJwksUrl()), options));
  } catch (e) {
    if (!keysMayHaveRotated(e)) throw e;
    // Google rotates its keys every few hours: download them again once.
    ({ payload } = await jwtVerify<FirebaseClaims>(token, await jwksFor(firebaseJwksUrl(), true), options));
  }
  if (!payload.sub) throw new Error('Token has no subject');
  if (typeof payload.auth_time === 'number' && payload.auth_time * 1000 > Date.now() + 60_000) {
    throw new Error('Token auth_time is in the future');
  }
  return { ...payload, uid: payload.sub };
}

// ─── Demo login ────────────────────────────────────────────

const DEFAULT_DEMO_EMAILS = ['demo@student.com', 'demo@teacher.com', 'demo@admin.com', 'it-support@universe.com'];

export function isDemoLoginEnabled(): boolean {
  const flag = process.env.DEMO_LOGIN_ENABLED;
  if (flag !== undefined) return flag.trim().toLowerCase() === 'true';
  return process.env.NODE_ENV !== 'production';
}

export function isDemoAccount(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.DEMO_ACCOUNT_EMAILS;
  const list = (raw && raw.trim() ? raw.split(',') : DEFAULT_DEMO_EMAILS).map((e) => e.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

/**
 * The demo admin account is read-only: anyone can sign in as it when demo login is on, so it
 * must not be able to change real people's roles, accounts, grades or credentials. It can still
 * browse, chat and read notifications.
 */
const DEMO_ADMIN_WRITABLE = /^\/api\/(chat\/|notifications|realtime\/|core\/notifications\/|core\/auth\/session$|core\/users\/me\/terms$|bootstrap$|boards(\/|$))/;
export function demoWriteBlocked(req: Request, user: { role: string }, token: string | null): boolean {
  if (!token?.startsWith('mock-token-') || user.role !== 'ADMIN') return false;
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return false;
  return !DEMO_ADMIN_WRITABLE.test(new URL(req.url).pathname);
}

// ─── Token → user ───────────────────────────────────────────────────────────────────────────────

export function extractBearer(value: string | undefined | null): string | null {
  if (!value || typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.toLowerCase().startsWith('bearer ')) return trimmed.slice(7).trim() || null;
  return trimmed || null;
}

// Verified tokens → user, kept for up to a minute per Worker instance so each API call doesn't
// pay a database round trip just to identify the caller. Entries never outlive the token itself,
// and are dropped when that user's role, status or profile changes (forgetUser).
const CACHE_MS = 60_000;
const MAX_ENTRIES = 1000;
const verified = new Map<string, { user: User; until: number }>();

function remember(token: string, user: User, tokenExp?: number) {
  const until = Math.min(Date.now() + CACHE_MS, tokenExp ? tokenExp * 1000 : Infinity);
  if (verified.size >= MAX_ENTRIES) verified.delete(verified.keys().next().value as string);
  verified.set(token, { user, until });
}

/** Call after changing a user's role, status or profile so the next request reloads it. */
export function forgetUser(userId: string) {
  for (const [token, entry] of verified) if (entry.user.id === userId) verified.delete(token);
}

/** Fetches Google's signing keys ahead of the first sign-in (used by the warm-up call). */
export async function warmFirebaseKeys() {
  try {
    await jwksFor(firebaseJwksUrl(), true);
  } catch {
    // best effort
  }
}

export async function resolveUser(token: string | null): Promise<User> {
  if (!token) throw new UnauthorizedException('Missing authentication token');
  const cached = verified.get(token);
  let user: User;
  if (cached && cached.until > Date.now()) {
    user = cached.user;
  } else {
    user = await resolveUserUncached(token);
    remember(token, user, token.startsWith('mock-token-') ? undefined : decodeExp(token));
  }
  // An admin can suspend an account (Users → Deactivate); it then can't use the platform.
  if (user.status === 'SUSPENDED') throw new ForbiddenException('Your account has been suspended. Please contact your administrator.');
  // "Sign out everywhere" (Settings, or the owner console): sign-ins from before then are refused.
  if (user.signedOutAt) {
    const started = signInTime(token);
    if (started !== null && started * 1000 < new Date(user.signedOutAt).getTime()) {
      throw new UnauthorizedException({ message: 'You were signed out on all devices. Please sign in again.', code: 'SIGNED_OUT', error: 'Unauthorized' });
    }
  }
  return user;
}

/** When the sign-in behind a token happened (seconds): Firebase auth_time, or a session token's iat. */
function signInTime(token: string): number | null {
  if (token.startsWith('mock-token-')) return null;
  try {
    const body = token.startsWith('ut1.') ? token.slice(4).split('.')[0] : token.split('.')[1];
    const claims = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    const t = token.startsWith('ut1.') ? claims.iat : claims.auth_time;
    return typeof t === 'number' ? t : null;
  } catch {
    return null;
  }
}

function decodeExp(token: string): number | undefined {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp : undefined;
  } catch {
    return undefined;
  }
}

async function resolveUserUncached(token: string): Promise<User> {
  // UniVerse's own session tokens (people who signed in from their LMS via LTI).
  if (isSessionToken(token)) {
    const uid = verifySessionToken(token);
    const user = uid ? await prisma.user.findUnique({ where: { id: uid } }) : null;
    if (!user) throw new UnauthorizedException('Your session has expired. Please open UniVerse again from your course.');
    return user;
  }

  if (token.startsWith('mock-token-')) {
    if (!isDemoLoginEnabled()) throw new UnauthorizedException('Demo login is disabled');
    const identifier = token.slice('mock-token-'.length);
    const user = identifier.includes('@')
      ? await prisma.user.findUnique({ where: { email: identifier } })
      : await prisma.user.findUnique({ where: { id: identifier } });
    if (!user || !isDemoAccount(user.email)) throw new UnauthorizedException('Invalid demo token');
    return user;
  }

  let decoded: Awaited<ReturnType<typeof verifyFirebaseIdToken>>;
  try {
    decoded = await verifyFirebaseIdToken(token);
  } catch (error) {
    const expired = error instanceof joseErrors.JWTExpired;
    if (!expired) console.warn(`Token verification failed: ${(error as Error).message}`);
    throw new UnauthorizedException(expired ? 'Authentication token expired' : 'Invalid authentication token');
  }

  // Email + password accounts must prove the address is theirs (the link Firebase emails them)
  // before they can use UniVerse; otherwise anyone could sign up with any address.
  if (decoded.firebase?.sign_in_provider === 'password' && decoded.email_verified !== true) {
    throw new ForbiddenException({ message: `Please verify your email address first: open the link we sent to ${decoded.email ?? 'your inbox'}.`, code: 'EMAIL_NOT_VERIFIED', error: 'Forbidden' });
  }

  const firebaseUid = decoded.uid;
  let user = await prisma.user.findUnique({ where: { firebaseUid } });

  if (!user && decoded.email) {
    // Link an existing account (e.g. created before Google sign-in) by email, but only when the
    // sign-in proves ownership of the email and the account isn't tied to another sign-in.
    // Otherwise anyone could claim an existing account (including an admin's) by registering
    // with its email address.
    const byEmail = await prisma.user.findUnique({ where: { email: decoded.email } });
    if (byEmail) {
      if (byEmail.firebaseUid && byEmail.firebaseUid !== firebaseUid) {
        throw new UnauthorizedException('This email is already linked to a different sign-in method.');
      }
      if (!decoded.email_verified) {
        throw new UnauthorizedException('Please sign in with Google or verify your email address to access this account.');
      }
      user = await prisma.user.update({ where: { email: decoded.email }, data: { firebaseUid } });
    }
  }

  if (!user) {
    if (!decoded.email && !decoded.phone_number) {
      throw new UnauthorizedException('No email or phone associated with Firebase account');
    }
    user = await prisma.user.create({
      data: {
        firebaseUid,
        email: decoded.email || `${firebaseUid}@phone.local`,
        name: decoded.name || decoded.email?.split('@')[0] || 'User',
        role: 'STUDENT',
        avatar: decoded.picture || null,
      },
    });
  }

  // The platform owner: an email listed in the SUPER_ADMIN_EMAILS secret, proven by this sign-in
  // (Google marks the email verified). Never a demo token. The owner is always an active admin.
  if (decoded.email_verified === true && isOwnerEmail(decoded.email)) {
    if (user.role !== 'ADMIN' || user.status !== 'ACTIVE' || !user.onboardedAt) {
      user = await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN', status: 'ACTIVE', onboardedAt: user.onboardedAt ?? new Date() } });
    }
    OWNERS.add(user);
  }

  return user;
}

// ─── Owner (super admin) ────────────────────────────────────────────────────────────────────────

/** Emails of the platform owner(s), from the SUPER_ADMIN_EMAILS secret (comma separated). */
// Default when the secret isn't set: the platform owner's Google account. It still has to be proven
// by a Google sign-in (verified email), so knowing the address isn't enough.
export function ownerEmails(): string[] {
  return ownerEmailList(process.env.SUPER_ADMIN_EMAILS);
}

/** Whether this email belongs to the owner (used to protect the account from other admins). */
export function isOwnerEmail(email: string | null | undefined): boolean {
  return !!email && ownerEmails().includes(email.trim().toLowerCase());
}

// User objects resolved from an owner's verified sign-in (kept with the cached user, so it lasts
// exactly as long as that sign-in does).
const OWNERS = new WeakSet<User>();

/** True only for a request signed in as the owner with a verified Google sign-in. */
export function isOwner(user: User | null | undefined): boolean {
  return !!user && OWNERS.has(user) && isOwnerEmail(user.email);
}
