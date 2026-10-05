import { route } from '@/server/assignments';
import { deleteClassSession } from '@/server/class-companion';

// DELETE: the course's teacher removes a class session's study pack.
export const DELETE = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => deleteClassSession((await params).id, user));
