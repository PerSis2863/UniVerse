import { route } from '@/server/assignments';
import { listConnections } from '@/server/connections';

// GET: every outside service, whether it can be connected here, and mine (M182; src/server/connections.ts).
export const GET = (req: Request) => route(req, (user) => listConnections(user));
