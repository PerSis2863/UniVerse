// A light path for the busiest small API calls. On the free Workers plan a request gets 10 ms of
// CPU; going through Next.js and Prisma costs a good part of that before any work is done, and a
// request over the limit takes down the others running next to it ("Worker exceeded CPU time
// limit", then "canceled… hung" 500s/503s). These calls are answered here with plain SQL instead.
//
// They must behave exactly like the Next.js routes they stand in for (named on each handler). When
// anything is unusual (no token, a new account, a suspended one, a demo admin writing, an error),
// the call returns null and the Next.js route answers as before.
import { jwtVerify, type JWTPayload } from 'jose';
import { ownerEmailList } from '../src/lib/owner-emails';
import { jwksFor, keysMayHaveRotated } from '../src/server/jwks-cache';
import { isSessionToken, verifySessionToken } from '../src/server/session-token';
import { hasPass, needsTwoStep } from '../src/server/two-step';
import { securityHeaders } from '../security-headers';
import { fileCsp } from '../src/lib/file-csp';
import { bool, dbDate, isoDate, json, parseJson, type Caller } from './fast-db';
import { conversations, notifications, presence, thread } from './fast-chat';

interface Env {
  DB?: D1Database;
  REALTIME?: { idFromName(name: string): DurableObjectId; get(id: DurableObjectId): { fetch(url: string, init?: RequestInit): Promise<Response> } };
}


// Token → caller for a minute per instance, like src/server/auth.ts (never past the token's expiry).
const callers = new Map<string, { caller: Caller; until: number }>();

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const DEFAULT_DEMO_EMAILS = ['demo@student.com', 'demo@teacher.com', 'demo@admin.com', 'it-support@universe.com'];

// Only when switched on explicitly; otherwise the Next.js route decides (it also allows it in development).
const demoLoginEnabled = () => process.env.DEMO_LOGIN_ENABLED?.trim().toLowerCase() === 'true';
function isDemoAccount(email: string) {
  const raw = process.env.DEMO_ACCOUNT_EMAILS;
  return (raw && raw.trim() ? raw.split(',') : DEFAULT_DEMO_EMAILS).map((e) => e.trim().toLowerCase()).includes(email.trim().toLowerCase());
}

async function firebaseUid(token: string): Promise<{ uid: string; exp?: number; authTime?: number } | null> {
  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'universe-71e68';
  const test = process.env.FIREBASE_TEST_JWKS_URL;
  const url = test && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(test) ? test : GOOGLE_JWKS_URL;
  const options = { issuer: `https://securetoken.google.com/${projectId}`, audience: projectId, algorithms: ['RS256'] };
  type Claims = JWTPayload & { email_verified?: boolean; firebase?: { sign_in_provider?: string } };
  let payload: Claims;
  try {
    ({ payload } = await jwtVerify<Claims>(token, await jwksFor(url), options));
  } catch (e) {
    if (!keysMayHaveRotated(e)) return null;
    try {
      ({ payload } = await jwtVerify<Claims>(token, await jwksFor(url, true), options));
    } catch {
      return null;
    }
  }
  if (!payload.sub) return null;
  if (typeof payload.auth_time === 'number' && payload.auth_time * 1000 > Date.now() + 60_000) return null;
  // Unverified email + password sign-ins get their explanation from the Next.js route.
  if (payload.firebase?.sign_in_provider === 'password' && payload.email_verified !== true) return null;
  return { uid: payload.sub, exp: payload.exp, authTime: typeof payload.auth_time === 'number' ? payload.auth_time : undefined };
}

/** When a (verified) "ut1." session token was issued, in seconds. */
function sessionIssuedAt(token: string): number | undefined {
  try {
    const { iat } = JSON.parse(atob(token.slice(4).split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))) as { iat?: unknown };
    return typeof iat === 'number' ? iat : undefined;
  } catch {
    return undefined;
  }
}

const USER_COLUMNS = 'SELECT id, name, email, role, status, signedOutAt FROM users WHERE';
type UserRow = { id: string; name: string; email: string; role: string; status: string; signedOutAt: string | null };

