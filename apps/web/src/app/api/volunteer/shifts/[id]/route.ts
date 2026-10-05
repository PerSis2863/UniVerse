import { route } from '@/server/assignments';
import { deleteShift } from '@/server/volunteering';

export const DELETE = (req: Request, { params }: { params: Promise<{ id: string }> }) => route(req, async (user) => deleteShift(user, (await params).id));
