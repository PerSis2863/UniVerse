import { route } from '@/server/assignments';
import { callTicket } from '@/server/calls';

// POST: the WebSocket address for joining (/call-live?call=…&ticket=…, one use within 60 s) and the ICE servers.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => callTicket((await params).id, user));
