import { afterEach, describe, expect, it, vi } from 'vitest';

// The spending guard (cloudflare/usage-guard.ts) on Workers Free: today's daily allowances warn the
// owner at 70% and 90% (once each a day), and only files can pause the app. Loaded at run time: the
// file uses Worker-only types the app's type check doesn't have (the shapes used are declared here).
type Meter = { key: string; label: string; used: number | null; limit: number };
type Alert = { level: 'warn' | 'high'; top: Meter; key: string };
type Guard = {
  dailyAlert(meters: Meter[], today: string, last: string | null): Alert | null;
  dailyAlertText(a: Alert, meters: Meter[]): { title: string; body: string };
  checkUsage(env: Record<string, unknown>, now?: Date): Promise<{ summary: string; alert: { title: string; body: string } | null }>;
};
const { checkUsage, dailyAlert, dailyAlertText } = (await import('../../cloudflare/usage-guard' as string)) as Guard;

const meter = (key: string, used: number | null, limit: number): Meter => ({ key, label: key, used, limit });

describe('daily allowance warnings (Workers Free)', () => {
  it('warns at 70%, again at 90%, once each a day', () => {
    const low = [meter('requests', 60_000, 100_000)];
    const warm = [meter('requests', 72_000, 100_000), meter('dbRowsRead', 1_000_000, 5_000_000)];
    const hot = [meter('requests', 91_000, 100_000)];
    expect(dailyAlert(low, '2026-10-14', null)).toBeNull();
    expect(dailyAlert(warm, '2026-10-14', null)).toMatchObject({ level: 'warn', key: '2026-10-14:warn' });
    expect(dailyAlert(warm, '2026-10-14', '2026-10-14:warn')).toBeNull();
    expect(dailyAlert(hot, '2026-10-14', '2026-10-14:warn')).toMatchObject({ level: 'high', key: '2026-10-14:high' });
    expect(dailyAlert(hot, '2026-10-14', '2026-10-14:high')).toBeNull();
    expect(dailyAlert(warm, '2026-10-15', '2026-10-14:high')).toMatchObject({ level: 'warn' }); // a new day
    expect(dailyAlert([meter('requests', null, 100_000)], '2026-10-14', null)).toBeNull(); // unreadable
  });

  it('says which allowance, how far, and what happens at 100%', () => {
    const a = dailyAlert([meter('App requests', 92_500, 100_000), meter('Database rows written', 60_000, 100_000)], '2026-10-14', null)!;
    const t = dailyAlertText(a, [meter('App requests', 92_500, 100_000), meter('Database rows written', 60_000, 100_000)]);
    expect(t.title).toBe("UniVerse is close to today's free Cloudflare limit (93%)");
    expect(t.body).toContain('App requests: 93%');
    expect(t.body).toContain('5:30 AM in India');
    expect(t.body).toContain('Database rows written 60%');
  });
});

// Cloudflare's analytics (GraphQL) answered from a table, and a D1 stand-in that keeps the saved row.
function cloudflare(monthly: Record<string, number>, today: Record<string, number>) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const { query, variables } = JSON.parse(String(init?.body)) as { query: string; variables: { fromDay: string; toDay: string } };
    const u = variables.fromDay === variables.toDay ? today : monthly;
    const sum = (o: Record<string, number>) => [{ sum: o }];
    let data: Record<string, unknown> = {};
    if (query.includes('workersInvocationsAdaptive')) data = { w: sum({ requests: u.requests ?? 0, cpuTimeUs: 0 }) };
    else if (query.includes('durableObjectsInvocationsAdaptiveGroups')) data = { d: sum({ requests: u.liveRequests ?? 0 }) };
    else if (query.includes('durableObjectsPeriodicGroups')) data = { d: sum({ activeTime: 0 }) };
    else if (query.includes('durableObjectsStorageGroups')) data = { d: [{ max: { storedBytes: 0 } }] };
    else if (query.includes('d1AnalyticsAdaptiveGroups')) data = { d: sum({ rowsRead: u.dbRowsRead ?? 0, rowsWritten: u.dbRowsWritten ?? 0 }) };
    else if (query.includes('d1StorageAdaptiveGroups')) data = { d: [] };
    else if (query.includes('r2OperationsAdaptiveGroups')) data = { r: [{ sum: { requests: u.filesWrites ?? 0 }, dimensions: { actionType: 'PutObject' } }] };
    else if (query.includes('r2StorageAdaptiveGroups')) data = { r: [] };
    return new Response(JSON.stringify({ data: { viewer: { accounts: [data] } } }));
  });
}

function d1(prev: Record<string, unknown> | null) {
  const saved: Record<string, unknown>[] = [];
  const db = {
    prepare: (sql: string) => ({
      bind: (...values: unknown[]) => ({
        first: async () => prev,
        run: async () => {
          const cols = [...sql.matchAll(/"(\w+)"/g)].map((m) => m[1]).slice(0, values.length);
          saved.push(Object.fromEntries(cols.map((c, i) => [c, values[i]])));
          return {};
        },
      }),
    }),
  };
  return { db, saved };
}

describe('checkUsage on each plan', () => {
  afterEach(() => vi.unstubAllGlobals());
  const now = new Date('2026-10-14T12:00:00Z');
  // A busy month: 95% of the $5 plan's live requests, which a free account pays nothing for.
  const busyMonth = { requests: 2_000_000, liveRequests: 950_000, dbRowsRead: 1e8, dbRowsWritten: 1e6, filesWrites: 1000 };
  const busyDay = { requests: 75_000, liveRequests: 20_000, dbRowsRead: 1e6, dbRowsWritten: 10_000 };
  const env = (extra: Record<string, unknown>, db: unknown) => ({ DB: db, CF_ACCOUNT_ID: 'acct', CF_USAGE_TOKEN: 'tok', ...extra });

  it('free plan: never paused by the $5 plan figures; warns the owner about today', async () => {
    vi.stubGlobal('fetch', cloudflare(busyMonth, busyDay));
    const { db, saved } = d1({ paused: 0, alerted: null, dailyAlerted: null });
    const r = await checkUsage(env({}, db), now);
    expect(saved[0].paused).toBe(0);
    expect(r.alert?.title).toBe("UniVerse has used 75% of today's free Cloudflare allowance");
    expect(saved[0].dailyAlerted).toBe('2026-10-14:warn');
    expect(JSON.parse(String(saved[0].daily)).meters.find((m: { key: string }) => m.key === 'requests').used).toBe(75_000);
    // Already warned today: no second warning
    const again = d1({ paused: 0, alerted: null, dailyAlerted: '2026-10-14:warn' });
    expect((await checkUsage(env({}, again.db), now)).alert).toBeNull();
  });

  it('paid plan: unchanged, pauses at 90% of the $5 plan; no daily warnings', async () => {
    vi.stubGlobal('fetch', cloudflare(busyMonth, busyDay));
    const { db, saved } = d1({ paused: 0, alerted: null });
    const r = await checkUsage(env({ WORKERS_PAID: 'true' }, db), now);
    expect(saved[0].paused).toBe(1);
    expect(r.alert).toBeNull();
    expect(saved[0].daily).toBeUndefined();
  });
});
