import { route } from '@/server/assignments';
import { spaceContributions } from '@/server/contributions';

// GET ?days=7|30|90|365: who did what in this space (Stage 4 · 4.3; everyone for whoever runs it, my own part otherwise).
type Ctx = { params: Promise<{ kind: string; id: string }> };
export const GET = (req: Request, { params }: Ctx) =>
  route(req, async (user) => { const { kind, id } = await params; return spaceContributions(kind, id, user, new URL(req.url).searchParams.get('days')); });
