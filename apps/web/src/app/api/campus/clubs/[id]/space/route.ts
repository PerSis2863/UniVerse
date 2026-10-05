import { route } from '@/server/assignments';
import { clubSpace } from '@/server/campus-life';

// POST: make the club's own space (a Community with its members), or return the existing one.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => clubSpace(user, (await params).id));
