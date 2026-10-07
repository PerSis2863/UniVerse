import { route } from '@/server/assignments';
import { listVersions, saveVersion } from '@/server/docs';

type Ctx = { params: Promise<{ id: string }> };
// GET: saved versions. POST { html, text, name? }: save one (unnamed ones at most every 2 minutes).
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => listVersions((await params).id, user));
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => saveVersion((await params).id, user, await req.json().catch(() => ({}))));
