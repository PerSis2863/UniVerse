// The owner console's "Cloudflare account" card: the live version and its history, build minutes
// used this month, the database and file storage, visitors, blocked attacks, domain health and the
// Cloudflare plan. It reads Cloudflare's API with the CF_USAGE_TOKEN
// secret, which only ever needs Read permissions:
//   Account Analytics (the spending guard), Workers Scripts (versions), Workers Builds
//   Configuration (builds), D1 (database), Workers R2 Storage (file storage), Billing (plan);
//   for universeimpact.com: Zone, Analytics, Firewall Services, DNS, SSL and Certificates, Email
//   Routing Rules.
// Each part that its permission is missing for says so instead of failing the whole card.

import { adminEnabled } from './cloudflare-admin';
import { APP_URL } from './email';

const WORKER = 'universe-web';
const DATABASE = 'universe-db';
const BUILD_MINUTES = 3000; // a month on Workers Free and Paid

type Part<T> = { ok: boolean; data?: T; error?: string };

const cf = <T,>(path: string) => cfAny<T>(`/accounts/${process.env.CF_ACCOUNT_ID?.trim()}${path}`);

/** A read with the CF_USAGE_TOKEN; `path` starts after /client/v4. */
async function cfAny<T>(path: string): Promise<T> {
  const account = process.env.CF_ACCOUNT_ID?.trim();
  const token = process.env.CF_USAGE_TOKEN?.trim();
  if (!account || !token) throw new Error('Add the CF_ACCOUNT_ID and CF_USAGE_TOKEN secrets.');
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = (await res.json().catch(() => null)) as { success?: boolean; result?: T; errors?: { message: string }[] } | null;
  if (res.status === 403 || res.status === 401) throw new Error('The token is missing this Read permission.');
  if (!res.ok || !body?.success) throw new Error(body?.errors?.[0]?.message ?? `Cloudflare answered ${res.status}.`);
  return body.result as T;
}

const part = async <T,>(fn: () => Promise<T>): Promise<Part<T>> => {
  try { return { ok: true, data: await fn() }; } catch (e) { return { ok: false, error: (e as Error).message }; }
};

async function versions() {
  const r = await cf<{ deployments: { id: string; created_on: string; source?: string; author_email?: string; annotations?: Record<string, string>; versions?: { version_id: string; percentage: number }[] }[] }>(`/workers/scripts/${WORKER}/deployments`);
  return r.deployments.slice(0, 8).map((d) => ({
    at: d.created_on,
    versionId: d.versions?.[0]?.version_id ?? null,
    by: ({ deployment: 'update', rollback: 'rollback', secret: 'secret changed', upload: 'upload' } as Record<string, string>)[d.annotations?.['workers/triggered_by'] ?? ''] ?? d.annotations?.['workers/triggered_by'] ?? '',
    version: d.versions?.[0]?.version_id?.slice(0, 8) ?? '',
    note: (d.annotations?.['workers/message'] ?? '').replace(/^Deployed version \S+$/, ''),
  }));
}

async function builds() {
  const scripts = await cf<{ id: string; tag?: string }[]>('/workers/scripts');
  const tag = scripts.find((s) => s.id === WORKER)?.tag;
  if (!tag) throw new Error(`Worker ${WORKER} not found.`);
  type Build = { created_on: string; running_on?: string | null; stopped_on?: string | null; build_outcome?: string | null; status?: string; build_trigger_metadata?: { branch?: string; commit_message?: string } };
  const list = await cf<Build[]>(`/builds/workers/${tag}/builds?per_page=100`);
  const now = new Date();
  const month = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const minutes = (b: Build) => (b.running_on && b.stopped_on ? Math.max(0, (Date.parse(b.stopped_on) - Date.parse(b.running_on)) / 60_000) : 0);
  const thisMonth = list.filter((b) => Date.parse(b.created_on) >= month);
  return {
    minutesUsed: Math.ceil(thisMonth.reduce((s, b) => s + minutes(b), 0)),
    minutesLimit: BUILD_MINUTES,
    count: thisMonth.length,
    // The list may stop at 100 builds; more than that in a month is counted as at least this.
    partial: list.length >= 100 && thisMonth.length === list.length,
    recent: list.slice(0, 6).map((b) => ({
      at: b.created_on,
      outcome: b.build_outcome ?? b.status ?? 'running',
      minutes: Math.round(minutes(b) * 10) / 10,
      branch: b.build_trigger_metadata?.branch ?? '',
      message: (b.build_trigger_metadata?.commit_message ?? '').split('\n')[0].slice(0, 90),
    })),
  };
}

async function database() {
  const list = await cf<{ uuid: string; name: string; file_size?: number; num_tables?: number }[]>(`/d1/database?name=${DATABASE}`);
  const db = list.find((d) => d.name === DATABASE) ?? list[0];
  if (!db) throw new Error('Database not found.');
  return { name: db.name, bytes: db.file_size ?? null, tables: db.num_tables || null };
}

