import { route } from '@/server/assignments';
import { createBoard, overview } from '@/server/tasks';

// GET: my task boards, my open tasks and my courses. POST { title, courseId? }: a new board (src/server/tasks.ts).
export const GET = (req: Request) => route(req, (user) => overview(user));
export const POST = (req: Request) => route(req, async (user) => createBoard(user, await req.json().catch(() => ({}))));