/** The signed-in caller, or null when the Next.js route should decide (see the top of the file). */
async function callerOf(request: Request, db: D1Database): Promise<Caller | null> {
  const header = request.headers.get('authorization')?.trim() ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  // Admins and the owner need the pass from the emailed sign-in code (src/server/two-step.ts);
  // without it the Next.js route answers (and asks for the code).
  const gate = (c: Caller | null) => (c && needsTwoStep(c.role, token) && !hasPass(request, c.id, token) ? null : c);
  const hit = callers.get(token);
  if (hit && hit.until > Date.now()) return gate(hit.caller);

  let row: UserRow | null = null;
  let exp: number | undefined;
  let authTime: number | undefined;
  let demo = false;
  if (isSessionToken(token)) {
    const uid = verifySessionToken(token);
    if (uid) row = await db.prepare(`${USER_COLUMNS} id = ?`).bind(uid).first<UserRow>();
    // The session's start (iat), so "sign out everywhere" applies here too (src/server/auth.ts signInTime).
    authTime = sessionIssuedAt(token);
  } else if (token.startsWith('mock-token-')) {
    if (!demoLoginEnabled()) return null;
    const who = token.slice('mock-token-'.length);
    row = await db.prepare(`${USER_COLUMNS} ${who.includes('@') ? 'email' : 'id'} = ?`).bind(who).first<UserRow>();
    if (row && !isDemoAccount(row.email)) return null;
    demo = true;
  } else {
    const verified = await firebaseUid(token);
    if (!verified) return null;
    exp = verified.exp;
    authTime = verified.authTime;
    // No account yet (first sign-in): the Next.js route creates or links it.
    row = await db.prepare(`${USER_COLUMNS} firebaseUid = ?`).bind(verified.uid).first<UserRow>();
  }
  if (!row || row.status === 'SUSPENDED') return null;
  // Signed out everywhere after this sign-in: the Next.js route explains.
  if (row.signedOutAt && authTime !== undefined && authTime * 1000 < Date.parse(isoDate(String(row.signedOutAt)) ?? '')) return null;
  const caller = { id: row.id, name: row.name, email: row.email, role: row.role, demo };
  if (callers.size >= 1000) callers.delete(callers.keys().next().value as string);
  callers.set(token, { caller, until: Math.min(Date.now() + 60_000, exp ? exp * 1000 : Infinity) });
  return gate(caller);
}

