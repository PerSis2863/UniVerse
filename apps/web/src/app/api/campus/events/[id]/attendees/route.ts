import { route } from '@/server/assignments';
import { attendees } from '@/server/campus-life';

// GET (admin): who's going, waiting and checked in.
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => attendees(user, (await params).id));
