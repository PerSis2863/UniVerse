import { route } from '@/server/assignments';
import { myScale, setScale } from '@/server/grade-scale';

// The school's letter grades and GPA points (src/server/grade-scale.ts): GET; PUT { scale | null } (admins).

export const GET = (req: Request) => route(req, (user) => myScale(user));
export const PUT = (req: Request) => route(req, async (user) => setScale(user, (await req.json().catch(() => ({}))) ?? {}, req));
