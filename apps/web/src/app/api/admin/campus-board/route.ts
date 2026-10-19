import { route } from '@/server/assignments';
import { moderateListing, reportedListings } from '@/server/campus-board';

// Stage 5 · Q17 (admins): reported campus board posts. PATCH { id, action: restore | hide }
export const GET = (req: Request) => route(req, (user) => reportedListings(user));
export const PATCH = (req: Request) => route(req, async (user) => moderateListing(user, await req.json().catch(() => ({}))));
