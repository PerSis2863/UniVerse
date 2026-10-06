import { route } from '@/server/assignments';
import { recordCallStat } from '@/server/calls';

// POST: how this person's call went (connection numbers only), for the owner console's Calls tab.
export const POST = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => recordCallStat((await params).id, user, await req.json().catch(() => ({}))));
