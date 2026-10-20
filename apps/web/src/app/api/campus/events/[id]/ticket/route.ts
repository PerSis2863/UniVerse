import { route } from '@/server/assignments';
import { myTicket } from '@/server/event-tickets';

// Stage 5 · Q17: my signed ticket for an event (shown as a QR code at the door).
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => myTicket(user, (await params).id));
