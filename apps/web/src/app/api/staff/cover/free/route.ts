import { route } from '@/server/assignments';
import { freeTeachers } from '@/server/staff';

// Teachers free to cover a class on a day (Stage 5 · B15.8). GET ?date=&slotId=. Needs staff.manage.
export const GET = (req: Request) => route(req, (user) => { const q = new URL(req.url).searchParams; return freeTeachers(user, q.get('date'), q.get('slotId')); });
