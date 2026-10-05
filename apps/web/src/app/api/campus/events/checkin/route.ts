import { route } from '@/server/assignments';
import { checkIn } from '@/server/campus-life';

// POST { code }: check in with the code scanned from the organiser's screen.
export const POST = (req: Request) => route(req, async (user) => checkIn(user, (await req.json().catch(() => ({}))).code));
