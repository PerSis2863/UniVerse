import { route } from '@/server/assignments';
import { deleteTask, updateTask } from '@/server/tasks';

type Ctx = { params: Promise<{ tid: string }> };
// PATCH { title?, notes?, assigneeId?, dueAt?, listId?, position?, checklist?, done? }; DELETE.
export const PATCH = (req: Request, { params }: Ctx) => route(req, async (user) => updateTask((await params).tid, user, await req.json().catch(() => ({}))));
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => deleteTask((await params).tid, user));
