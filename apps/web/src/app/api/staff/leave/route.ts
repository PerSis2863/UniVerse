import { route } from '@/server/assignments';
import { leaveRequests } from '@/server/staff';

// Leave requests (Stage 5 · B15.8). GET ?status=. Needs staff.manage.
export const GET = (req: Request) => route(req, (user) => leaveRequests(user, new URL(req.url).searchParams.get('status')));