async function storage() {
  const r = await cf<{ buckets: { name: string; creation_date?: string }[] }>('/r2/buckets');
  return { buckets: r.buckets.map((b) => b.name) };
}

// ─── The website (zone) ───────────────────────────────────────────────────────────────────────

let zoneId: string | null = null;
/** universeimpact.com's zone id (needs Zone → Zone → Read). */
async function zone(): Promise<string> {
  if (zoneId) return zoneId;
  const host = new URL(APP_URL()).hostname.replace(/^www\./, '');
  const list = await cfAny<{ id: string }[]>(`/zones?name=${encodeURIComponent(host)}`);
  if (!list[0]) throw new Error(`Website ${host} not found: the token needs Zone → Zone → Read for it.`);
  return (zoneId = list[0].id);
}

async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.CF_USAGE_TOKEN?.trim()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const body = (await res.json().catch(() => null)) as { data?: T; errors?: { message: string }[] | null } | null;
  if (body?.errors?.length) throw new Error(/not authorized|permission/i.test(body.errors[0].message) ? 'The token is missing this Read permission.' : body.errors[0].message);
  if (!res.ok || !body?.data) throw new Error(`Cloudflare answered ${res.status}.`);
  return body.data;
}

/** Visitors over the last 7 days (Zone → Analytics → Read). */
async function traffic() {
  type Day = { dimensions: { date: string }; sum: { requests: number; pageViews: number; threats: number; bytes: number; countryMap: { clientCountryName: string; requests: number }[] }; uniq: { uniques: number } };
  const since = new Date(Date.now() - 6 * 86_400_000).toISOString().slice(0, 10);
  const data = await graphql<{ viewer: { zones: { httpRequests1dGroups: Day[] }[] } }>(
    `query ($zone: String!, $since: Date!) { viewer { zones(filter: { zoneTag: $zone }) { httpRequests1dGroups(limit: 7, filter: { date_geq: $since }, orderBy: [date_ASC]) {
      dimensions { date } sum { requests pageViews threats bytes countryMap { clientCountryName requests } } uniq { uniques } } } } }`,
    { zone: await zone(), since },
  );
  const days = data.viewer.zones[0]?.httpRequests1dGroups ?? [];
  const countries = new Map<string, number>();
  for (const d of days) for (const c of d.sum.countryMap) countries.set(c.clientCountryName, (countries.get(c.clientCountryName) ?? 0) + c.requests);
  return {
    days: days.map((d) => ({ day: d.dimensions.date, visitors: d.uniq.uniques, pageViews: d.sum.pageViews, requests: d.sum.requests })),
    visitors: days.reduce((a, d) => a + d.uniq.uniques, 0),
    pageViews: days.reduce((a, d) => a + d.sum.pageViews, 0),
    threats: days.reduce((a, d) => a + d.sum.threats, 0),
    bytes: days.reduce((a, d) => a + d.sum.bytes, 0),
    countries: [...countries].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([code, requests]) => ({ code, requests })),
  };
}

/**
 * What Cloudflare's firewall stopped in the last 24 hours (Zone → Firewall Services → Read). The
 * grouped list isn't in the Free plan, so it falls back to the latest events, counted here; if
 * neither is allowed, `limited` says so (the visitors part still counts threats stopped).
 */
async function attacks() {
  type Row = { action: string; source: string; clientCountryName: string };
  const vars = { zone: await zone(), since: new Date(Date.now() - 86_400_000).toISOString() };
  const noAccess = (e: unknown) => /does not have access|not authorized|permission/i.test((e as Error).message);
  try {
    const data = await graphql<{ viewer: { zones: { firewallEventsAdaptiveGroups: { count: number; dimensions: Row }[] }[] } }>(
      `query ($zone: String!, $since: Time!) { viewer { zones(filter: { zoneTag: $zone }) { firewallEventsAdaptiveGroups(limit: 10, filter: { datetime_geq: $since }, orderBy: [count_DESC]) {
        count dimensions { action source clientCountryName } } } } }`, vars);
    const groups = data.viewer.zones[0]?.firewallEventsAdaptiveGroups ?? [];
    return { limited: false, total: groups.reduce((a, g) => a + g.count, 0), top: groups.slice(0, 5).map((g) => ({ count: g.count, ...g.dimensions })) };
  } catch (e) {
    if (!noAccess(e)) throw e;
  }
  try {
    const data = await graphql<{ viewer: { zones: { firewallEventsAdaptive: Row[] }[] } }>(
      `query ($zone: String!, $since: Time!) { viewer { zones(filter: { zoneTag: $zone }) { firewallEventsAdaptive(limit: 100, filter: { datetime_geq: $since }, orderBy: [datetime_DESC]) {
        action source clientCountryName } } } }`, vars);
    const rows = data.viewer.zones[0]?.firewallEventsAdaptive ?? [];
    const counts = new Map<string, { count: number } & Row>();
    for (const r of rows) {
      const k = `${r.action}|${r.source}|${r.clientCountryName}`;
      counts.set(k, { ...r, count: (counts.get(k)?.count ?? 0) + 1 });
    }
    return { limited: false, total: rows.length, top: [...counts.values()].sort((x, y) => y.count - x.count).slice(0, 5) };
  } catch (e) {
    if (!noAccess(e)) throw e;
    return { limited: true, total: 0, top: [] };
  }
}

