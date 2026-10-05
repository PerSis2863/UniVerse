import { route } from '@/server/assignments';
import { listLostFound, reportLostFound } from '@/server/campus-life';

// GET ?kind=LOST|FOUND&mine=1 (&all=1 for admins), POST { kind, title, description?, location?, photoUrl? }.
export const GET = (req: Request) => route(req, (user) => listLostFound(user, new URL(req.url).searchParams));
export const POST = (req: Request) => route(req, async (user) => reportLostFound(user, await req.json().catch(() => ({}))));
