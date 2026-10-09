import { route } from '@/server/assignments';
import { audit } from '@/server/audit';
import { createRoute, routes } from '@/server/registers';

// School bus routes (Stage 5 · B15.5). GET: routes. POST: a new route.
export const GET = (req: Request) => route(req, (user) => routes(user));
export const POST = (req: Request) => route(req, async (user) => {
  const r = await createRoute(user, await req.json().catch(() => ({})));
  audit(user, { action: 'registers.route_added', summary: `Added the bus route “${r.name}”`, targetType: 'transport-route', targetId: r.id }, req);
  return r;
});
