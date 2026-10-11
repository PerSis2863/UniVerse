import { route } from '@/server/assignments';
import { changeAutomation } from '@/server/tasks';

// One automation (Stage 5 · B9.10). PATCH { enabled }; DELETE.
type Ctx = { params: Promise<{ id: string }> };
export const PATCH = (req: Request, { params }: Ctx) => route(req, async (user) => changeAutomation((await params).id, user, (await req.json().catch(() => ({}))) as Record<string, unknown>));
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => changeAutomation((await params).id, user, null));
