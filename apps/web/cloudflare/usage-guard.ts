// The spending guard. Cloudflare has no setting that caps the bill: on the Workers Paid plan,
// anything past what the $5 includes is charged. So every 15 minutes (wrangler.jsonc "triggers")
// this reads the account's usage for the billing month from Cloudflare's analytics, emails the
// owner when any allowance passes 70%, and at 90% pauses the app: every page and API call gets a
// small "taking a break" answer (no database, no rendering) until the next billing month. The
// state lives in the usage_guard table, so the owner console can show it.
//
// Secrets (Worker → Settings → Variables and Secrets, type Secret):
//   CF_ACCOUNT_ID     the account id (Workers & Pages overview, right-hand side)
//   CF_USAGE_TOKEN    an API token with only "Account Analytics: Read"
//   CF_BILLING_DAY    optional: the day of the month the Paid plan renews (1-31). Without it the
//                     guard counts the last 31 days, which never undercounts but may pause early.
//   CF_GUARD_OFF      optional: any value turns pausing off (the checks and emails still run).
import { bool, dbDate } from './fast-db';

export interface GuardEnv {
  DB?: D1Database;
  [key: string]: unknown;
}

const WARN_AT = 0.7;
const PAUSE_AT = 0.9;
const GB = 1024 ** 3;

// What the $5 includes each month (Workers Paid; R2 has its own free allowance). Cloudflare's
// analytics can't tell billed log events apart, so those are estimated from requests.
const METERS = [
  { key: 'requests', label: 'App requests', limit: 10_000_000 },
  { key: 'cpuMs', label: 'Processing time (CPU ms)', limit: 30_000_000 },
  { key: 'logs', label: 'Log events (estimated)', limit: 20_000_000 },
  { key: 'liveRequests', label: 'Live updates and whiteboards', limit: 1_000_000 },
  { key: 'liveGbSeconds', label: 'Live updates running time (GB-s)', limit: 400_000 },
  { key: 'liveStorage', label: 'Live updates storage', limit: 5 * GB, bytes: true },
  { key: 'dbRowsRead', label: 'Database rows read', limit: 25_000_000_000 },
  { key: 'dbRowsWritten', label: 'Database rows written', limit: 50_000_000 },
  { key: 'dbStorage', label: 'Database size', limit: 5 * GB, bytes: true },
  { key: 'filesWrites', label: 'File uploads and listings (R2 class A)', limit: 1_000_000 },
  { key: 'filesReads', label: 'File downloads (R2 class B)', limit: 10_000_000 },
  { key: 'filesStorage', label: 'Stored files (R2)', limit: 10 * GB, bytes: true },
] as const;

type MeterKey = (typeof METERS)[number]['key'];
export type Meter = { key: MeterKey; label: string; used: number | null; limit: number; bytes?: boolean };

// R2 operations that are free; everything else that isn't class B is counted as class A.
const R2_FREE = new Set(['DeleteObject', 'DeleteBucket', 'AbortMultipartUpload']);
const R2_CLASS_B = new Set(['HeadBucket', 'HeadObject', 'GetObject', 'UsageSummary', 'GetBucketEncryption', 'GetBucketLocation', 'GetBucketCors', 'GetBucketLifecycleConfiguration']);

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Start of the current billing month, and the start of the next one (when known). */
export function billingWindow(now: Date, billingDay: unknown): { start: Date; next: Date | null; key: string } {
  const n = Number(billingDay);
  if (!Number.isInteger(n) || n < 1 || n > 31) {
    // Unknown renewal day: the last 31 days (the longest a billing month can be, and the most
    // Cloudflare's analytics answer for at once) always cover the whole current billing month.
    return { start: new Date(now.getTime() - 31 * 86_400_000 + 5 * 60_000), next: null, key: now.toISOString().slice(0, 7) };
  }
  // The renewal day in a given month, moved to the month's last day when the month is shorter.
  const at = (y: number, m: number) => new Date(Date.UTC(y, m, Math.min(n, new Date(Date.UTC(y, m + 1, 0)).getUTCDate())));
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const start = at(y, m) <= now ? at(y, m) : at(y, m - 1);
  const next = at(start.getUTCFullYear(), start.getUTCMonth() + 1);
  return { start, next, key: day(start) };
}

async function graphql<T>(env: GuardEnv, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CF_USAGE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json().catch(() => null)) as { data?: { viewer?: { accounts?: T[] } }; errors?: { message: string }[] } | null;
  if (!res.ok || body?.errors?.length || !body?.data?.viewer?.accounts?.[0]) {
    throw new Error(body?.errors?.[0]?.message ?? `Cloudflare answered ${res.status}`);
  }
  return body.data.viewer.accounts[0];
}

