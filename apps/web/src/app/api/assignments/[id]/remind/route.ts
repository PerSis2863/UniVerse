import { remindMissing, route } from '@/server/assignments';

// POST: tells the students who haven't handed it in, in the app (Stage 5 · Q23; at most every 12 hours).
type Ctx = { params: Promise<{ id: string }> };
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => remindMissing((await params).id, user));
