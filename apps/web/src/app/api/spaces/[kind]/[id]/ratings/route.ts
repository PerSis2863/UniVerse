import { route } from '@/server/assignments';
import { ratePeer } from '@/server/contributions';

// POST { rateeId, score: 1–5, note? }: rate a study-group teammate's part (Stage 4 · 4.3).
type Ctx = { params: Promise<{ kind: string; id: string }> };
export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => { const { kind, id } = await params; return ratePeer(kind, id, user, await req.json().catch(() => ({}))); });
