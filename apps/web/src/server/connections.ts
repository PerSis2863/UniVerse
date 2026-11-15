import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';
import { BadRequestException, ForbiddenException, NotFoundException } from './http';
import { canSeal, isSealed, open, seal } from './secret-box';

// M182 (and M200): connections to outside services, one place for all of them.
//  - Each service is off until the owner registers an app with its maker and sets that app's keys in
//    Cloudflare (`*_CLIENT_ID`, `*_CLIENT_SECRET`), and SESSION_SECRET (32+ characters) is set: the
//    tokens are encrypted with it (secret-box.ts) and never sent to a browser.
//  - Connecting: POST …/start (signed in) answers the service's sign-in address and sets a short-lived
//    cookie; the service sends the person back to /api/connections/callback, which checks that cookie
//    against the sealed `state` (so nobody can attach their own account to someone else's, or theirs to
//    someone else's) and, for Google and Microsoft, proves the start with PKCE.
//  - Smallest scopes that do the job (read only). Mail and events are read live when the person opens
//    them, never copied into the database. Disconnecting revokes the token where the service allows it.

export type Provider = 'google' | 'microsoft' | 'slack';
export type Kind = 'mail' | 'chat' | 'calendar' | 'classroom';
interface Service { name: string; provider: Provider; kind: Kind; scopes: string[]; roles?: string[] }

export const SERVICES: Record<string, Service> = {
  gmail: { name: 'Gmail', provider: 'google', kind: 'mail', scopes: ['openid', 'email', 'https://www.googleapis.com/auth/gmail.readonly'] },
  outlook: { name: 'Outlook', provider: 'microsoft', kind: 'mail', scopes: ['offline_access', 'User.Read', 'Mail.Read'] },
  slack: { name: 'Slack', provider: 'slack', kind: 'chat', scopes: ['im:read', 'im:history', 'users:read'] },
  'google-calendar': { name: 'Google Calendar', provider: 'google', kind: 'calendar', scopes: ['openid', 'email', 'https://www.googleapis.com/auth/calendar.readonly'] },
  'outlook-calendar': { name: 'Outlook Calendar', provider: 'microsoft', kind: 'calendar', scopes: ['offline_access', 'User.Read', 'Calendars.Read'] },
  classroom: {
    name: 'Google Classroom', provider: 'google', kind: 'classroom', roles: ['TEACHER', 'ADMIN'],
    scopes: ['openid', 'email', 'https://www.googleapis.com/auth/classroom.courses.readonly', 'https://www.googleapis.com/auth/classroom.rosters.readonly', 'https://www.googleapis.com/auth/classroom.profile.emails', 'https://www.googleapis.com/auth/classroom.coursework.students.readonly'],
  },
};

