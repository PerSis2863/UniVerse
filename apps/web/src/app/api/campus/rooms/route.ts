import { route } from '@/server/assignments';
import { roomStatuses } from '@/server/campus-life';

// GET ?date=YYYY-MM-DD&min=<minutes after midnight>&dow=<0 Mon … 6 Sun> (the device's local time):
// whether each room is free now, and when that changes (upgrade 7).
export const GET = (req: Request) => route(req, async () => {
  const q = new URL(req.url).searchParams;
  return roomStatuses(q.get('date') ?? '', Number(q.get('min')), Number(q.get('dow')));
});
