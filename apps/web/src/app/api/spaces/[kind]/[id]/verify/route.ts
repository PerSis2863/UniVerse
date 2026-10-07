import { route } from '@/server/assignments';
import { verifyContribution } from '@/server/contributions';

// POST { userId, skills: string[], level }: a teacher verifies someone's group work: skill evidence (Stage 4 · 4.3).
type Ctx = { params: Promise<{ kind: string; id: string }> };
export const POST = (req: Request, { params }: Ctx) =>
  route(req, async (user) => { const { kind, id } = await params; return verifyContribution(kind, id, user, await req.json().catch(() => ({}))); });
