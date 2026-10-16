import { route } from '@/server/assignments';
import { gameState, startGame } from '@/server/live-game';

// Live quiz game (src/server/live-game.ts). GET ?courseId= : the teacher's game for a course, or a
// student's current game. POST { courseId, quizId, seconds } : the teacher starts one.

export const GET = (req: Request) => route(req, (user) => gameState(user, new URL(req.url).searchParams.get('courseId')));
export const POST = (req: Request) => route(req, async (user) => startGame(user, (await req.json().catch(() => ({}))) ?? {}));
