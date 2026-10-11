import { route } from '@/server/assignments';
import { createFileLink } from '@/server/space-files';

type Ctx = { params: Promise<{ fid: string }> };
// A share link to a file that expires (Stage 5 · B9.13).
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => createFileLink((await params).fid, user, await req.json().catch(() => ({}))));
