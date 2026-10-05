import { route } from '@/server/assignments';
import { rsvp } from '@/server/campus-life';

// POST { going: boolean }: take a seat (or a waiting-list place), or give it up.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => rsvp(user, (await params).id, (await req.json().catch(() => ({}))).going === true));