const ACCOUNT = 'query($a: string!, $from: Time!, $to: Time!, $fromDay: Date!, $toDay: Date!) { viewer { accounts(filter: { accountTag: $a }) {';
const END = '} } }';
type Sum<K extends string> = { sum: Record<K, number> }[];

/** Each allowance is read on its own, so one Cloudflare error doesn't hide the others. */
const READERS: { keys: MeterKey[]; read: (env: GuardEnv, v: Record<string, unknown>) => Promise<Partial<Record<MeterKey, number>>> }[] = [
  {
    keys: ['requests', 'cpuMs'],
    read: async (env, v) => {
      const r = await graphql<{ w: Sum<'requests' | 'cpuTimeUs'> }>(env, `${ACCOUNT} w: workersInvocationsAdaptive(limit: 1, filter: { datetime_geq: $from, datetime_leq: $to }) { sum { requests cpuTimeUs } } ${END}`, v);
      return { requests: r.w[0]?.sum.requests ?? 0, cpuMs: (r.w[0]?.sum.cpuTimeUs ?? 0) / 1000 };
    },
  },
  {
    keys: ['liveRequests'],
    read: async (env, v) => {
      const r = await graphql<{ d: Sum<'requests'> }>(env, `${ACCOUNT} d: durableObjectsInvocationsAdaptiveGroups(limit: 1, filter: { date_geq: $fromDay, date_leq: $toDay }) { sum { requests } } ${END}`, v);
      return { liveRequests: r.d[0]?.sum.requests ?? 0 };
    },
  },
  {
    keys: ['liveGbSeconds'],
    read: async (env, v) => {
      // Billed for 128 MB per object while it's awake; activeTime is in microseconds.
      const r = await graphql<{ d: Sum<'activeTime'> }>(env, `${ACCOUNT} d: durableObjectsPeriodicGroups(limit: 1, filter: { date_geq: $fromDay, date_leq: $toDay }) { sum { activeTime } } ${END}`, v);
      return { liveGbSeconds: ((r.d[0]?.sum.activeTime ?? 0) / 1e6) * (128 / 1024) };
    },
  },
  {
    keys: ['liveStorage'],
    read: async (env, v) => {
      const r = await graphql<{ d: { max: { storedBytes: number } }[] }>(env, `${ACCOUNT} d: durableObjectsStorageGroups(limit: 1, filter: { date_geq: $fromDay, date_leq: $toDay }) { max { storedBytes } } ${END}`, v);
      return { liveStorage: r.d[0]?.max.storedBytes ?? 0 };
    },
  },
  {
    keys: ['dbRowsRead', 'dbRowsWritten'],
    read: async (env, v) => {
      const r = await graphql<{ d: Sum<'rowsRead' | 'rowsWritten'> }>(env, `${ACCOUNT} d: d1AnalyticsAdaptiveGroups(limit: 1, filter: { date_geq: $fromDay, date_leq: $toDay }) { sum { rowsRead rowsWritten } } ${END}`, v);
      return { dbRowsRead: r.d[0]?.sum.rowsRead ?? 0, dbRowsWritten: r.d[0]?.sum.rowsWritten ?? 0 };
    },
  },
  {
    keys: ['dbStorage'],
    read: async (env, v) => {
      // Newest size of each database, added up.
      const r = await graphql<{ d: { max: { databaseSizeBytes: number }; dimensions: { databaseId: string } }[] }>(
        env,
        `${ACCOUNT} d: d1StorageAdaptiveGroups(limit: 1000, filter: { date_geq: $fromDay, date_leq: $toDay }, orderBy: [date_DESC]) { max { databaseSizeBytes } dimensions { date databaseId } } ${END}`,
        v,
      );
      const seen = new Map<string, number>();
      for (const row of r.d) if (!seen.has(row.dimensions.databaseId)) seen.set(row.dimensions.databaseId, row.max.databaseSizeBytes);
      return { dbStorage: [...seen.values()].reduce((a, b) => a + b, 0) };
    },
  },
  {
    keys: ['filesWrites', 'filesReads'],
    read: async (env, v) => {
      const r = await graphql<{ r: { sum: { requests: number }; dimensions: { actionType: string } }[] }>(
        env,
        `${ACCOUNT} r: r2OperationsAdaptiveGroups(limit: 100, filter: { datetime_geq: $from, datetime_leq: $to }) { sum { requests } dimensions { actionType } } ${END}`,
        v,
      );
      let a = 0;
      let b = 0;
      for (const row of r.r) {
        if (R2_FREE.has(row.dimensions.actionType)) continue;
        if (R2_CLASS_B.has(row.dimensions.actionType)) b += row.sum.requests;
        else a += row.sum.requests;
      }
      return { filesWrites: a, filesReads: b };
    },
  },
  {
    keys: ['filesStorage'],
    read: async (env, v) => {
      const r = await graphql<{ r: { max: { payloadSize: number; metadataSize: number }; dimensions: { bucketName: string } }[] }>(
        env,
        `${ACCOUNT} r: r2StorageAdaptiveGroups(limit: 1000, filter: { datetime_geq: $from, datetime_leq: $to }, orderBy: [datetime_DESC]) { max { payloadSize metadataSize } dimensions { datetime bucketName } } ${END}`,
        v,
      );
      const seen = new Map<string, number>();
      for (const row of r.r) if (!seen.has(row.dimensions.bucketName)) seen.set(row.dimensions.bucketName, row.max.payloadSize + row.max.metadataSize);
      return { filesStorage: [...seen.values()].reduce((a, b) => a + b, 0) };
    },
  },
];

