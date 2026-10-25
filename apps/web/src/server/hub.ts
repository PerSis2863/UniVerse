import prisma from '@/lib/db';
import type { SessionUser } from '@/lib/server-auth';

// The hub of UniVerse Impact (src/app/(dashboard)/hub): one number for what each app has changed so
// far, and the same for the person looking, when they've used it.

type Row = Record<string, unknown>;
const N = (v: unknown) => Number(v ?? 0) || 0;
const one = async (sql: string, ...args: unknown[]) => N((await prisma.$queryRawUnsafe<Row[]>(sql, ...args).catch(() => [] as Row[]))[0]?.n);

export async function hubStats(u: SessionUser) {
  const [courses, enrolled, scans, points, helped, helpedMine, kg, kgMine, games, gamesMine, people] = await Promise.all([
    one(`SELECT COUNT(*) AS n FROM courses`),
    one(`SELECT COUNT(*) AS n FROM enrollments WHERE studentId = ?`, u.id),
    one(`SELECT COUNT(*) AS n FROM trace_scans`),
    one(`SELECT COALESCE(SUM(points), 0) AS n FROM trace_points WHERE userId = ?`, u.id),
    one(`SELECT COALESCE(SUM(people), 0) AS n FROM relief_posts WHERE status = 'DONE'`),
    one(`SELECT COALESCE(SUM(people), 0) AS n FROM relief_posts WHERE status = 'DONE' AND helperId = ?`, u.id),
    one(`SELECT COALESCE(SUM(co2Kg), 0) AS n FROM green_actions`),
    one(`SELECT COALESCE(SUM(co2Kg), 0) AS n FROM green_actions WHERE userId = ?`, u.id),
    one(`SELECT COUNT(*) AS n FROM game_scores`),
    one(`SELECT COUNT(*) AS n FROM game_scores WHERE userId = ?`, u.id),
    prisma.user.count(),
  ]);
  return {
    apps: {
      campus: { value: courses, label: 'courses running', mine: enrolled ? { value: enrolled, label: 'courses' } : null },
      trace: { value: scans, label: 'products checked', mine: points ? { value: points, label: 'points earned' } : null },
      relief: { value: helped, label: 'people helped', mine: helpedMine ? { value: helpedMine, label: 'people helped' } : null },
      green: { value: Math.round(kg), label: 'kg CO₂ saved', mine: kgMine ? { value: Math.round(kgMine), label: 'kg CO₂ saved' } : null },
      play: { value: games, label: 'games played', mine: gamesMine ? { value: gamesMine, label: 'games played' } : null },
    },
    total: { people },
  };
}
