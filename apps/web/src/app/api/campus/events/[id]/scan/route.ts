import { route } from '@/server/assignments';
import { scanTicket } from '@/server/event-tickets';

// Stage 5 · Q17 (admins at the door): { code } from a ticket's QR; each ticket works once.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => scanTicket(user, (await params).id, (await req.json().catch(() => ({}))).code));
