import { route } from '@/server/assignments';
import type { Body } from '@/server/body';
import { wellbeingRequestAction, wellbeingRequests } from '@/server/wellbeing';

// For the school's counsellors (Stage 5 · D13; permission "wellbeing.counsel"): the requests students
// chose to send. POST { id, action: 'seen' | 'close' }.
export const GET = (req: Request) => route(req, (user) => wellbeingRequests(user));
export const POST = (req: Request) => route(req, async (user) => wellbeingRequestAction(user, ((await req.json().catch(() => null)) ?? {}) as Body));
