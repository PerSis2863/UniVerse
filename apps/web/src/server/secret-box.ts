import prisma from '@/lib/db';

// Secrets a school saves in UniVerse (its own Razorpay and Stripe keys), encrypted before they go in
// the database: AES-256-GCM with a key derived (HKDF-SHA-256) from the Worker's SESSION_SECRET, so a
// copy of the database alone doesn't give anyone the keys. Stored as "enc:v1:<iv>.<ciphertext>"
// (base64url). A value without that prefix is an older plain one: still read, and encrypted by the
// daily jobs (daily-jobs.ts `seal-secrets`). If SESSION_SECRET changes, saved keys can't be read
// any more and the school enters them again (Admin → Payments says so); payments then stop rather
// than fall back to the site's own keys (payments/provider.ts).

const PREFIX = 'enc:v1:';
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64url');
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'));

// The derived key, once made (the finished key only: nothing pending is shared between requests).
let cached: { secret: string; key: CryptoKey } | null = null;
async function key(): Promise<CryptoKey | null> {
  const secret = process.env.SESSION_SECRET ?? '';
  if (secret.length < 32) return null;
  if (cached?.secret === secret) return cached.key;
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'HKDF', false, ['deriveKey']);
  const derived = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('universe/secret-box'), info: new TextEncoder().encode('school payment keys v1') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
  cached = { secret, key: derived };
  return derived;
}

export const isSealed = (v: string | null | undefined) => !!v && v.startsWith(PREFIX);
/** Whether secrets can be encrypted here (SESSION_SECRET of 32+ characters is set). */
export const canSeal = () => (process.env.SESSION_SECRET ?? '').length >= 32;

/**
 * Encrypts a secret for the database. `context` names where it's kept ("<school id>:<field>"): it's
 * bound to the value, so a sealed key copied to another school or field doesn't open. Throws when
 * SESSION_SECRET isn't set: never stored plain.
 */
export async function seal(plain: string, context: string): Promise<string> {
  const k = await key();
  if (!k) throw new Error('SESSION_SECRET is not set, so secrets can’t be stored safely.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const out = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(context) }, k, new TextEncoder().encode(plain)));
  return `${PREFIX}${b64(iv)}.${b64(out)}`;
}

/** The secret from the database: decrypted, an older plain value as it is, or null (empty, or unreadable: SESSION_SECRET changed, or moved from another `context`). */
export async function open(stored: string | null | undefined, context: string): Promise<string | null> {
  if (!stored) return null;
  if (!isSealed(stored)) return stored;
  const k = await key();
  const [iv, data] = stored.slice(PREFIX.length).split('.');
  if (!k || !iv || !data) return null;
  try {
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: new TextEncoder().encode(context) }, k, unb64(data)));
  } catch {
    return null;
  }
}

/** The daily step: schools' payment secrets saved before encryption are encrypted (a few at a time). */
export async function sealOldSecrets(): Promise<{ done: boolean; info: number }> {
  if (!canSeal()) return { done: true, info: 0 };
  // Set, not empty, and not encrypted yet.
  const plain = { notIn: [''], not: { startsWith: PREFIX } };
  const orgs = await prisma.organization.findMany({
    where: { OR: [{ razorpayKeySecret: plain }, { stripeSecretKey: plain }, { razorpayWebhookSecret: plain }, { stripeWebhookSecret: plain }] },
    select: { id: true, razorpayKeySecret: true, stripeSecretKey: true, razorpayWebhookSecret: true, stripeWebhookSecret: true },
    take: 20,
  });
  let sealed = 0;
  for (const o of orgs) {
    const data: Record<string, string> = {};
    for (const k of ['razorpayKeySecret', 'stripeSecretKey', 'razorpayWebhookSecret', 'stripeWebhookSecret'] as const) {
      const v = o[k];
      if (v && !isSealed(v)) data[k] = await seal(v, `${o.id}:${k}`);
    }
    if (Object.keys(data).length) { await prisma.organization.update({ where: { id: o.id }, data }); sealed++; }
  }
  return { done: orgs.length < 20, info: sealed };
}
