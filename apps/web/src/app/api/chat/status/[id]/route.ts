import { route } from '@/server/assignments';
import { deleteStatus, viewStatus } from '@/server/chat-status';

type Ctx = { params: Promise<{ id: string }> };
// POST {}: I've seen this status; POST { reaction }: my reaction (Stage 5 · B7.9). DELETE: remove my own status.
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => viewStatus(user, (await params).id, (await req.json().catch(() => ({}))) as Record<string, unknown>));
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => deleteStatus(user, (await params).id));
