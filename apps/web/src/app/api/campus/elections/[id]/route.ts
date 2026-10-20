import { route } from '@/server/assignments';
import { deleteElection } from '@/server/club-governance';

// Stage 5 · Q17: remove an election nobody has voted in (the founder or an admin).
export const DELETE = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => deleteElection(user, (await params).id));
