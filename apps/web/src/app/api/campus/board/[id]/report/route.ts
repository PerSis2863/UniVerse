import { route } from '@/server/assignments';
import { reportListing } from '@/server/campus-board';

// Stage 5 · Q17: report a post { reason } (three reports hide it until an admin looks).
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => reportListing(user, (await params).id, (await req.json().catch(() => ({}))).reason));
