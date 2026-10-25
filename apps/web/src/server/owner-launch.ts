import prisma from '@/lib/db';
import { launchSummary, launchTotal } from '@/lib/launch';

// GET /owner/launch (owner only): who really uses each app (src/lib/launch.ts). Real actions of the
// last 30 days: UniVersity enrolments and hand-ins, Trace scans by signed-in people (not the sample
// product) and brands joined, Relief posts and help given, Green actions. People of the console's
// sample world (@sample.universe.test) are left out. Five queries, at most 5,000 rows each.

type Row = { userId: string; at: string };
const REAL = `u.email NOT LIKE '%@sample.universe.test'`;

export async function ownerLaunch() {
  const now = Date.now(), since = new Date(now - 30 * 86_400_000).toISOString().replace('Z', '+00:00');
  // Each `?` is the 30-day start.
  const q = (sql: string) => prisma.$queryRawUnsafe<Row[]>(sql, ...Array(sql.split('?').length - 1).fill(since)).catch(() => [] as Row[]);
  const [campus, trace, relief, green, joined] = await Promise.all([
    q(`SELECT e.studentId AS userId, e.enrolledAt AS at FROM enrollments e JOIN users u ON u.id = e.studentId WHERE e.enrolledAt > ? AND ${REAL}
       UNION ALL SELECT s.studentId, s.submittedAt FROM assignment_submissions s JOIN users u ON u.id = s.studentId WHERE s.submittedAt > ? AND ${REAL} LIMIT 5000`),
    q(`SELECT s.userId AS userId, s.createdAt AS at FROM trace_scans s JOIN users u ON u.id = s.userId LEFT JOIN trace_products p ON p.id = s.productId WHERE s.createdAt > ? AND (p.sample IS NULL OR p.sample = 0) AND ${REAL}
       UNION ALL SELECT m.userId, m.createdAt FROM trace_brand_members m JOIN users u ON u.id = m.userId WHERE m.createdAt > ? AND ${REAL} LIMIT 5000`),
    q(`SELECT p.userId AS userId, p.createdAt AS at FROM relief_posts p JOIN users u ON u.id = p.userId WHERE p.createdAt > ? AND ${REAL}
       UNION ALL SELECT p.helperId, p.takenAt FROM relief_posts p JOIN users u ON u.id = p.helperId WHERE p.takenAt > ? AND ${REAL} LIMIT 5000`),
    q(`SELECT a.userId AS userId, a.createdAt AS at FROM green_actions a JOIN users u ON u.id = a.userId WHERE a.createdAt > ? AND ${REAL} LIMIT 5000`),
    prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(*) AS n FROM users u WHERE u.createdAt > ? AND ${REAL}`, since).catch(() => [] as { n: number }[]),
  ]);
  const rows = (list: Row[]) => list.map((r) => ({ userId: r.userId, at: Date.parse(r.at) }));
  const apps = { campus: rows(campus), trace: rows(trace), relief: rows(relief), green: rows(green) };
  return {
    apps: {
      campus: launchSummary(apps.campus, now), trace: launchSummary(apps.trace, now),
      relief: launchSummary(apps.relief, now), green: launchSummary(apps.green, now),
    },
    signUps: Number(joined[0]?.n ?? 0),
    total: launchTotal([...apps.campus, ...apps.trace, ...apps.relief, ...apps.green]),
  };
}
