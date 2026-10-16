import { route } from '@/server/assignments';
import { decideExcuse } from '@/server/attendance-plus';

// POST { approve: boolean, note? }: the course's teacher (or an admin) answers an excuse request.
type Ctx = { params: Promise<{ id: string }> };
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => decideExcuse((await params).id, user, (await req.json().catch(() => ({}))) ?? {}));
