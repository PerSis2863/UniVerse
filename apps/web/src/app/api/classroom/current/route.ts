import { route } from '@/server/assignments';
import { currentForStudent } from '@/server/classroom';

// GET: the in-person class the signed-in student is in right now (Stage 5 · D7).
export const GET = (req: Request) => route(req, (user) => currentForStudent(user));
