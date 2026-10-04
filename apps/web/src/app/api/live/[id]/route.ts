import { route } from '@/server/assignments';
import { deletePoll, updatePoll } from '@/server/live';

type Ctx = { params: Promise<{ id: string }> };

// PATCH { status?: 'OPEN' | 'CLOSED', showResults? } / DELETE: the teacher runs the poll.
export const PATCH = (req: Request, { params }: Ctx) => route(req, async (user) => updatePoll(user, (await params).id, await req.json().catch(() => ({}))));
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => deletePoll(user, (await params).id));
