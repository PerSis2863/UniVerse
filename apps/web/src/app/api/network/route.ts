import { route } from '@/server/assignments';
import { networkOverview, setNetworkVisible } from '@/server/campus-network';

// The campus network (upgrade 9).
// GET: campuses with counts (no people), my campus, exchange and search setting.
// PATCH { networkVisible }: whether people at partner campuses can find me in search.
export const GET = (req: Request) => route(req, (user) => networkOverview(user));
export const PATCH = (req: Request) => route(req, async (user) => setNetworkVisible(user, ((await req.json().catch(() => ({}))) as { networkVisible?: unknown }).networkVisible));
