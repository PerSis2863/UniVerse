import { route } from '@/server/assignments';
import { declineCall } from '@/server/calls';

// POST: turn down a chat call (whoever is waiting in it is told).
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => declineCall((await params).id, user));
