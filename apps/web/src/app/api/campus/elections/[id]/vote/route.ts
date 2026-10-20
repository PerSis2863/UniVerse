import { route } from '@/server/assignments';
import { castVote } from '@/server/club-governance';

// Stage 5 · Q17: a secret vote { choice }; returns the voter's receipt.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => castVote(user, (await params).id, (await req.json().catch(() => ({}))).choice));
