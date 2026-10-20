import { route } from '@/server/assignments';
import { donationReceipt } from '@/server/donations';

// Stage 5 · Q16: a donation receipt, for the donor and admins.
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => donationReceipt(user, (await params).id));
