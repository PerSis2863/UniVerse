import { route } from '@/server/assignments';
import { deleteList, updateList } from '@/server/tasks';

type Ctx = { params: Promise<{ lid: string }> };
// PATCH { title?, position? }; DELETE (its cards go with it).
export const PATCH = (req: Request, { params }: Ctx) => route(req, async (user) => updateList((await params).lid, user, await req.json().catch(() => ({}))));
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => deleteList((await params).lid, user));
