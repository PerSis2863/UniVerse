import { route } from '@/server/assignments';
import { myContactHours, setContactHours } from '@/server/parent-messages';

// The hours a teacher answers parents (Stage 5 · B16.2). GET: mine. POST { open, days, start, end, tz }.
export const GET = (req: Request) => route(req, (user) => myContactHours(user));
export const POST = (req: Request) => route(req, async (user) => setContactHours(user, await req.json().catch(() => ({}))));
