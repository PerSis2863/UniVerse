import { route } from '@/server/assignments';
import { addToSpace, listFiles } from '@/server/space-files';

type Ctx = { params: Promise<{ kind: string; id: string }> };
// The space's files hub (Stage 4 · 3.7). GET ?folder=: a folder's contents. POST: a folder or a file.
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => { const p = await params; return listFiles(p.kind, p.id, user, new URL(req.url).searchParams.get('folder')); });
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => { const p = await params; return addToSpace(p.kind, p.id, user, await req.json().catch(() => ({}))); });