/** Reads this billing month's usage of everything the $5 includes. `null` = couldn't be read. */
export async function readUsage(env: GuardEnv, now: Date, start: Date): Promise<{ meters: Meter[]; errors: string[] }> {
  const v = { a: env.CF_ACCOUNT_ID, from: start.toISOString(), to: now.toISOString(), fromDay: day(start), toDay: day(now) };
  const used: Partial<Record<MeterKey, number>> = {};
  const errors: string[] = [];
  await Promise.all(
    READERS.map((r) =>
      r.read(env, v).then(
        (got) => Object.assign(used, got),
        (e: Error) => errors.push(`${r.keys.join(', ')}: ${e.message}`),
      ),
    ),
  );
  // Every request writes one invocation log, plus a line for each console.log; live updates log too.
  if (used.requests !== undefined) used.logs = 2 * (used.requests + (used.liveRequests ?? 0));
  return { meters: METERS.map((m) => ({ ...m, used: used[m.key] ?? null })), errors };
}

const share = (m: Meter) => (m.used === null ? 0 : m.used / m.limit);
const percent = (m: Meter) => `${Math.round(share(m) * 100)}%`;

async function emailOwner(env: GuardEnv, subject: string, text: string) {
  const key = env.RESEND_API_KEY as string | undefined;
  if (!key) return;
  const to = String(env.SUPER_ADMIN_EMAILS || 'universeimpact1@gmail.com').split(',').map((e) => e.trim()).filter(Boolean);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.RESEND_FROM || 'UniVerse <onboarding@resend.dev>', to, subject, text }),
  }).catch(() => null);
  if (!res?.ok) console.error('Spending guard email failed:', res?.status);
}

