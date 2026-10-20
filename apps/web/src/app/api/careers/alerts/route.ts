import { route } from '@/server/assignments';
import { jobAlerts } from '@/server/careers';

// Stage 5 · Q15: alerts for new openings that match my checked skills. GET · POST { on }
export const GET = (req: Request) => route(req, (user) => jobAlerts(user));
export const POST = (req: Request) => route(req, async (user) => jobAlerts(user, await req.json().catch(() => ({}))));
