import { route } from '@/server/assignments';
import { clubCarbon, deleteCarbon, logCarbon } from '@/server/club-carbon';

// Stage 5 · Q16: the club's carbon tracker. GET · POST { activity, quantity, note?, occurredAt? } · DELETE ?entry=
type Ctx = { params: Promise<{ id: string }> };
export const GET = (req: Request, { params }: Ctx) => route(req, async (user) => clubCarbon(user, (await params).id));
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => logCarbon(user, (await params).id, await req.json().catch(() => ({}))));
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => deleteCarbon(user, (await params).id, new URL(req.url).searchParams.get('entry') ?? ''));
