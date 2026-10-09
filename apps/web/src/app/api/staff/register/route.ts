import { route } from '@/server/assignments';
import { staffRegister } from '@/server/staff';

// Who's in on a day (Stage 5 · B15.8). GET ?date=. Needs staff.manage.
export const GET = (req: Request) => route(req, (user) => staffRegister(user, new URL(req.url).searchParams.get('date')));
