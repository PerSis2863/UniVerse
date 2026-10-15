import { route } from '@/server/assignments';
import type { Body } from '@/server/body';
import { setAccommodation } from '@/server/accommodations';

// A student's extra days and extra time, used in every course (src/server/accommodations.ts):
// POST { studentId, extraDays, extraTimePct, note? }.

type Ctx = { params: Promise<{ id: string }> };

export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => setAccommodation((await params).id, user, ((await req.json().catch(() => ({}))) ?? {}) as Body, req));
