// Shared by the light API path (fast-api.ts, fast-chat.ts).

export type Caller = { id: string; name: string; email: string; role: string; demo: boolean };

// Dates as Prisma stores them in D1 ("2026-09-30T21:42:19.500+00:00"), so comparisons line up.
export const dbDate = (ms: number) => new Date(ms).toISOString().replace('Z', '+00:00');
// And back, as the JSON Next.js sends ("…Z"). Rows written by hand may lack the "T" and zone.
export const isoDate = (v: string | null) => (v ? new Date(/[zZ]|[+-]\d\d:\d\d$/.test(v) ? v : `${v.replace(' ', 'T')}Z`).toISOString() : null);
export const parseJson = (v: unknown) => {
  if (typeof v !== 'string') return v ?? null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
};
export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(body, { status, headers });

/** SQLite booleans are 0/1. */
export const bool = (v: unknown) => v === 1 || v === true || v === '1' || v === 'true';
