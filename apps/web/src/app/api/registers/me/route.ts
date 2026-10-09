import { route } from '@/server/assignments';
import { myRegisters } from '@/server/registers';

// My bus, hostel room and the equipment lent to me (Stage 5 · B15.5).
export const GET = (req: Request) => route(req, (user) => myRegisters(user));
