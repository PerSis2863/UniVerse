import { route } from '@/server/assignments';
import type { Body } from '@/server/body';
import { changeStaff, listStaff } from '@/server/course-staff';

// A course's teaching team (Stage 5 · B2, src/server/course-staff.ts). GET: who's on it.
// POST { action: 'add' | 'role' | 'remove', … }: the teacher changes it; anyone on it can leave.

type Ctx = { params: Promise<{ id: string }> };

export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => listStaff((await params).id, user));

export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => changeStaff((await params).id, user, ((await req.json().catch(() => ({}))) ?? {}) as Body));
