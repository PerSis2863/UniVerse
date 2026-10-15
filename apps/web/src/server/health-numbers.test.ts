import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

// The owner console's Health numbers run raw SQL, and each query falls back to "nothing" when it
// fails (so one broken table can't blank the whole tab). That also hides a wrong query, so this runs
// them against a real SQLite database made by every migration, with known rows, and checks the sums.
type Sqlite = { exec(sql: string): void; prepare(sql: string): { all(...params: unknown[]): unknown[]; run(...params: unknown[]): unknown } };
const db = vi.hoisted(() => {
  const { DatabaseSync } = (process as unknown as { getBuiltinModule(id: string): { DatabaseSync: new (path: string) => Sqlite } }).getBuiltinModule('node:sqlite');
  return new DatabaseSync(':memory:');
});
vi.mock('@/lib/db', () => ({
  default: { $queryRawUnsafe: (sql: string, ...params: unknown[]) => Promise.resolve(db.prepare(sql).all(...params)) },
}));

import { healthNumbers } from './health-numbers';

const NOW = Date.parse('2026-10-15T12:00:00Z');
const at = (iso: string) => Math.floor(Date.parse(iso) / 1000);
// Dates the way Prisma writes them in D1.
const text = (iso: string) => new Date(iso).toISOString().replace('Z', '+00:00');

function seed() {
  const dir = new URL('../../prisma/migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(file, dir), 'utf8'));
  db.exec('PRAGMA foreign_keys = OFF');
  const timing = db.prepare('INSERT INTO api_timings (route, method, status, ms, weight, at) VALUES (?, ?, ?, ?, ?, ?)');
  // Yesterday: three server errors on one route, one on another (every 5xx is kept, weight 1).
  for (const h of ['08', '09', '10']) timing.run('/api/chat/:id/messages', 'POST', 500, 80, 1, at(`2026-10-14T${h}:00:00Z`));
  timing.run('/api/docs/:id', 'GET', 503, 40, 1, at('2026-10-14T11:00:00Z'));
  // Today, a sampled route (weight 20): 120, 1500 and 300 ms.
  for (const ms of [120, 1500, 300]) timing.run('/api/docs', 'GET', 200, ms, 20, at('2026-10-15T09:00:00Z'));
  // Two samples only: not enough to rank as slow.
  for (const ms of [4000, 4000]) timing.run('/api/rare', 'GET', 200, ms, 20, at('2026-10-15T09:00:00Z'));
  // Older than a week: left out.
  timing.run('/api/old', 'GET', 500, 10, 1, at('2026-10-01T09:00:00Z'));

  const report = db.prepare('INSERT INTO error_reports (id, fingerprint, source, kind, message, path, count, lastSeen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  report.run('e1', 'f1', 'CLIENT', 'error', 'boom', '/student', 4, text('2026-10-14T10:00:00Z'));
  report.run('e2', 'f2', 'CLIENT', 'error', 'bang', '/student', 1, text('2026-10-15T10:00:00Z'));
  report.run('e3', 'f3', 'SERVER', 'error', 'old', '/teacher', 9, text('2026-09-01T10:00:00Z'));

  const use = db.prepare('INSERT INTO ai_uses (id, userId, kind, createdAt) VALUES (?, ?, ?, ?)');
  use.run('u1', 'x', 'tutor', text('2026-10-14T10:00:00Z'));
  use.run('u2', 'x', 'tutor', text('2026-10-15T10:00:00Z'));
  use.run('u3', 'x', 'writing', text('2026-10-15T10:00:00Z'));
  use.run('u4', 'x', 'writing', text('2026-09-01T10:00:00Z'));
  db.exec(`INSERT INTO ai_usage (day, userId, calls) VALUES ('2026-10-15', '*', 7), ('2026-10-14', '*', 3), ('2026-10-15', 'someone', 99)`);

  db.exec(`INSERT INTO health_counts (day, key, n) VALUES ('2026-10-15', 'push.ok', 5), ('2026-10-14', 'push.ok', 2), ('2026-10-15', 'push.failed', 1), ('2026-10-15', 'push.expired', 3), ('2026-10-15', 'other', 50)`);

  const stat = db.prepare('INSERT INTO call_stats (id, callId, userId, type, mode, setupMs, worstLoss, relay, audioOnly, failure, rating, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  stat.run('s1', 'c1', 'a', 'video', 'mesh', 800, 0.02, 1, 0, null, 5, text('2026-10-14T10:00:00Z'));
  stat.run('s2', 'c1', 'b', 'video', 'mesh', 1200, 0.1, 0, 1, 'ice', 3, text('2026-10-15T10:00:00Z'));
}

describe('health numbers', () => {
  it('adds up failures, speed, problems, AI, push and calls from the real tables', async () => {
    seed();
    const h = await healthNumbers(NOW);

    expect(h.since).toBe('2026-10-01T09:00:00.000Z');
    expect(h.failedYesterday.map((r) => [r.route, r.method, r.failedYesterday])).toEqual([
      ['/api/chat/:id/messages', 'POST', 3],
      ['/api/docs/:id', 'GET', 1],
    ]);
    expect(h.failing.map((r) => r.route)).toEqual(['/api/chat/:id/messages', '/api/docs/:id']);

    // Only routes with 3+ samples are ranked; average, slowest and the share over 1 s.
    expect(h.slowest).toHaveLength(1);
    expect(h.slowest[0]).toMatchObject({ route: '/api/docs', samples: 3, avgMs: 640, maxMs: 1500, requests: 60 });
    expect(h.slowest[0].slowShare).toBeCloseTo(1 / 3);
    expect(h.busiest[0]).toMatchObject({ route: '/api/docs', requests: 60 });

    expect(h.pages).toEqual([{ path: '/student', source: 'CLIENT', problems: 2, times: 5 }]);

    expect(h.ai.perFeature).toEqual([{ kind: 'tutor', uses: 2 }, { kind: 'writing', uses: 1 }]);
    expect(h.ai.perDay).toHaveLength(7);
    expect(h.ai.perDay.at(-1)).toEqual({ day: '2026-10-15', calls: 7 });
    expect(h.ai.perDay.at(-2)).toEqual({ day: '2026-10-14', calls: 3 });
    expect(h.ai.perDay[0]).toEqual({ day: '2026-10-09', calls: 0 });

    expect(h.push).toEqual({ ok: 7, failed: 1, expired: 3 });

    expect(h.calls).toMatchObject({ calls: 1, people: 2, worstLoss: 0.1, relayShare: 0.5, failedShare: 0.5, audioOnlyShare: 0.5, setupMs: 1000, rating: 4 });
    expect(h.calls!.avgLoss).toBeCloseTo(0.06);
  });
});
