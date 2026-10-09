import { route } from '@/server/assignments';
import { childRegisters } from '@/server/registers';

// A linked child's bus, hostel room and equipment, for the parent app (Stage 5 · B15.5). GET ?studentId=.
export const GET = (req: Request) => route(req, (user) => childRegisters(user, new URL(req.url).searchParams.get('studentId')));
