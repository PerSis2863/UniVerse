import { createLocalJWKSet, type JSONWebKeySet } from 'jose';

// Public signing keys (JWKS) of Google (Firebase sign-in) and of LMSs (LTI), cached per Worker
// instance. Only the downloaded keys are shared between requests — never a download in progress:
// on Workers a request can't wait on a fetch started by another request (it logs "A promise was
// resolved or rejected from a different request context" and the waiting request can hang until
// the runtime cancels it). jose's createRemoteJWKSet shares its pending fetch, which caused exactly
// that when several requests arrived together on a fresh instance.

const cache = new Map<string, { keys: JSONWebKeySet; at: number }>();
const MAX_AGE_MS = 10 * 60_000;

/** A key set for `url`: from the cache, or downloaded by this request. `fresh` forces a download. */
export async function jwksFor(url: string, fresh = false) {
  const hit = cache.get(url);
  if (hit && !fresh && Date.now() - hit.at < MAX_AGE_MS) return createLocalJWKSet(hit.keys);
  const res = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Couldn't download signing keys (${res.status})`);
  const keys = (await res.json()) as JSONWebKeySet;
  if (!Array.isArray(keys?.keys)) throw new Error('The signing key set is invalid');
  cache.set(url, { keys, at: Date.now() });
  return createLocalJWKSet(keys);
}

/** jose errors that mean the keys may have changed (worth downloading them again once). */
export const keysMayHaveRotated = (e: unknown) => {
  const code = (e as { code?: string })?.code;
  return code === 'ERR_JWKS_NO_MATCHING_KEY' || code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED';
};
