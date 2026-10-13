import { route } from '@/server/assignments';
import type { Body } from '@/server/body';
import { createChallenge, leagueList } from '@/server/impact-league';

// Impact League (Stage 5 · D14). GET: the challenges I can see and my part in each.
// POST { title, sdg?, summary?, brief? }: admins and teachers start a draft challenge.
export const GET = (req: Request) => route(req, (user) => leagueList(user));
export const POST = (req: Request) => route(req, async (user) => createChallenge(user, ((await req.json().catch(() => null)) ?? {}) as Body));