/** GET /api/chat/incoming (src/app/api/chat/incoming/route.ts): calls started in the last 45 s. */
async function incoming(me: Caller, db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT m.id, m.conversationId, m.metadata, m.createdAt, u.name AS senderName, u.avatar AS senderAvatar, c.isGroup, c.name AS conversationName
       FROM messages m JOIN users u ON u.id = m.senderId JOIN conversations c ON c.id = m.conversationId
       WHERE m.type = 'CALL' AND m.deletedAt IS NULL AND m.senderId != ?1 AND m.createdAt >= ?2
         AND EXISTS (SELECT 1 FROM conversation_participants p WHERE p.conversationId = m.conversationId AND p.userId = ?1)
       ORDER BY m.createdAt DESC LIMIT 3`,
    )
    .bind(me.id, dbDate(Date.now() - 45_000))
    .all<Record<string, string | number | null>>();
  const calls = results.map((r) => ({
    id: r.id,
    conversationId: r.conversationId,
    metadata: parseJson(r.metadata),
    createdAt: isoDate(r.createdAt as string),
    sender: { name: r.senderName, avatar: r.senderAvatar },
    conversation: { isGroup: !!r.isGroup, name: r.conversationName },
  }));
  return json(calls, 200, { 'Cache-Control': 'no-store' });
}

/** POST /api/chat/conversations/:id/typing (…/typing/route.ts): "I'm typing", sent live to the others. */
async function typing(me: Caller, conversationId: string, db: D1Database, env: Env, ctx: ExecutionContext) {
  const { results } = await db.prepare('SELECT id, userId FROM conversation_participants WHERE conversationId = ?').bind(conversationId).all<{ id: string; userId: string }>();
  const mine = results.find((p) => p.userId === me.id);
  if (!mine) return json({ error: 'Conversation not found.' }, 404);
  await db.prepare('UPDATE conversation_participants SET typingUntil = ? WHERE id = ?').bind(dbDate(Date.now() + 6000), mine.id).run();
  const hubs = env.REALTIME;
  if (hubs) {
    const body = JSON.stringify({ type: 'typing', conversationId, name: (me.name || 'Someone').split(' ')[0] });
    const others = results.filter((p) => p.userId !== me.id);
    ctx.waitUntil(Promise.all(others.map((p) => hubs.get(hubs.idFromName(p.userId)).fetch('https://realtime/publish', { method: 'POST', body }).catch(() => {}))));
  }
  return json({ ok: true });
}

/** POST /api/core/activity/ui (src/server/modules/activity.ts): pages opened and buttons pressed. */
async function activity(me: Caller, request: Request, db: D1Database) {
  const body = (await request.clone().json().catch(() => null)) as { events?: unknown } | null;
  const events: unknown[] = Array.isArray(body?.events) ? body.events.slice(0, 200) : [];
  if (!events.length) return json({ statusCode: 400, message: 'No events', error: 'Bad Request' }, 400);
  const now = Date.now();
  const insert = db.prepare('INSERT INTO ui_events (id, userId, kind, path, label, createdAt) VALUES (?, ?, ?, ?, ?, ?)');
  const rows = events.flatMap((e) => {
    const { k, l, p, t } = (e ?? {}) as { k?: unknown; l?: unknown; p?: unknown; t?: unknown };
    if ((k !== 'VIEW' && k !== 'CLICK') || typeof p !== 'string' || typeof t !== 'number' || t > now + 60_000 || t < now - 24 * 60 * 60_000) return [];
    const label = typeof l === 'string' && l.trim() ? l.trim().slice(0, 120) : null;
    return [insert.bind(crypto.randomUUID(), me.id, k, p.slice(0, 200), label, dbDate(Math.min(t, now)))];
  });
  if (rows.length) await db.batch(rows);
  return json({ saved: rows.length }, 201);
}

/** GET /api/me (src/app/api/me/route.ts): the caller's account-setup details. */
async function account(me: Caller, db: D1Database) {
  const row = await db
    .prepare(
      `SELECT u.name, u.email, u.phone, u.role, u.status, u.emergencyContacts, u.emailNotifications, u.createdAt,
         (SELECT department FROM student_profiles WHERE userId = u.id) AS studentDepartment,
         (SELECT department FROM teacher_profiles WHERE userId = u.id) AS teacherDepartment
       FROM users u WHERE u.id = ?`,
    )
    .bind(me.id)
    .first<Record<string, string | number | null>>();
  if (!row) return json({ error: 'Account not found.' }, 404);
  const contacts = parseJson(row.emergencyContacts);
  return json(
    {
      name: row.name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      status: row.status,
      department: row.studentDepartment ?? row.teacherDepartment ?? null,
      emergencyContacts: Array.isArray(contacts) ? contacts : [],
      emailNotifications: !!row.emailNotifications,
      memberSince: isoDate(row.createdAt as string),
    },
    200,
    { 'Cache-Control': 'no-store' },
  );
}

/**
 * GET /api/files/:key[/name] (src/app/api/files/[key]/route.ts): an uploaded file. Files never change
 * (the key is new for every upload), so after the first read each one is served from Cloudflare's
 * cache here for a day, without touching the database.
 */
async function file(request: Request, key: string, db: D1Database, ctx: ExecutionContext) {
  const cacheKey = new Request(`${new URL(request.url).origin}/api/files/${key}`);
  const cache = (caches as unknown as { default: Cache }).default;
  const stored = await cache.match(cacheKey).catch(() => undefined);
  let bytes: Uint8Array<ArrayBuffer>;
  let headers: Headers;
  if (stored) {
    bytes = new Uint8Array(await stored.arrayBuffer());
    headers = new Headers(stored.headers);
  } else {
    const row = await db.prepare('SELECT name, mime, data FROM stored_files WHERE key = ?').bind(key).first<{ name: string; mime: string; data: ArrayBuffer | number[] }>();
    if (!row) return new Response('Not found', { status: 404 });
    bytes = row.data instanceof ArrayBuffer ? new Uint8Array(row.data) : Uint8Array.from(row.data);
    const safeInline = (/^(image|audio|video)\//.test(row.mime) && !/svg|xml/.test(row.mime)) || row.mime === 'application/pdf' || row.mime === 'text/plain';
    headers = new Headers({
      'Content-Type': row.mime,
      'Content-Disposition': `${safeInline ? 'inline' : 'attachment'}; filename="${row.name.replace(/"/g, '')}"`,
      'X-Content-Type-Options': 'nosniff',
      'Accept-Ranges': 'bytes',
    });
    const csp = fileCsp(row.mime);
    if (csp) headers.set('Content-Security-Policy', csp);
    const copy = new Headers(headers);
    // Kept a day at the edge, so a deleted file (src/lib/storage.ts) stops being served soon after.
    copy.set('Cache-Control', 'public, max-age=86400');
    ctx.waitUntil(cache.put(cacheKey, new Response(bytes.slice(), { headers: copy })).catch(() => {}));
  }
  headers.set('Cache-Control', 'private, max-age=31536000, immutable');
  // Range requests, so audio and video can be played and scrubbed.
  const m = request.headers.get('range')?.match(/bytes=(\d*)-(\d*)/);
  if (m) {
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Math.min(Number(m[2]), bytes.length - 1) : bytes.length - 1;
    if (start <= end && start < bytes.length) {
      headers.set('Content-Range', `bytes ${start}-${end}/${bytes.length}`);
      headers.set('Content-Length', String(end - start + 1));
      return new Response(bytes.subarray(start, end + 1), { status: 206, headers });
    }
  }
  headers.set('Content-Length', String(bytes.length));
  return new Response(bytes, { headers });
}

