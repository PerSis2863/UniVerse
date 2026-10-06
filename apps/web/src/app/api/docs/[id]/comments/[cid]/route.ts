import { route } from '@/server/assignments';
import { resolveDocComment } from '@/server/docs';

// PATCH { resolved?: boolean, delete?: true }.
export const PATCH = (req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) => route(req, async (user) => { const p = await params; return resolveDocComment(p.id, p.cid, user, await req.json().catch(() => ({}))); });
