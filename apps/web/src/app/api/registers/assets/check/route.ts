import { route } from '@/server/assignments';
import { stockCheck } from '@/server/registers';

// A stock check (Stage 5 · B15.5). POST { tags, location? }: marks scanned items seen; lists what's missing from that place.
export const POST = (req: Request) => route(req, async (user) => stockCheck(user, await req.json().catch(() => ({}))));
