import { route } from '@/server/assignments';
import { audit } from '@/server/audit';
import { coverNeeds, setCover } from '@/server/staff';

// Cover for absent teachers (Stage 5 · B15.8). GET ?from=&to=: classes missed and who covers them.
// POST { date, slotId, leaveId, coverTeacherId | null, note? }. Needs staff.manage.
export const GET = (req: Request) => route(req, (user) => { const q = new URL(req.url).searchParams; return coverNeeds(user, q.get('from'), q.get('to')); });
export const POST = (req: Request) => route(req, async (user) => {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const out = await setCover(user, b);
  audit(user, { action: 'staff.cover', summary: out.cover ? `${out.cover.name} covers a class on ${String(b.date)}` : `Cleared cover on ${String(b.date)}`, targetType: 'timetable-slot', targetId: String(b.slotId) }, req);
  return out;
});