/** Domain health: email records, the certificate and hello@ forwarding (Zone → DNS, SSL and Certificates, Email Routing Rules → Read). */
async function domain() {
  const z = await zone();
  const [dns, certs, rules] = await Promise.all([
    part(() => cfAny<{ type: string; name: string; content: string }[]>(`/zones/${z}/dns_records?per_page=200`)),
    part(() => cfAny<{ status: string; certificates?: { expires_on?: string }[] }[]>(`/zones/${z}/ssl/certificate_packs?status=all`)),
    part(() => cfAny<{ enabled: boolean; matchers?: { value?: string }[]; actions?: { type: string; value?: string[] }[] }[]>(`/zones/${z}/email/routing/rules`)),
  ]);
  const checks: { name: string; ok: boolean | null; note: string }[] = [];
  if (dns.ok) {
    const txt = dns.data.filter((r) => r.type === 'TXT');
    checks.push({ name: 'Receiving email (MX)', ok: dns.data.some((r) => r.type === 'MX'), note: 'Needed for hello@ to receive mail.' });
    checks.push({ name: 'SPF', ok: txt.some((r) => r.content.includes('v=spf1')), note: 'Stops others sending mail as you.' });
    checks.push({ name: 'DMARC', ok: txt.some((r) => r.name.startsWith('_dmarc.')), note: 'Tells inboxes what to do with fake mail.' });
    checks.push({ name: 'DKIM (Resend)', ok: txt.some((r) => r.name.includes('._domainkey')), note: 'Lets your emails land in the inbox, not spam.' });
  } else checks.push({ name: 'DNS records', ok: null, note: dns.error });
  if (certs.ok) {
    const ends = certs.data.flatMap((p) => p.certificates ?? []).map((c) => c.expires_on).filter((x): x is string => !!x).sort();
    const first = ends.find((e) => Date.parse(e) > Date.now());
    const days = first ? Math.floor((Date.parse(first) - Date.now()) / 86_400_000) : null;
    checks.push({ name: 'Security certificate (https)', ok: certs.data.some((p) => p.status === 'active') && (days == null || days > 14), note: days == null ? 'Renews automatically.' : `Renews automatically; current one ends in ${days} days.` });
  } else checks.push({ name: 'Security certificate (https)', ok: null, note: certs.error });
  if (rules.ok) {
    const on = rules.data.filter((r) => r.enabled && r.actions?.some((a) => a.type === 'forward'));
    checks.push({ name: 'Email forwarding', ok: on.length > 0, note: on.length ? on.map((r) => `${r.matchers?.[0]?.value ?? 'all'} → ${r.actions?.[0]?.value?.join(', ') ?? ''}`).join('; ') : 'No forwarding rule is on.' });
  } else checks.push({ name: 'Email forwarding', ok: null, note: rules.error });
  return { checks };
}

/** Your Cloudflare plans and what they cost (Account → Billing → Read). */
async function plan() {
  const subs = await cf<{ rate_plan?: { public_name?: string; id?: string }; price?: number; currency?: string; frequency?: string; current_period_end?: string; state?: string }[]>('/subscriptions');
  const list = subs.map((s) => ({ name: s.rate_plan?.public_name ?? s.rate_plan?.id ?? 'Plan', price: s.price ?? 0, currency: s.currency ?? 'USD', frequency: s.frequency ?? '', renews: s.current_period_end ?? null, state: s.state ?? '' }));
  // Workers Free has no subscription, so it's named here when no Workers plan is listed.
  if (!list.some((x) => /worker/i.test(x.name))) list.unshift({ name: 'Workers Free', price: 0, currency: 'USD', frequency: '', renews: null, state: 'active' });
  return list;
}

let cache: { at: number; value: unknown } | null = null;

/** Everything the card shows, read at most every 5 minutes (or now, with fresh). */
export async function cloudflareAccount(fresh = false) {
  if (!fresh && cache && Date.now() - cache.at < 5 * 60_000) return cache.value;
  if (!process.env.CF_ACCOUNT_ID?.trim() || !process.env.CF_USAGE_TOKEN?.trim()) return { setup: false };
  const [v, b, d, s, t, a, h, p] = await Promise.all([part(versions), part(builds), part(database), part(storage), part(traffic), part(attacks), part(domain), part(plan)]);
  const value = { setup: true, canEdit: adminEnabled(), checkedAt: new Date().toISOString(), versions: v, builds: b, database: d, storage: s, traffic: t, attacks: a, domain: h, plan: p };
  cache = { at: Date.now(), value };
  return value;
}
