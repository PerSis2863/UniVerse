import { route, setExtension } from '@/server/assignments';

// An extension for one student (src/server/assignments.ts): POST { studentId, dueDate | null, extraAttempts?, note? }.

type Ctx = { params: Promise<{ id: string }> };

export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => setExtension((await params).id, user, (await req.json().catch(() => ({}))) ?? {}, req));
