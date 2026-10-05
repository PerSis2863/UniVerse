import { route } from '@/server/assignments';
import { cancelScheduled } from '@/server/scheduled-calls';

// DELETE: cancel a scheduled call (whoever scheduled it, the class's teacher, or an admin).
export const DELETE = (req: Request, { params }: { params: Promise<{ sid: string }> }) =>
  route(req, async (user) => cancelScheduled(user, (await params).sid));
