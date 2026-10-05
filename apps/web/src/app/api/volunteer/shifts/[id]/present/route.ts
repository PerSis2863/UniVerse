import { route } from '@/server/assignments';
import { markPresent } from '@/server/volunteering';

// POST { studentId } (admin or teacher): confirm a student was there for the whole shift.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => markPresent(user, (await params).id, (await req.json().catch(() => ({}))).studentId));
