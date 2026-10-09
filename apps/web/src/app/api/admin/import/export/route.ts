import { route } from '@/server/assignments';
import { exportCsv } from '@/server/bulk-import';

// A CSV export with the same headers the import reads (Stage 5 · B15.7). GET ?kind=students|teachers|courses|enrolments|timetable.
export const GET = (req: Request) => route(req, async (user) => {
  const kind = new URL(req.url).searchParams.get('kind');
  const csv = await exportCsv(user, kind);
  return new Response(`\uFEFF${csv}`, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${kind}-${new Date().toISOString().slice(0, 10)}.csv"`, 'Cache-Control': 'no-store' } });
});
