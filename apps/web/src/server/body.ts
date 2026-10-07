// Request data as it arrives: a JSON body and a query string are untrusted, so handlers read them
// through these instead of trusting a type (src/server/router.ts).

/** A parsed JSON (or form) body. */
export type Body = Record<string, unknown>;
/** A parsed query string: repeated keys and `key[]` become arrays. */
export type Query = Record<string, string | string[] | undefined>;

/** True when `v` is one of `allowed` (and narrows it to that union). */
export function oneOf<T extends string>(allowed: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v);
}

/** The string, or undefined for anything else. */
export const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** The string, or '' for anything else (for required text the service checks itself). */
export const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** The strings in an array (other values dropped); [] when it isn't an array. */
export const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** The first value of a query parameter. */
export const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
