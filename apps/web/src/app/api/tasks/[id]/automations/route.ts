import { route } from '@/server/assignments';
import { createAutomation, listAutomations } from '@/server/tasks';

// A task board's automations (Stage 5 · B9.10). GET; POST { trigger, listId?, action, userId?, value? }.
type Ctx = { params: Promise<{ id: string }> };
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => listAutomations((await params).id, user));
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => createAutomation((await params).id, user, (await req.json().catch(() => ({}))) as Record<string, unknown>));
