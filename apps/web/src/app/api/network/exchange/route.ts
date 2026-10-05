import { route } from '@/server/assignments';
import { endExchange, exchangeList, setExchange } from '@/server/campus-network';

// Exchange students (admins). GET: the list. PUT { email, campusId, from, until }: send a student on
// exchange (YYYY-MM-DD dates). DELETE ?studentId=: end it.
export const GET = (req: Request) => route(req, (user) => exchangeList(user));
export const PUT = (req: Request) => route(req, async (user) => setExchange(user, await req.json().catch(() => ({}))));
export const DELETE = (req: Request) => route(req, (user) => endExchange(user, new URL(req.url).searchParams.get('studentId') ?? ''));
