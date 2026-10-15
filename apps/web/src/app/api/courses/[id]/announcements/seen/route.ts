import { route } from '@/server/assignments';
import type { Body } from '@/server/body';
import { markSeen } from '@/server/course-announcements';

// A student opened the course board and these announcements were on it: POST { ids } ("seen by 28 of 32").

type Ctx = { params: Promise<{ id: string }> };

export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => markSeen((await params).id, user, (((await req.json().catch(() => ({}))) ?? {}) as Body).ids));
