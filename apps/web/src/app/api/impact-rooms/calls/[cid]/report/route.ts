import { route } from '@/server/assignments';
import { getCallReport, makeCallReport } from '@/server/impact-rooms';

type Ctx = { params: Promise<{ cid: string }> };
// GET: the call's report for sponsors, with its check. POST: staff make (or remake) it after the call.
export const GET = (req: Request, { params }: Ctx) => route(req, async () => getCallReport((await params).cid));
export const POST = (req: Request, { params }: Ctx) => route(req, async (user) => makeCallReport((await params).cid, user));
