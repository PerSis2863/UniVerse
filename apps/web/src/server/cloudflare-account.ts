// The owner console's "Cloudflare account" card: the live version and its history, build minutes
// used this month, the database and file storage. It reads Cloudflare's API with the CF_USAGE_TOKEN
// secret, which only ever needs Read permissions:
//   Account Analytics (the spending guard), Workers Scripts (versions), Workers Builds
//   Configuration (builds), D1 (database), Workers R2 Storage (file storage).
// Each part that its permission is missing for says so instead of failing the whole card.

import { adminEnabled } from './cloudflare-admin';

const WORKER = 'universe-web';
const DATABASE = 'universe-db';
const BUILD_MINUTES = 3000; // a month on Workers Free and Paid

type Part<T> = { ok: true; data: T } | { ok: false; error: string };

async function cf<T>(path: string): Promise<T> {
  const account = process.env.CF_ACCOUNT_ID?.trim();
  const token = process.env.CF_USAGE_TOKEN?.trim();
  if (!account || !token) throw new Error('Add the CF_ACCOUNT_ID and CF_USAGE_TOKEN secrets.');
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`, { headers: { Authorization: `Bearer ${token}` } });
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
    by: d.annotations?.['workers/triggered_by'] ?? d.source ?? '',
    note: d.annotations?.['workers/message'] ?? '',
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
  return { name: db.name, bytes: db.file_size ?? null, tables: db.num_tables ?? null };
}

async function storage() {
  const r = await cf<{ buckets: { name: string; creation_date?: string }[] }>('/r2/buckets');
  return { buckets: r.buckets.map((b) => b.name) };
}

let cache: { at: number; value: unknown } | null = null;

/** Everything the card shows, read at most every 5 minutes (or now, with fresh). */
export async function cloudflareAccount(fresh = false) {
  if (!fresh && cache && Date.now() - cache.at < 5 * 60_000) return cache.value;
  if (!process.env.CF_ACCOUNT_ID?.trim() || !process.env.CF_USAGE_TOKEN?.trim()) return { setup: false };
  const [v, b, d, s] = await Promise.all([part(versions), part(builds), part(database), part(storage)]);
  const value = { setup: true, canEdit: adminEnabled(), checkedAt: new Date().toISOString(), versions: v, builds: b, database: d, storage: s };
  cache = { at: Date.now(), value };
  return value;
}