const PROVIDERS: Record<Provider, { auth: string; token: string; id: string; secret: string; pkce: boolean; revoke?: (token: string) => Promise<unknown> }> = {
  google: {
    auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token', id: 'GOOGLE_CLIENT_ID', secret: 'GOOGLE_CLIENT_SECRET', pkce: true,
    revoke: (t) => fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t)}`, { method: 'POST' }),
  },
  microsoft: { auth: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize', token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token', id: 'MICROSOFT_CLIENT_ID', secret: 'MICROSOFT_CLIENT_SECRET', pkce: true },
  slack: {
    auth: 'https://slack.com/oauth/v2/authorize', token: 'https://slack.com/api/oauth.v2.access', id: 'SLACK_CLIENT_ID', secret: 'SLACK_CLIENT_SECRET', pkce: false,
    revoke: (t) => fetch('https://slack.com/api/auth.revoke', { method: 'POST', headers: { Authorization: `Bearer ${t}` } }),
  },
};

/** Services that can't be connected by a person here, and why (shown on the Connections tab). */
export const ELSEWHERE = [
  { id: 'telegram', name: 'Telegram', why: 'Telegram only lets a bot read messages people send to that bot. The owner can add a UniVerse bot later.' },
  { id: 'whatsapp', name: 'WhatsApp', why: 'WhatsApp works through a paid business number (Twilio), already used for Relief’s text requests. Not for personal chats.' },
  { id: 'discord', name: 'Discord', why: 'Discord only lets a bot read servers it was added to, not your own messages.' },
  { id: 'linkedin', name: 'LinkedIn', why: 'LinkedIn doesn’t let other apps read or send its messages (only its approved partners). Add your LinkedIn profile link in Settings → Profile instead.' },
];

const env = (k: string) => (process.env[k] ?? '').trim();
export const available = (id: string) => { const s = SERVICES[id]; return !!s && canSeal() && !!env(PROVIDERS[s.provider].id) && !!env(PROVIDERS[s.provider].secret); };
const allowed = (s: Service, user: SessionUser) => !s.roles || s.roles.includes(user.role) || user.owner === true;
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64url');
const random = (n = 32) => b64(crypto.getRandomValues(new Uint8Array(n)));
const challenge = async (verifier: string) => b64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
export const COOKIE = 'uv_connect';
const TEN_MIN = 10 * 60_000;
const RETURNS = /^\/(student|teacher|admin|parent)\/(inbox|settings|calendar|courses)(\?[\w=&-]*)?$/;

/** GET /api/connections: every service, whether it can be connected here, and mine. */
export async function listConnections(user: SessionUser) {
  const mine = await prisma.oAuthConnection.findMany({ where: { userId: user.id }, select: { service: true, account: true, createdAt: true } });
  return {
    services: Object.entries(SERVICES).filter(([, s]) => allowed(s, user)).map(([id, s]) => {
      const c = mine.find((m) => m.service === id);
      return { id, name: s.name, kind: s.kind, available: available(id), connected: c ? { account: c.account, since: c.createdAt } : null };
    }),
    elsewhere: ELSEWHERE,
  };
}

/** POST /api/connections/:service/start { back? }: the service's sign-in address, and the cookie that binds it to this browser. */
export async function startConnection(user: SessionUser, id: string, origin: string, back: unknown) {
  const s = SERVICES[id];
  if (!s || !allowed(s, user)) throw new NotFoundException('That service isn’t here.');
  if (!available(id)) throw new BadRequestException(`${s.name} isn’t set up on UniVerse yet. The site’s owner needs to add it first.`);
  const p = PROVIDERS[s.provider], nonce = random(), verifier = random(48);
  const state = await seal(JSON.stringify({ u: user.id, s: id, n: nonce, v: verifier, t: Date.now(), b: typeof back === 'string' && RETURNS.test(back) ? back : null }), 'oauth-state');
  const q = new URLSearchParams({ client_id: env(p.id), redirect_uri: `${origin}/api/connections/callback`, response_type: 'code', state });
  if (s.provider === 'slack') q.set('user_scope', s.scopes.join(','));
  else q.set('scope', s.scopes.join(' '));
  if (s.provider === 'google') { q.set('access_type', 'offline'); q.set('prompt', 'consent'); q.set('include_granted_scopes', 'false'); }
  if (p.pkce) { q.set('code_challenge', await challenge(verifier)); q.set('code_challenge_method', 'S256'); }
  return { url: `${p.auth}?${q}`, nonce };
}

interface Tokens { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; authed_user?: { id?: string; access_token?: string } }

/** GET /api/connections/callback: checks the state against this browser's cookie, keeps the encrypted tokens. Returns where to go. */
export async function finishConnection(params: URLSearchParams, cookieNonce: string | null, origin: string): Promise<string> {
  // Only a state sealed here (an unsealed value would be read as plain text by open()).
  const sealed = params.get('state') ?? '';
  const raw = isSealed(sealed) ? await open(sealed, 'oauth-state').catch(() => null) : null;
  let st: { u: string; s: string; n: string; v: string; t: number; b: string | null } | null = null;
  try { st = raw ? JSON.parse(raw) : null; } catch { st = null; }
  if (!st || !cookieNonce || st.n !== cookieNonce || Date.now() - st.t > TEN_MIN || !SERVICES[st.s]) throw new ForbiddenException('That connection link expired or wasn’t started here. Try again.');
  const back = st.b ?? '/student/inbox?space=connections';
  if (params.get('error') || !params.get('code')) return `${back}${back.includes('?') ? '&' : '?'}connected=cancelled`;
  const s = SERVICES[st.s], p = PROVIDERS[s.provider];
  const body = new URLSearchParams({ client_id: env(p.id), client_secret: env(p.secret), code: params.get('code')!, redirect_uri: `${origin}/api/connections/callback`, grant_type: 'authorization_code' });
  if (p.pkce) body.set('code_verifier', st.v);
  const res = await fetch(p.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const tok = (await res.json().catch(() => ({}))) as Tokens;
  const access = s.provider === 'slack' ? tok.authed_user?.access_token : tok.access_token;
  if (!res.ok || !access) throw new BadRequestException(`${s.name} didn’t connect. Try again.`);
  const account = await accountName(s.provider, access, tok).catch(() => null);
  const data = {
    account, access: await seal(access, `oauth:${st.s}`), refresh: tok.refresh_token ? await seal(tok.refresh_token, `oauth:${st.s}`) : null,
    expiresAt: tok.expires_in ? new Date(Date.now() + (tok.expires_in - 60) * 1000) : null, updatedAt: new Date(),
  };
  await prisma.oAuthConnection.upsert({ where: { userId_service: { userId: st.u, service: st.s } }, update: data, create: { userId: st.u, service: st.s, ...data } });
  return `${back}${back.includes('?') ? '&' : '?'}connected=${st.s}`;
}

/** Which account was connected (its address or name), to show it. */
async function accountName(provider: Provider, access: string, tok: Tokens): Promise<string | null> {
  if (provider === 'google' && tok.id_token) {
    const part = tok.id_token.split('.')[1];
    return (JSON.parse(Buffer.from(part, 'base64url').toString()) as { email?: string }).email ?? null;
  }
  if (provider === 'microsoft') {
    const me = (await (await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName', { headers: { Authorization: `Bearer ${access}` } })).json()) as { mail?: string; userPrincipalName?: string };
    return me.mail ?? me.userPrincipalName ?? null;
  }
  const who = (await (await fetch('https://slack.com/api/auth.test', { headers: { Authorization: `Bearer ${access}` } })).json()) as { user?: string; team?: string };
  return who.user ? `${who.user}${who.team ? ` · ${who.team}` : ''}` : null;
}

/** A live access token for one of my connections (refreshed when it ran out), or null when it isn't connected. */
export async function accessFor(userId: string, id: string): Promise<string | null> {
  const s = SERVICES[id];
  const row = s ? await prisma.oAuthConnection.findUnique({ where: { userId_service: { userId, service: id } } }) : null;
  if (!s || !row) return null;
  if (!row.expiresAt || row.expiresAt > new Date()) return open(row.access, `oauth:${id}`);
  const refresh = await open(row.refresh, `oauth:${id}`);
  if (!refresh) return null;
  const p = PROVIDERS[s.provider];
  const res = await fetch(p.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: env(p.id), client_secret: env(p.secret), refresh_token: refresh, grant_type: 'refresh_token', ...(s.provider === 'microsoft' ? { scope: s.scopes.join(' ') } : {}) }) });
  const tok = (await res.json().catch(() => ({}))) as Tokens;
  if (!res.ok || !tok.access_token) return null;
  await prisma.oAuthConnection.update({
    where: { id: row.id },
    data: { access: await seal(tok.access_token, `oauth:${id}`), ...(tok.refresh_token ? { refresh: await seal(tok.refresh_token, `oauth:${id}`) } : {}), expiresAt: tok.expires_in ? new Date(Date.now() + (tok.expires_in - 60) * 1000) : null, updatedAt: new Date() },
  });
  return tok.access_token;
}

/** DELETE /api/connections/:service: revoked at the service where it allows that, and forgotten here. */
export async function disconnect(user: SessionUser, id: string) {
  const s = SERVICES[id];
  const row = s ? await prisma.oAuthConnection.findUnique({ where: { userId_service: { userId: user.id, service: id } } }) : null;
  if (!s || !row) return { ok: true };
  const token = await open(row.refresh ?? row.access, `oauth:${id}`).catch(() => null);
  if (token) await PROVIDERS[s.provider].revoke?.(token).catch(() => null);
  await prisma.oAuthConnection.delete({ where: { id: row.id } });
  return { ok: true };
}
