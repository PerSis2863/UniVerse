import { route } from '@/server/assignments';
import { clubElections, createElection } from '@/server/club-governance';

// Stage 5 · Q17: a club's elections (results once closed). POST: call one (the founder or an admin).
type Ctx = { params: Promise<{ id: string }> };
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => clubElections(user, (await params).id));
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => createElection(user, (await params).id, await req.json().catch(() => ({}))));
