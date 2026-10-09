import { route } from '@/server/assignments';
import { createRoute, routes } from '@/server/registers';

// School bus routes (Stage 5 · B15.5). GET: routes. POST: a new route.
export const GET = (req: Request) => route(req, (user) => routes(user));
export const POST = (req: Request) => route(req, async (user) => createRoute(user, await req.json().catch(() => ({}))));
