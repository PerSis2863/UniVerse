import type { Router } from '../router';
import prisma from '@/lib/db';
import schema from '../owner-schema.json';

// Owner console → Database: what is stored in the real database. Every table with its number of
// records, how many were added today and this week, when the last one was added, and records added
// per day for the last two weeks. Tables are counted five per statement (UNION ALL; D1 allows at
// most five parts), all at once.

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
const chunks = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, i * size + size));
const areaOf = (name: string) => AREAS.find(([re]) => re.test(name))?.[1] ?? 'Campus & other';

export default function ownerDatabaseModule(router: Router) {
  const r = router.controller('owner', { owner: true });

  r.get('database', async () => {
    const now = Date.now();
    const iso = (ms: number) => new Date(ms).toISOString();
    const day = iso(now - 86_400_000);
    const week = iso(now - 7 * 86_400_000);
    const twoWeeks = iso(now - 14 * 86_400_000);
    // Dates are written by this code, never by a person, so they can go straight into the SQL.
    const counts = MODELS.map((m) =>
      dated(m)
        ? `SELECT '${m.name}' AS model, COUNT(*) AS rows, SUM("createdAt" > '${day}') AS today, SUM("createdAt" > '${week}') AS week, MAX("createdAt") AS lastAdded FROM "${m.table}"`
        : `SELECT '${m.name}' AS model, COUNT(*) AS rows, NULL AS today, NULL AS week, NULL AS lastAdded FROM "${m.table}"`,
    );
    const perDay = MODELS.filter(dated)
      .map((m) => `SELECT '${m.name}' AS model, substr("createdAt", 1, 10) AS day, COUNT(*) AS added FROM "${m.table}" WHERE "createdAt" > '${twoWeeks}' GROUP BY day`);
    const run = async <T,>(parts: string[]) => (await Promise.all(chunks(parts, 5).map((c) => prisma.$queryRawUnsafe<T[]>(c.join(' UNION ALL '))))).flat();
    const [rows, daily, guard] = await Promise.all([
      run<{ model: string; rows: number | bigint; today: number | bigint | null; week: number | bigint | null; lastAdded: string | null }>(counts),
      run<{ model: string; day: string; added: number | bigint }>(perDay),
      prisma.usageGuard.findUnique({ where: { id: 'main' }, select: { meters: true, checkedAt: true } }).catch(() => null),
    ]);
    const n = (v: number | bigint | null | undefined) => (v == null ? null : Number(v));
    const tables = rows
      .map((x) => ({ name: x.model, area: areaOf(x.model), rows: n(x.rows) ?? 0, today: n(x.today), week: n(x.week), lastAdded: x.lastAdded }))
      .sort((a, b) => b.rows - a.rows);
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
