import type { Body } from './body';

/**
 * Copies only the allowed keys from an untrusted request body (undefined values are dropped).
 * Use it before passing request data to Prisma so clients can't set fields like `status`,
 * `isVerified` or another user's id.
 *
 * Name the Prisma input it feeds (`pick<Prisma.CourseUncheckedUpdateInput>(body, [...])`): the keys
 * are checked against the model, and the result has the model's field types. The values are the
 * client's, so Prisma rejects any of the wrong type when the query runs.
 */
export function pick<T extends object>(body: Body | null | undefined, keys: readonly (keyof T & string)[]): Partial<T> {
  const out: Partial<Record<string, unknown>> = {};
  if (!body || typeof body !== 'object') return out as Partial<T>;
  for (const k of keys) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out as Partial<T>;
}
