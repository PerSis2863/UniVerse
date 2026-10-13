import { route } from '@/server/assignments';
import type { Body } from '@/server/body';
import { challengeDetail, deleteChallenge, leagueAction, updateChallenge } from '@/server/impact-league';

// One Impact League challenge (Stage 5 · D14). GET: the challenge, its people and teams.
// PATCH: organizers change it. POST { action, … }: teams, judging, prizes, credentials
// (src/server/impact-league.ts). DELETE: organizers delete a draft or a challenge with no teams.
type Ctx = { params: Promise<{ id: string }> };
const body = async (req: Request) => ((await req.json().catch(() => null)) ?? {}) as Body;
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => challengeDetail((await params).id, user));
export const PATCH = (req: Request, { params }: Ctx) => route(req, async (user) => updateChallenge((await params).id, user, await body(req)));
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => leagueAction((await params).id, user, await body(req), req));
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => deleteChallenge((await params).id, user));
