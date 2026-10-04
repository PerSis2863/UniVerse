import { route } from '@/server/assignments';
import { roomTicket } from '@/server/code-rooms';

// POST: the WebSocket address for editing together (/code-live?room=…&ticket=…), one use within 60 s.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => roomTicket((await params).id, user));
