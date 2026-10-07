import { route } from '@/server/assignments';
import { changeFolder } from '@/server/space-files';

type Ctx = { params: Promise<{ id: string }> };
// A folder in a space's files hub (Stage 4 · 3.7): PATCH { name } renames it; DELETE (empty only).
export const PATCH = (req: Request, { params }: Ctx) => route(req, async (user) => changeFolder((await params).id, user, await req.json().catch(() => ({}))));
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => changeFolder((await params).id, user, null));