/** The scheduled check (every 15 minutes). */
export async function checkUsage(env: GuardEnv, now = new Date()): Promise<string> {
  const db = env.DB;
  if (!db) return 'no database';
  const prev = await db.prepare('SELECT paused, alerted FROM usage_guard WHERE id = ?').bind('main').first<{ paused: unknown; alerted: string | null }>();
  const save = (fields: Record<string, unknown>) => {
    const cols = Object.keys(fields);
    return db
      .prepare(`INSERT INTO usage_guard (id, ${cols.map((c) => `"${c}"`).join(', ')}) VALUES ('main', ${cols.map(() => '?').join(', ')}) ON CONFLICT(id) DO UPDATE SET ${cols.map((c) => `"${c}" = excluded."${c}"`).join(', ')}`)
      .bind(...cols.map((c) => fields[c] ?? null))
      .run();
  };
  if (!env.CF_ACCOUNT_ID || !env.CF_USAGE_TOKEN) {
    await save({ checkedAt: dbDate(now.getTime()), error: 'Not set up: add the CF_ACCOUNT_ID and CF_USAGE_TOKEN secrets.' });
    return 'not set up';
  }

  const window = billingWindow(now, env.CF_BILLING_DAY);
  const { meters, errors } = await readUsage(env, now, window.start);
  const top = meters.reduce((a, b) => (share(b) > share(a) ? b : a));
  const readable = meters.some((m) => m.used !== null);
  // Only real readings change the pause: if Cloudflare couldn't be read, keep things as they are.
  const paused = readable ? share(top) >= PAUSE_AT : bool(prev?.paused);
  const reason = paused ? `${top.label} reached ${percent(top)} of what the $5 plan includes.` : null;
  // Each email goes once per billing month: a warning, then (if it comes to that) the pause.
  const level = paused ? 'pause' : share(top) >= WARN_AT ? 'warn' : null;
  const was = prev?.alerted ?? '';
  const send = level && !was.startsWith(`${window.key}:${level === 'warn' ? '' : 'pause'}`) ? `${window.key}:${level}` : null;

  await save({
    paused: paused ? 1 : 0,
    reason,
    resumeAt: window.next ? dbDate(window.next.getTime()) : null,
    meters: JSON.stringify(meters),
    error: errors.length ? errors.join('\n').slice(0, 2000) : null,
    checkedAt: dbDate(now.getTime()),
    ...(paused && !bool(prev?.paused) ? { pausedAt: dbDate(now.getTime()) } : {}),
    ...(send ? { alerted: send } : {}),
  });

  const list = meters.filter((m) => m.used !== null && share(m) >= 0.5).map((m) => `- ${m.label}: ${percent(m)}`).join('\n');
  if (send && level === 'pause') {
    const reopen = window.next ? `It opens again by itself on ${day(window.next)}, when the next billing month starts.` : 'It opens again by itself once the last 31 days drop back under the limit. (Add the CF_BILLING_DAY secret so it reopens exactly on your renewal day.)';
    await emailOwner(env, 'UniVerse is paused to keep your Cloudflare bill at $5', `${reason}\n\nTo stay within the $5 plan, the app now shows a "taking a short break" page. ${reopen}\n\nTo open it again now and accept extra charges, add a secret named CF_GUARD_OFF (any value) to universe-web in Cloudflare.\n\nUsage this billing month:\n${list}`);
  } else if (send) {
    await emailOwner(env, 'UniVerse has used 70% of the $5 Cloudflare plan', `${top.label} is at ${percent(top)} of what the $5 plan includes this billing month. If anything reaches 90%, UniVerse pauses itself until the next billing month so nothing extra is charged.\n\nUsage this billing month:\n${list}`);
  }
  return `${paused ? 'paused' : 'running'}; highest ${top.key} ${percent(top)}${errors.length ? `; unreadable: ${errors.length}` : ''}`;
}

// ─── The pause, as the app's requests see it ──────────────────────────────────────────────────

// Read from the database at most once a minute per instance, in the background, so requests
// never wait for it.
let state: { paused: boolean; resumeAt: string | null; at: number } = { paused: false, resumeAt: null, at: 0 };
let loading = false;

export function guardPaused(env: GuardEnv, ctx: ExecutionContext): { resumeAt: string | null } | null {
  if (env.CF_GUARD_OFF) return null;
  if (!loading && env.DB && Date.now() - state.at > 60_000) {
    loading = true;
    ctx.waitUntil(
      env.DB.prepare('SELECT paused, resumeAt FROM usage_guard WHERE id = ?')
        .bind('main')
        .first<{ paused: unknown; resumeAt: string | null }>()
        .then((row) => {
          state = { paused: bool(row?.paused), resumeAt: row?.resumeAt ?? null, at: Date.now() };
        })
        // No table yet (before the migration runs): treat as running and try again in a minute.
        .catch(() => {
          state = { ...state, at: Date.now() };
        })
        .finally(() => {
          loading = false;
        }),
    );
  }
  return state.paused ? { resumeAt: state.resumeAt } : null;
}

/** The answer every request gets while paused: tiny, no database, no rendering. */
export function pausedResponse(url: URL, resumeAt: string | null): Response {
  const when = resumeAt ? new Date(resumeAt.replace('+00:00', 'Z')).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }) : null;
  const message = `UniVerse is taking a short break${when ? ` and will be back on ${when}` : ' and will be back soon'}. Your work is saved.`;
  const headers = { 'Retry-After': '3600', 'Cache-Control': 'no-store' };
  if (url.pathname.startsWith('/api/') || url.pathname === '/realtime' || url.pathname === '/board-live') return Response.json({ error: message }, { status: 503, headers });
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>UniVerse · back soon</title>
<style>html{background:#0b0b14;color:#e4e4e7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:radial-gradient(60% 50% at 20% 10%,rgba(99,102,241,.25),transparent),radial-gradient(50% 40% at 90% 90%,rgba(217,70,239,.18),transparent)}main{max-width:420px;text-align:center}h1{font-size:22px;color:#fff;margin:0 0 12px}p{line-height:1.6;margin:0 0 20px;color:#a1a1aa}a{display:inline-block;background:#6366f1;color:#fff;text-decoration:none;font-weight:600;padding:10px 20px;border-radius:10px}</style></head>
<body><main><h1>Back soon</h1><p>${message}</p><a href="/">Try again</a></main></body></html>`,
    { status: 503, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } },
  );
}
