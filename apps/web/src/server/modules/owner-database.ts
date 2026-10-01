import type { Router } from '../router';
import prisma from '@/lib/db';
import { selectColumns } from '../table-stats';
import schema from '../owner-schema.json';

// Owner console → Database: what is stored in the real database. Every table with its number of
// records, how many were added today and this week, when the last one was added, and records added
// per day for the last two weeks. Every table is read in a handful of queries (src/server/table-stats.ts):
// D1 on Workers Free allows 50 queries per request.

type Model = { name: string; table: string; fields: { name: string; kind: string; type: string }[] };
const MODELS = (schema.models as Model[]).filter((m) => /^[a-z0-9_]+$/i.test(m.table));
const dated = (m: Model) => m.fields.some((f) => f.name === 'createdAt' && f.type === 'DateTime');

// What each area of the app keeps, to group the tables in plain words.
const AREAS: [RegExp, string][] = [
  [/^(User|LoginEvent|UiEvent|Invitation|RoleApplication|AccountDeletionRequest|PushSubscription|Consent|.*Profile)$/, 'People & accounts'],
  [/^(Conversation|ConversationParticipant|Message|MessageReaction|MessageUserState|MessageTranslation|PollVote|Notification|Announcement)$/, 'Chat & notifications'],
  [/^(Course|Enrollment|Assignment|Submission|Grade|Quiz|Question|QuizAttempt|Attendance|AttendanceRecord|Timetable.*|Lesson|Material|Elective.*|Flashcard.*|Tutor.*|Board.*|Whiteboard.*)$/, 'Learning'],
  [/^(Organization|Ngo.*|NGO.*|Partner.*|Sponsor.*|Project.*|Impact.*|Credential.*|Badge.*|Certification.*|Internship.*|Placement.*|Scholarship.*|Collaboration.*|Mentorship.*)$/, 'Impact & partners'],
  [/^(ErrorReport|AuditLog|OwnerChange|UsageGuard|ServerControl|StoredFile)$/, 'System'],
];
const areaOf = (name: string) => AREAS.find(([re]) => re.test(name))?.[1] ?? 'Campus & other';

export default function ownerDatabaseModule(router: Router) {
  const r = router.controller('owner', { owner: true });

  r.get('database', async () => {
    const now = Date.now();
    const iso = (ms: number) => new Date(ms).toISOString();
    const day = iso(now - 86_400_000);
    const week = iso(now - 7 * 86_400_000);
    const twoWeeks = iso(now - 14 * 86_400_000);
    // Dates are written by this code, never by a person, so they can go straight into the SQL. Each
    // table gives two columns: its numbers, and records added per day for two weeks (both as JSON).
    const got = await selectColumns(MODELS.flatMap((m): [string, string][] => dated(m)
      ? [
          [m.name, `(SELECT json_object('rows', COUNT(*), 'today', SUM("createdAt" > '${day}'), 'week', SUM("createdAt" > '${week}'), 'last', MAX("createdAt")) FROM "${m.table}")`],
          [`${m.name}_days`, `(SELECT json_group_object(d, n) FROM (SELECT substr("createdAt", 1, 10) AS d, COUNT(*) AS n FROM "${m.table}" WHERE "createdAt" > '${twoWeeks}' GROUP BY d))`],
        ]
      : [[m.name, `(SELECT json_object('rows', COUNT(*)) FROM "${m.table}")`]]));
    const guard = await prisma.usageGuard.findUnique({ where: { id: 'main' }, select: { meters: true, checkedAt: true } }).catch(() => null);
    const json = <T,>(v: unknown, empty: T): T => (typeof v === 'string' ? JSON.parse(v) : empty);
    const n = (v: number | null | undefined) => (v == null ? null : Number(v));
    const tables = MODELS
      .map((m) => {
        const x = json<{ rows: number; today?: number | null; week?: number | null; last?: string | null }>(got[m.name], { rows: 0 });
        // SUM over an empty table is NULL: that is 0 added, not "no dates".
        const isDated = dated(m);
        return { name: m.name, area: areaOf(m.name), rows: Number(x.rows), today: isDated ? n(x.today) ?? 0 : null, week: isDated ? n(x.week) ?? 0 : null, lastAdded: x.last ?? null };
      })
      .sort((a, b) => b.rows - a.rows);
    const daily = MODELS.filter(dated).flatMap((m) => Object.entries(json<Record<string, number>>(got[`${m.name}_days`], {})).map(([d, added]) => ({ model: m.name, day: d, added })));
    const days = Array.from({ length: 14 }, (_, i) => iso(now - (13 - i) * 86_400_000).slice(0, 10));
    const added = days.map((d) => ({ day: d, added: daily.filter((x) => x.day === d).reduce((s, x) => s + Number(x.added), 0) }));
    // Database size and reads/writes this billing month come from the spending guard's last check.
    const meters: { key: string; used: number | null; limit: number }[] = guard?.meters ? JSON.parse(guard.meters) : [];
    const meter = (k: string) => meters.find((m) => m.key === k) ?? null;
    return {
      tables,
      totals: { tables: tables.length, rows: tables.reduce((s, t) => s + t.rows, 0), today: tables.reduce((s, t) => s + (t.today ?? 0), 0), week: tables.reduce((s, t) => s + (t.week ?? 0), 0), empty: tables.filter((t) => t.rows === 0).length },
      added,
      busiest: Object.entries(daily.reduce<Record<string, number>>((acc, x) => ((acc[x.model] = (acc[x.model] ?? 0) + Number(x.added)), acc), {}))
        .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count })),
      storage: { size: meter('dbStorage'), reads: meter('dbRowsRead'), writes: meter('dbRowsWritten'), files: meter('filesStorage'), checkedAt: guard?.checkedAt ?? null },
    };
  });
}
