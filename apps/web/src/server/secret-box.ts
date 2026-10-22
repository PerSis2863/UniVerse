import prisma from '@/lib/db';

// Secrets a school saves in UniVerse (its own Razorpay and Stripe keys), encrypted before they go in
// the database: AES-256-GCM with a key derived (HKDF-SHA-256) from the Worker's SESSION_SECRET, so a
// copy of the database alone doesn't give anyone the keys. Stored as "enc:v1:<iv>.<ciphertext>"
// (base64url). A value without that prefix is an older plain one: still read, and encrypted by the
// daily jobs (daily-jobs.ts `seal-secrets`). If SESSION_SECRET changes, saved keys can't be read
// any more and the school enters them again (Admin → Payments says so).

const PREFIX = 'enc:v1:';
const b64 = (u: Uint8Array) => Buffer.from(u).toString('base64url');
const unb64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64url'));

let cached: { secret: string; key: Promise<CryptoKey> } | null = null;
function key(): Promise<CryptoKey> | null {
  const secret = process.env.SESSION_SECRET ?? '';
  if (secret.length < 32) return null;
  if (cached?.secret !== secret) {
    cached = {
      secret,
      key: crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'HKDF', false, ['deriveKey']).then((base) =>
        crypto.subtle.deriveKey(
          { name: 'HKDF', hash: 'SHA-256', salt: new TextEncoder().encode('universe/secret-box'), info: new TextEncoder().encode('school payment keys v1') },
          base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
        )),
    };
  }
  return cached.key;
}

export const isSealed = (v: string | null | undefined) => !!v && v.startsWith(PREFIX);
/** Whether secrets can be encrypted here (SESSION_SECRET of 32+ characters is set). */
export const canSeal = () => key() !== null;

/** Encrypts a secret for the database. Throws when SESSION_SECRET isn't set: never stored plain. */
export async function seal(plain: string): Promise<string> {
  const k = key();
  if (!k) throw new Error('SESSION_SECRET is not set, so secrets can’t be stored safely.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const out = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await k, new TextEncoder().encode(plain)));
  return `${PREFIX}${b64(iv)}.${b64(out)}`;
}

/** The secret from the database: decrypted, an older plain value as it is, or null (empty, or unreadable after SESSION_SECRET changed). */
export async function open(stored: string | null | undefined): Promise<string | null> {
  if (!stored) return null;
  if (!isSealed(stored)) return stored;
  const k = key();
  const [iv, data] = stored.slice(PREFIX.length).split('.');
  if (!k || !iv || !data) return null;
  try {
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await k, unb64(data)));
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
      if (v && !isSealed(v)) data[k] = await seal(v);
    }
    if (Object.keys(data).length) { await prisma.organization.update({ where: { id: o.id }, data }); sealed++; }
  }
  return { done: orgs.length < 20, info: sealed };
}
