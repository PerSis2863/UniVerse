import { route } from '@/server/assignments';
import { deleteTime } from '@/server/tasks';

// M230: take back a time entry.
type Ctx = { params: Promise<{ id: string }> };
export const DELETE = (req: Request, { params }: Ctx) => route(req, async (user) => deleteTime((await params).id, user));
