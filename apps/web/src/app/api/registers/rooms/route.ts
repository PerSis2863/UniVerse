import { route } from '@/server/assignments';
import { createRooms, rooms } from '@/server/registers';

// Hostel rooms (Stage 5 · B15.5). GET: rooms with residents. POST: a room, or several numbered rooms.
export const GET = (req: Request) => route(req, (user) => rooms(user));
export const POST = (req: Request) => route(req, async (user) => createRooms(user, await req.json().catch(() => ({}))));
