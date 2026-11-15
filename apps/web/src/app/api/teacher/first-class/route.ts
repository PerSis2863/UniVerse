import { route } from '@/server/assignments';
import { firstClass } from '@/server/first-class';

// GET: a teacher's first-class steps (M196): their newest course, its students and assignments, who joined.
export const GET = (req: Request) => route(req, (user) => firstClass(user));
