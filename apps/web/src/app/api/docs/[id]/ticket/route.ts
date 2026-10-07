import { route } from '@/server/assignments';
import { docTicket } from '@/server/docs';

// POST: a one-time address for writing together live.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => docTicket((await params).id, user));
