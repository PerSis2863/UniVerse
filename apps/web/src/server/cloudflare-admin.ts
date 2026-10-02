import { sendEmail, escapeHtml } from './email';

// Changes to the Cloudflare Worker from the owner console: put an earlier version of the site back
// live. Kept apart from the read-only CF_USAGE_TOKEN on purpose:
//
//   CF_ADMIN_TOKEN   an API token with only "Account → Workers Scripts → Edit". Without it these
//                    controls stay hidden and nothing here can change Cloudflare.
//
// Every change also needs a 6-digit code emailed to the owner (valid about 10 minutes), so a stolen
// sign-in alone can't change Cloudflare. Five wrong codes lock changes for 15 minutes. Each change
// is emailed to the owner after.

const WORKER = 'universe-web';

export class CloudflareAdminError extends Error {}

const adminToken = () => process.env.CF_ADMIN_TOKEN?.trim() ?? '';
export const adminEnabled = () => !!adminToken() && !!process.env.CF_ACCOUNT_ID?.trim();

async function cf<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!adminEnabled()) throw new CloudflareAdminError('Add the CF_ADMIN_TOKEN secret first.');
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID!.trim()}/workers/scripts/${WORKER}${path}`, {
    method,
    headers: { Authorization: `Bearer ${adminToken()}`, ...(body !== undefined && { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as { success?: boolean; result?: T; errors?: { message: string }[] } | null;
  if (res.status === 401 || res.status === 403) throw new CloudflareAdminError('CF_ADMIN_TOKEN is missing the "Workers Scripts: Edit" permission.');
  if (!res.ok || !json?.success) throw new CloudflareAdminError(json?.errors?.[0]?.message ?? `Cloudflare answered ${res.status}.`);
  return json.result as T;
}

// ─── Emailed code ───────────────────────────────────────────────────────────────────────────

const SLOT = 10 * 60_000;
const fails = new Map<string, { n: number; until: number }>();

async function codeFor(ownerId: string, slot: number) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(adminToken()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`cf-change:${ownerId}:${slot}`)));
  const n = ((sig[0] << 24) | (sig[1] << 16) | (sig[2] << 8) | sig[3]) >>> 0;
  return String(n % 1_000_000).padStart(6, '0');
}

export async function emailCode(owner: { id: string; email: string }) {
  if (!adminEnabled()) throw new CloudflareAdminError('Add the CF_ADMIN_TOKEN secret first.');
  const code = await codeFor(owner.id, Math.floor(Date.now() / SLOT));
  const sent = await sendEmail(owner.email, `UniVerse: your code is ${code}`,
    `<p>Your code to change Cloudflare settings from the owner console is <b style="font-size:20px">${code}</b>.</p><p>It works for about 10 minutes. If you didn't ask for it, someone may be using your owner sign-in: sign out everywhere and change your email password.</p>`,
    `Your code to change Cloudflare settings from the owner console is ${code}. It works for about 10 minutes. If you didn't ask for it, someone may be using your owner sign-in.`);
  if (!sent) throw new CloudflareAdminError('The code email could not be sent (check RESEND_API_KEY).');
}

async function checkCode(ownerId: string, code: unknown) {
  const f = fails.get(ownerId);
  if (f && f.until > Date.now()) throw new CloudflareAdminError('Too many wrong codes. Try again in 15 minutes.');
  const slot = Math.floor(Date.now() / SLOT);
  const given = String(code ?? '').replace(/\D/g, '');
  // This slot or the one before: a code works for 10 to 20 minutes.
  if (given.length === 6 && (given === (await codeFor(ownerId, slot)) || given === (await codeFor(ownerId, slot - 1)))) {
    fails.delete(ownerId);
    return;
  }
  const n = (f && f.until > Date.now() - 15 * 60_000 ? f.n : 0) + 1;
  fails.set(ownerId, { n, until: n >= 5 ? Date.now() + 15 * 60_000 : 0 });
  throw new CloudflareAdminError('That code is wrong or too old. Ask for a new one.');
}

async function tellOwner(email: string, what: string) {
  await sendEmail(email, 'UniVerse: Cloudflare was changed', `<p>From the owner console: ${escapeHtml(what)}.</p><p>If this wasn't you, sign out everywhere, change your email password and delete CF_ADMIN_TOKEN in Cloudflare.</p>`,
    `From the owner console: ${what}. If this wasn't you, sign out everywhere, change your email password and delete CF_ADMIN_TOKEN in Cloudflare.`).catch(() => false);
}

// ─── What the owner can do ──────────────────────────────────────────────────────────────────

type Owner = { id: string; email: string };

/** Puts an earlier version of the site live (for when a new update breaks something). */
export async function rollback(owner: Owner, versionId: unknown, code: unknown) {
  const id = String(versionId ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new CloudflareAdminError('Unknown version.');
  await checkCode(owner.id, code);
  await cf('POST', '/deployments', { strategy: 'percentage', versions: [{ version_id: id, percentage: 100 }], annotations: { 'workers/message': 'Rolled back from the owner console' } });
  await tellOwner(owner.email, `the live site was rolled back to version ${id.slice(0, 8)}`);
  return `Version ${id.slice(0, 8)} is live`;
}
