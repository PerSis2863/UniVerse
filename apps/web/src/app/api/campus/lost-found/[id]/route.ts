import { route } from '@/server/assignments';
import { deleteLostFound, updateLostFound } from '@/server/campus-life';

type Ctx = { params: Promise<{ id: string }> };
// PATCH { status: OPEN | RESOLVED | HIDDEN (admins) }, DELETE: the person who posted it, or an admin.
export const PATCH = (req: Request, { params }: Ctx) => route(req, async (user) => updateLostFound(user, (await params).id, await req.json().catch(() => ({}))));
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => deleteLostFound(user, (await params).id));
