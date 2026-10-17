import { route } from '@/server/assignments';
import { fromClassCall } from '@/server/attendance-plus';

// GET ?day=&tz=&threshold=0.5|0.75|0.9: what the day's class call says about each student (nothing is saved).
type Ctx = { params: Promise<{ courseId: string }> };
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => {
  const sp = new URL(req.url).searchParams;
  return fromClassCall((await params).courseId, user, { day: sp.get('day'), tz: sp.get('tz'), threshold: sp.get('threshold') });
});
