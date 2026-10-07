import { route } from '@/server/assignments';
import { addVersion, deleteSpaceFile, fileDetail, updateSpaceFile } from '@/server/space-files';

type Ctx = { params: Promise<{ fid: string }> };
// One file in a space's files hub (Stage 4 · 3.7). GET: versions and where it's used. POST: a new
// version. PATCH { name?, folderId?, restore? }. DELETE.
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => fileDetail((await params).fid, user));
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => addVersion((await params).fid, user, await req.json().catch(() => ({}))));
export const PATCH = (req: Request, { params }: Ctx) => route(req, async (user) => updateSpaceFile((await params).fid, user, await req.json().catch(() => ({}))));
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => deleteSpaceFile((await params).fid, user));
