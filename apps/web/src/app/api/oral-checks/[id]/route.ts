import { route } from '@/server/assignments';
import type { Body } from '@/server/body';
import { deleteOralCheck, oralCheckAction, oralCheckDetail } from '@/server/oral';

// One oral check, for its teacher (Stage 5 · D11). GET: every attempt with the AI's draft scores.
// POST { action: 'confirm' | 'retry' | 'close' | 'open', … }. DELETE: the check and its recordings.
type Ctx = { params: Promise<{ id: string }> };
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => oralCheckDetail(user, (await params).id));
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => oralCheckAction(user, (await params).id, ((await req.json().catch(() => null)) ?? {}) as Body));
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => deleteOralCheck(user, (await params).id));
