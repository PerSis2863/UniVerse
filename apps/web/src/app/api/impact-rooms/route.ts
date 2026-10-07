import { route } from '@/server/assignments';
import { listRooms } from '@/server/impact-rooms';

// GET: impact rooms (Stage 4 · 4.12), the ones I follow first.
export const GET = (req: Request) => route(req, (user) => listRooms(user));
