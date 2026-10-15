import { route } from '@/server/assignments';
import { changeGroups } from '@/server/assignment-groups';

// Groups for a group assignment (src/server/assignment-groups.ts): POST { action, … }.

type Ctx = { params: Promise<{ id: string }> };

export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => changeGroups((await params).id, user, (await req.json().catch(() => ({}))) ?? {}, req));
