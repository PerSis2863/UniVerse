import { route } from '@/server/assignments';
import { recentCalls } from '@/server/calls';

// GET: my calls in the last 30 days, for the Calls list. See src/server/calls.ts.
export const GET = (req: Request) => route(req, (user) => recentCalls(user));
