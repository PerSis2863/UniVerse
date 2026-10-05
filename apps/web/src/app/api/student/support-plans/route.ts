import { route } from '@/server/assignments';
import { myPlans } from '@/server/support-plans';

// GET: study plans my teachers made for me (shown in the Study planner).
export const GET = (req: Request) => route(req, async (user) => ({ plans: await myPlans(user.id) }));
