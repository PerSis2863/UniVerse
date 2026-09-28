/**
 * Copies only the allowed keys from an untrusted request body (undefined values are dropped).
 * Use it before passing request data to Prisma so clients can't set fields like `status`,
 * `isVerified` or another user's id.
 */
export function pick<T extends Record<string, any>, K extends string>(body: T | null | undefined, keys: readonly K[]): Partial<Record<K, any>> {
  const out: Partial<Record<K, any>> = {};
  if (!body || typeof body !== 'object') return out;
  for (const k of keys) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}
