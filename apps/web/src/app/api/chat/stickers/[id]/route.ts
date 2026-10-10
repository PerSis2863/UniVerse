import { route } from '@/server/assignments';
import { packAction } from '@/server/stickers';

// One sticker pack (Stage 5 · B7.2). POST { action: add | remove | rename | delete, … }.
type Ctx = { params: Promise<{ id: string }> };
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => packAction(user, (await params).id, (await req.json().catch(() => ({}))) as Record<string, unknown>));