const OWNER_EMAILS = () => ownerEmailList(process.env.SUPER_ADMIN_EMAILS);

/** GET /api/core/users/me (src/server/modules/users.ts): the caller's account. The owner goes to the Next.js route. */
async function usersMe(me: Caller, db: D1Database): Promise<Response | null> {
  if (OWNER_EMAILS().includes(me.email.trim().toLowerCase())) return null;
  const [userRes, studentRes, teacherRes, appRes] = await db.batch<Record<string, string | number | null>>([
    db.prepare('SELECT id, name, email, role, status, avatar, phone, googleId, emailNotifications, termsVersion, termsAcceptedAt, onboardedAt, createdAt, updatedAt FROM users WHERE id = ?').bind(me.id),
    db.prepare('SELECT id, userId, studentId, department, year, gpa, createdAt, updatedAt FROM student_profiles WHERE userId = ?').bind(me.id),
    db.prepare('SELECT id, userId, employeeId, department, designation, createdAt, updatedAt FROM teacher_profiles WHERE userId = ?').bind(me.id),
    db.prepare('SELECT id, status, source, requestedRole, adminNote, submittedAt, reviewedAt FROM role_applications WHERE userId = ? ORDER BY createdAt DESC LIMIT 1').bind(me.id),
  ]);
  const u = userRes.results[0];
  if (!u) return json({ statusCode: 404, message: 'User not found', error: 'Not Found' }, 404);
  const dates = <T extends Record<string, unknown>>(row: T | undefined, keys: string[]) =>
    row ? Object.fromEntries(Object.entries(row).map(([k, v]) => [k, keys.includes(k) ? isoDate(v as string | null) : v])) : null;
  return json({
    ...dates(u, ['termsAcceptedAt', 'onboardedAt', 'createdAt', 'updatedAt']),
    emailNotifications: bool(u.emailNotifications),
    studentProfile: dates(studentRes.results[0], ['createdAt', 'updatedAt']),
    teacherProfile: dates(teacherRes.results[0], ['createdAt', 'updatedAt']),
    application: dates(appRes.results[0], ['submittedAt', 'reviewedAt']),
  });
}

/**
 * POST /api/bootstrap (src/app/api/bootstrap/route.ts): what the app asks for when it opens, in one
 * request. The parts above are answered here; the rest (a dashboard's data, the sign-in history
 * entry) by the Next.js route in the same request, so far less of it runs there.
 */
