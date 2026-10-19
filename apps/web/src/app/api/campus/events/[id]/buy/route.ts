import { route } from '@/server/assignments';
import { buyTicket } from '@/server/buy-ticket';

// Stage 5 · Q17: buy a ticket for a paid event (a seat is held while you pay on Stripe's page).
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => buyTicket(user, (await params).id, new URL(req.url).origin));
