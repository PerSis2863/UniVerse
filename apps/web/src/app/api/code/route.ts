import { route } from '@/server/assignments';
import { createRoom, listRooms } from '@/server/code-rooms';

// GET: code rooms in your courses. POST { courseId, title, language }: make one. See src/server/code-rooms.ts.
export const GET = (req: Request) => route(req, (user) => listRooms(user));
export const POST = (req: Request) => route(req, async (user) => createRoom(user, await req.json().catch(() => ({}))));