async function bootstrap(me: Caller, request: Request, db: D1Database, env: Env, ctx: ExecutionContext, next: (r: Request) => Promise<Response>) {
  const b = (await request.clone().json().catch(() => ({}))) as { keys?: unknown; ticket?: unknown; session?: unknown };
  const keys = Array.isArray(b.keys) ? [...new Set(b.keys.filter((k): k is string => typeof k === 'string'))].slice(0, 8) : [];
  const origin = new URL(request.url).origin;
  const own: Record<string, (r: Request) => Promise<Response | null>> = {
    '/api/me': () => account(me, db),
    '/api/notifications': () => notifications(me, db),
    '/api/chat/incoming': () => incoming(me, db),
    '/api/core/users/me': () => usersMe(me, db),
  };
  const read = async (res: Response) => ({ status: res.status, body: await res.json().catch(() => null) });
  const results: Record<string, { status: number; body: unknown }> = {};
  const rest: string[] = [];
  const tasks: Promise<unknown>[] = keys.map(async (key) => {
    let u: URL;
    try { u = new URL(key, request.url); } catch { return; }
    const handler = u.origin === origin ? own[u.pathname] : undefined;
    const res = handler ? await handler(request).catch(() => null) : null;
    if (res) results[key] = await read(res);
    else rest.push(key);
  });
  let ticket: string | undefined;
  if (b.ticket === true && env.REALTIME) {
    const hub = env.REALTIME.get(env.REALTIME.idFromName(me.id));
    tasks.push(
      hub.fetch('https://realtime/ticket', { method: 'POST' }).then(async (res) => {
        const t = res.ok ? ((await res.json()) as { ticket?: string }).ticket : undefined;
        if (t) ticket = `/realtime?user=${encodeURIComponent(me.id)}&ticket=${encodeURIComponent(t)}`;
      }).catch(() => {}),
    );
    const seen = presence(me.id, db, Date.now());
    if (seen) ctx.waitUntil(seen.run().catch(() => {}));
  }
  await Promise.all(tasks);
  if (rest.length || b.session === true) {
    const headers = new Headers(request.headers);
    headers.delete('content-length');
    headers.set('content-type', 'application/json');
    // Built from the original request so its location (request.cf) still reaches the sign-in history.
    const res = await next(new Request(request, { method: 'POST', headers, body: JSON.stringify({ keys: rest, session: b.session === true }) }));
    const more = res.ok ? ((await res.json().catch(() => null)) as { results?: typeof results } | null) : null;
    Object.assign(results, more?.results ?? {});
  }
  return json({ results, ...(ticket ? { ticket } : {}) }, 200, { 'Cache-Control': 'no-store' });
}

async function answer(request: Request, path: string, db: D1Database, env: Env, ctx: ExecutionContext, next: (r: Request) => Promise<Response>): Promise<Response | null> {
  const file_ = FILE.exec(path);
  if (file_) return file(request, file_[1], db, ctx);
  const me = await callerOf(request, db);
  if (!me) return null;
  if (path === '/api/chat/incoming') return incoming(me, db);
  if (path === '/api/me') return account(me, db);
  if (path === '/api/notifications') return notifications(me, db);
  if (path === '/api/chat/conversations') return conversations(me, db, ctx);
  if (path === '/api/core/users/me') return usersMe(me, db);
  if (path === '/api/bootstrap') return bootstrap(me, request, db, env, ctx, next);
  const threadOf = THREAD.exec(path);
  if (threadOf) return thread(me, decodeURIComponent(threadOf[1]), new URL(request.url), db, ctx);
  if (path === '/api/core/activity/ui') {
    // The demo admin account is read-only (src/server/auth.ts demoWriteBlocked): the app says so.
    return me.demo && me.role === 'ADMIN' ? null : activity(me, request, db);
  }
  const typingIn = TYPING.exec(path);
  return typingIn ? typing(me, decodeURIComponent(typingIn[1]), db, env, ctx) : null;
}

const THREAD = /^\/api\/chat\/conversations\/([^/]+)\/messages$/;
const TYPING = /^\/api\/chat\/conversations\/([^/]+)\/typing$/;
const FILE = /^\/api\/files\/([A-Za-z0-9_-]{16,})(?:\/[^/]*)?$/;

/** The answer for one of the calls above, or null to let the Next.js app answer. */
export async function fastApi(request: Request, url: URL, env: Env, ctx: ExecutionContext, next: (r: Request) => Promise<Response>): Promise<Response | null> {
  const db = env.DB;
  if (!db) return null;
  const path = url.pathname;
  const get = request.method === 'GET';
  const post = request.method === 'POST';
  const fastGet = path === '/api/chat/incoming' || path === '/api/me' || path === '/api/notifications' || path === '/api/chat/conversations' || path === '/api/core/users/me' || THREAD.test(path) || FILE.test(path);
  if (!(get && fastGet) && !(post && (path === '/api/core/activity/ui' || path === '/api/bootstrap' || TYPING.test(path)))) return null;
  try {
    const res = await answer(request, path, db, env, ctx, next);
    // The headers next.config.ts adds to every response (files and JSON set their own CSP or need none).
    if (res) for (const h of securityHeaders) if (h.key !== 'Content-Security-Policy' && !res.headers.has(h.key)) res.headers.set(h.key, h.value);
    return res;
  } catch (e) {
    // The Next.js route gets a go (and records the error if it fails too).
    console.error(`fast path ${request.method} ${path} failed:`, e);
  }
  return null;
}
