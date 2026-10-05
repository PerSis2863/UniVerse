import { route } from '@/server/assignments';
import { checkinCode } from '@/server/campus-life';
import { ForbiddenException } from '@/server/http';

// GET (admin): the check-in code for the next 30 seconds. Signed, never stored.
export const GET = (req: Request, { params }: { params: Promise<{ id: string }> }) =>
  route(req, async (user) => {
    if (user.role !== 'ADMIN') throw new ForbiddenException('Only admins can show the check-in code.');
    return checkinCode((await params).id);
  });
