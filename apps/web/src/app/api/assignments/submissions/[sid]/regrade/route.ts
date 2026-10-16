import { route } from '@/server/assignments';
import { requestRegrade } from '@/server/student-assignment';

// A student asks for their grade to be looked at again (src/server/student-assignment.ts): POST { reason }.

type Ctx = { params: Promise<{ sid: string }> };

export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => requestRegrade((await params).sid, user, (await req.json().catch(() => ({}))) ?? {}));
